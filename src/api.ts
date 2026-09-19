import { githubAuth } from '@hono/oauth-providers/github';
import { googleAuth } from '@hono/oauth-providers/google';
import { Hono, type MiddlewareHandler } from 'hono';
import { deleteCookie, getCookie, setCookie } from 'hono/cookie';
import { HTTPException } from 'hono/http-exception';
import {
	avatarOf,
	clearAvatar,
	findAccount,
	type Profile,
	rename,
	setAvatar,
	signIn,
} from './accounts';
import {
	type App,
	type Ctx,
	currentAccount,
	endSession,
	isAdmin,
	issueSession,
	safePath,
	sessionSecret,
} from './auth';
import { roomLocationFromEnv } from './config';
import { toCsv } from './export';
import {
	type Account,
	type Asker,
	type RoomSettings,
	requireEmail,
	requireId,
	requireName,
	requireTarget,
	requireText,
} from './protocol';
import {
	addOperator,
	createRoom,
	deleteRoom,
	findRoom,
	isOperator,
	isScratch,
	listRooms,
	operatorsOf,
	removeOperator,
	SCRATCH_PREFIX,
} from './rooms';

/**
 * One room is one object, saturating near a thousand requests a second, so the
 * audience read comes from the colo cache. Writes are rare enough to go direct.
 */
const AUDIENCE_MAX_AGE = 2;

/** Bounds one request body well above any question a room will store. */
const BODY_MAX = 16 * 1024;

const NO_STORE = { 'cache-control': 'no-store' };

export const api = new Hono<App>();

/** Thrown refusals answer in the same shape as returned ones: json with an `error`. */
function refuse(status: 400 | 401 | 404 | 413 | 415 | 429, message: string): never {
	throw new HTTPException(status, { res: Response.json({ error: message }, { status }) });
}

function fail(cause: unknown): never {
	refuse(400, cause instanceof Error ? cause.message : 'invalid request');
}

/** Keyed by client address: a hall behind one NAT shares a key, so the limits
 * are set for a script from one machine, not for a person. */
async function limited(limiter: RateLimit, c: Ctx) {
	const { success } = await limiter.limit({ key: c.req.header('cf-connecting-ip') ?? 'unknown' });
	if (!success) refuse(429, 'too many from here; wait a moment');
}

function asString(value: unknown, field: string): string {
	if (typeof value !== 'string') fail(new Error(`${field} must be a string`));
	return value as string;
}

function asBoolean(value: unknown, field: string): boolean {
	if (typeof value !== 'boolean') fail(new Error(`${field} must be a boolean`));
	return value as boolean;
}

async function body(c: Ctx): Promise<Record<string, unknown>> {
	const text = await c.req.text();
	if (text.length > BODY_MAX) refuse(413, 'body too large');
	let parsed: unknown;
	try {
		parsed = JSON.parse(text);
	} catch {
		fail(new Error('body must be json'));
	}
	if (typeof parsed !== 'object' || parsed === null) fail(new Error('body must be a json object'));
	return parsed as Record<string, unknown>;
}

/** Anything the object would throw on has to be refused here, or a client
 * typo becomes a 500 and an uncaught exception in the event's logs. */
function checked<T>(parse: () => T): T {
	try {
		return parse();
	} catch (cause) {
		fail(cause);
	}
}

function room(env: Env, roomId: string) {
	const id = checked(() => requireId(roomId, 'roomId'));
	const locationHint = roomLocationFromEnv(env);
	return env.ROOM.getByName(id, locationHint ? { locationHint } : {});
}

/** The registry says which rooms exist; a scratch room always does. */
async function known(env: Env, roomId: string | undefined): Promise<string> {
	const id = checked(() => requireId(roomId ?? '', 'roomId'));
	if (!(await findRoom(env.DB, id))) refuse(404, 'no such room');
	return id;
}

/** A named question carries what the account is called now, read from the
 * cookie and never from the body. */
async function askerFor(c: Ctx, as: unknown): Promise<Asker | null> {
	if (as === undefined || as === 'anonymous') return null;
	if (as !== 'me') fail(new Error("as must be 'me' or 'anonymous'"));
	const account = await currentAccount(c);
	if (!account) refuse(401, 'sign in to ask with your name');
	return { name: account.name, avatar: account.avatar };
}

api.post('/api/rooms/:roomId/questions', async (c) => {
	await limited(c.env.ASK_LIMIT, c);
	const input = await body(c);
	const id = checked(() => requireId(asString(input.id, 'id'), 'id'));
	const text = checked(() => requireText(asString(input.text, 'text')));
	const asker = await askerFor(c, input.as);
	const roomId = await known(c.env, c.req.param('roomId'));

	const result = await room(c.env, roomId).postQuestion({ id, text, asker });
	if ('status' in result) {
		const why = result.status === 'room-closed' ? 'closed to new questions' : 'full';
		return c.json({ error: `this room is ${why}` }, 409);
	}
	return c.json(result, result.created ? 201 : 200);
});

api.put('/api/rooms/:roomId/questions/:questionId/vote', async (c) => {
	await limited(c.env.VOTE_LIMIT, c);
	const input = await body(c);
	const questionId = checked(() => requireId(c.req.param('questionId'), 'questionId'));
	const voterId = checked(() => requireId(asString(input.voterId, 'voterId'), 'voterId'));
	const voted = asBoolean(input.voted, 'voted');
	const roomId = await known(c.env, c.req.param('roomId'));

	const result = await room(c.env, roomId).setVote({
		questionId,
		voterId,
		voted,
	});
	return c.json(result, result.status === 'unknown-question' ? 404 : 200);
});

/** The key drops the query string: appending one would otherwise bust the cache
 * and reach the object. */
api.get('/api/rooms/:roomId/questions', async (c) => {
	const url = new URL(c.req.url);
	const key = new Request(`${url.origin}${url.pathname}`, { method: 'GET' });
	const cache = caches.default;

	let response = await cache.match(key);
	if (!response) {
		const roomId = checked(() => requireId(c.req.param('roomId'), 'roomId'));
		const headers = {
			'content-type': 'application/json',
			'cache-control': `public, max-age=${AUDIENCE_MAX_AGE}`,
		};
		if (await findRoom(c.env.DB, roomId)) {
			const snapshot = await room(c.env, roomId).snapshot({ view: 'audience' });
			response = new Response(JSON.stringify(snapshot), {
				headers: { ...headers, etag: `"${snapshot.version}"` },
			});
		} else {
			// Cached like a snapshot, so a crowd on a mistyped link stays off the registry.
			response = new Response(JSON.stringify({ error: 'no such room' }), { status: 404, headers });
		}
		c.executionCtx.waitUntil(cache.put(key, response.clone()));
	}

	const etag = response.headers.get('etag');
	if (etag && c.req.header('if-none-match') === etag) {
		return new Response(null, {
			status: 304,
			headers: { etag, 'cache-control': `public, max-age=${AUDIENCE_MAX_AGE}` },
		});
	}
	return response;
});

/** Where to send someone back to after the provider; carried in a cookie
 * because the provider hands back only its own parameters. */
const RETURN_TO = 'return-to';

api.use('/auth/:provider{google|github}', async (c, next) => {
	if (!c.req.query('code')) {
		setCookie(c, RETURN_TO, safePath(c.req.query('next')), {
			path: '/auth',
			httpOnly: true,
			sameSite: 'Lax',
			maxAge: 600,
		});
	}
	return next();
});

api.use('/auth/google', async (c, next) => {
	const { GOOGLE_CLIENT_ID: id, GOOGLE_CLIENT_SECRET: secret } = c.env;
	if (!id || !secret || !sessionSecret(c.env)) {
		return c.json({ error: 'signing in with Google is not configured' }, 503);
	}
	return googleAuth({
		client_id: id,
		client_secret: secret,
		scope: ['openid', 'email', 'profile'],
		redirect_uri: `${new URL(c.req.url).origin}/auth/google`,
	})(c, next);
});

api.use('/auth/github', async (c, next) => {
	const { GITHUB_CLIENT_ID: id, GITHUB_CLIENT_SECRET: secret } = c.env;
	if (!id || !secret || !sessionSecret(c.env)) {
		return c.json({ error: 'signing in with GitHub is not configured' }, 503);
	}
	return githubAuth({
		client_id: id,
		client_secret: secret,
		scope: ['read:user', 'user:email'],
		oauthApp: true,
		redirect_uri: `${new URL(c.req.url).origin}/auth/github`,
	})(c, next);
});

async function signedIn(c: Ctx, profile: Profile) {
	const account = await signIn(c.env.DB, profile);
	await issueSession(c, account.id);
	const to = safePath(getCookie(c, RETURN_TO));
	deleteCookie(c, RETURN_TO, { path: '/auth' });
	return c.redirect(to);
}

api.get('/auth/google', (c) => {
	const user = c.get('user-google');
	if (!user?.id) return c.json({ error: 'Google returned no account' }, 502);
	return signedIn(c, {
		provider: 'google',
		providerId: user.id,
		email: user.email ?? null,
		name: user.name ?? user.email ?? 'Someone',
		avatar: user.picture ?? null,
	});
});

api.get('/auth/github', (c) => {
	const user = c.get('user-github');
	if (user?.id === undefined) return c.json({ error: 'GitHub returned no account' }, 502);
	return signedIn(c, {
		provider: 'github',
		providerId: String(user.id),
		email: user.email ?? null,
		name: user.name ?? user.login ?? 'Someone',
		avatar: user.avatar_url ?? null,
	});
});

api.post('/auth/logout', (c) => {
	endSession(c);
	return c.body(null, 204);
});

api.get('/api/me', async (c) => {
	const account = await currentAccount(c);
	if (!account) return c.json({ error: 'not signed in' }, 401);
	return c.json({ account, admin: isAdmin(c.env, account) }, 200, NO_STORE);
});

/** Admins may run every room; anyone else needs their email on it. */
function mayRun(env: Env, roomId: string, account: Account): Promise<boolean> {
	return isAdmin(env, account) ? Promise.resolve(true) : isOperator(env.DB, roomId, account.email);
}

/** Signs the caller in for the handler, or answers in its place. */
async function gate(
	c: Ctx,
	allowed: (account: Account) => Promise<boolean> | boolean,
	denied: string,
): Promise<Response | null> {
	const account = await currentAccount(c);
	if (!account) return c.json({ error: 'sign in first' }, 401);
	if (!(await allowed(account))) return c.json({ error: denied }, 403);
	c.set('account', account);
	return null;
}

const session: MiddlewareHandler<App> = async (c, next) =>
	(await gate(c, () => true, '')) ?? next();

const admin: MiddlewareHandler<App> = async (c, next) =>
	(await gate(c, (account) => isAdmin(c.env, account), 'admins only')) ?? next();

const operator: MiddlewareHandler<App> = async (c, next) => {
	const roomId = await known(c.env, c.req.param('roomId'));
	return (
		(await gate(c, (account) => mayRun(c.env, roomId, account), 'not an operator of this room')) ??
		next()
	);
};

/** The account as it now stands, for the routes that just changed it. */
async function me(c: Ctx) {
	const account = await findAccount(c.env.DB, c.get('account').id);
	return c.json({ account, admin: account ? isAdmin(c.env, account) : false }, 200, NO_STORE);
}

/** The browser resizes first; this bounds what a hand-made request could store. */
const AVATAR_MAX = 256 * 1024;
const AVATAR_TYPES = new Set(['image/webp', 'image/png', 'image/jpeg']);

api.patch('/api/me', session, async (c) => {
	const input = await body(c);
	const name = checked(() => requireName(asString(input.name, 'name')));
	await rename(c.env.DB, c.get('account').id, name);
	return me(c);
});

api.put('/api/me/avatar', session, async (c) => {
	const type = c.req.header('content-type')?.split(';')[0]?.trim().toLowerCase() ?? '';
	if (!AVATAR_TYPES.has(type)) refuse(415, 'the picture must be webp, png or jpeg');
	const bytes = await c.req.arrayBuffer();
	if (bytes.byteLength === 0) fail(new Error('the picture is empty'));
	if (bytes.byteLength > AVATAR_MAX) refuse(413, 'the picture is too large');
	await setAvatar(c.env.DB, c.get('account').id, bytes, type);
	return me(c);
});

api.delete('/api/me/avatar', session, async (c) => {
	await clearAvatar(c.env.DB, c.get('account').id);
	return me(c);
});

api.get('/api/avatars/:userId', async (c) => {
	const picture = await avatarOf(c.env.DB, c.req.param('userId'));
	if (!picture) return c.json({ error: 'no picture' }, 404);
	return c.body(picture.bytes, 200, {
		'content-type': picture.type,
		'cache-control': 'public, max-age=31536000, immutable',
		'x-content-type-options': 'nosniff',
	});
});

api.post('/api/rooms', admin, async (c) => {
	const input = await body(c);
	const id = checked(() => requireId(asString(input.id, 'id'), 'id'));
	if (isScratch(id)) fail(new Error(`${SCRATCH_PREFIX}* is kept for load tests`));

	const created = await createRoom(c.env.DB, id, c.get('account').id);
	if (!created) return c.json({ error: 'that name is taken' }, 409);
	return c.json({ room: created }, 201);
});

api.get('/api/rooms', session, async (c) => {
	const account = c.get('account');
	const rooms = await listRooms(c.env.DB, account.email, isAdmin(c.env, account));
	return c.json({ rooms }, 200, NO_STORE);
});

api.get('/api/rooms/:roomId', async (c) => {
	const id = checked(() => requireId(c.req.param('roomId'), 'roomId'));
	const info = await findRoom(c.env.DB, id);
	if (!info) return c.json({ error: 'no such room' }, 404);
	const account = await currentAccount(c);
	const runs = account ? await mayRun(c.env, id, account) : false;
	return c.json({ room: info, operator: runs }, 200, NO_STORE);
});

/** Anyone may empty a scratch room, which is what load tests need. */
api.delete(`/api/rooms/:roomId{${SCRATCH_PREFIX}[^/]+}`, async (c) => {
	const id = c.req.param('roomId');
	await room(c.env, id).reset();
	return c.json({ reset: id });
});

api.delete('/api/rooms/:roomId', admin, async (c) => {
	const id = checked(() => requireId(c.req.param('roomId'), 'roomId'));
	if (!(await deleteRoom(c.env.DB, id))) return c.json({ error: 'no such room' }, 404);
	await room(c.env, id).reset();
	return c.json({ deleted: id });
});

/** Scratch rooms pass `known` but have no row for operators to hang off. */
async function registered(env: Env, roomId: string | undefined): Promise<string> {
	const id = await known(env, roomId);
	if (isScratch(id)) fail(new Error('scratch rooms have no operators'));
	return id;
}

api.get('/api/rooms/:roomId/operators', admin, async (c) => {
	const id = await registered(c.env, c.req.param('roomId'));
	return c.json({ operators: await operatorsOf(c.env.DB, id) }, 200, NO_STORE);
});

api.put('/api/rooms/:roomId/operators/:email', admin, async (c) => {
	const id = await registered(c.env, c.req.param('roomId'));
	const email = checked(() => requireEmail(c.req.param('email')));
	await addOperator(c.env.DB, id, email, c.get('account').id);
	return c.json({ operators: await operatorsOf(c.env.DB, id) });
});

api.delete('/api/rooms/:roomId/operators/:email', admin, async (c) => {
	const id = await registered(c.env, c.req.param('roomId'));
	await removeOperator(
		c.env.DB,
		id,
		checked(() => requireEmail(c.req.param('email'))),
	);
	return c.json({ operators: await operatorsOf(c.env.DB, id) });
});

function whole(value: string | undefined): number {
	const parsed = Number(value ?? 0);
	if (!Number.isInteger(parsed) || parsed < 0) fail(new Error('since must be a whole number'));
	return parsed;
}

/** Operator screens only: a stream per phone would put the audience back on the object. */
api.get('/api/rooms/:roomId/events', operator, async (c) => {
	const stream = await room(c.env, c.req.param('roomId')).subscribe(whole(c.req.query('since')));
	if (!stream) return c.json({ error: 'this room already has enough live screens' }, 503);

	return new Response(stream, {
		headers: {
			'content-type': 'text/event-stream',
			'cache-control': 'no-store',
			// Nothing in the path should hold a frame back waiting for more.
			'x-accel-buffering': 'no',
		},
	});
});

api.get('/api/rooms/:roomId/export', operator, async (c) => {
	const roomId = c.req.param('roomId');
	const snapshot = await room(c.env, roomId).snapshot({ view: 'operator' });
	return c.body(toCsv(snapshot.questions), 200, {
		'content-type': 'text/csv; charset=utf-8',
		'content-disposition': `attachment; filename="${roomId.replace(/[^a-z0-9-]/gi, '-')}.csv"`,
		...NO_STORE,
	});
});

api.patch('/api/rooms/:roomId/questions/:questionId', operator, async (c) => {
	const input = await body(c);
	const id = checked(() => requireId(c.req.param('questionId'), 'questionId'));
	const status = checked(() => requireTarget(asString(input.status, 'status')));

	const result = await room(c.env, c.req.param('roomId')).setStatus({ id, status });
	return c.json(result, result.status === 'unknown-question' ? 404 : 200);
});

api.patch('/api/rooms/:roomId', operator, async (c) => {
	const input = await body(c);
	if (!('moderated' in input) && !('open' in input)) {
		fail(new Error('body must set moderated or open'));
	}
	const target = room(c.env, c.req.param('roomId'));
	let result: RoomSettings | undefined;
	if ('moderated' in input) {
		result = await target.setModeration(asBoolean(input.moderated, 'moderated'));
	}
	if ('open' in input) result = await target.setOpen(asBoolean(input.open, 'open'));
	return c.json(result);
});

/** Only /auth and /api reach the worker first, so this catches a stray GET on
 * either: an unknown /auth path gets the app, an unknown /api path a 404 rather
 * than a page. */
api.get('*', (c) =>
	c.req.path.startsWith('/api/') ? c.notFound() : c.env.ASSETS.fetch(c.req.raw),
);
