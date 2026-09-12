import { Hono } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { roomLocationFromEnv } from './config';
import { requireId, requireTarget, requireText } from './room';

/**
 * One room is one object, saturating near a thousand requests a second, so the
 * audience read comes from the colo cache. Writes are rare enough to go direct.
 */
const AUDIENCE_MAX_AGE = 2;

type App = { Bindings: Env };

export const api = new Hono<App>();

function fail(cause: unknown): never {
	throw new HTTPException(400, {
		message: cause instanceof Error ? cause.message : 'invalid request',
	});
}

function asString(value: unknown, field: string): string {
	if (typeof value !== 'string') fail(new Error(`${field} must be a string`));
	return value as string;
}

function asBoolean(value: unknown, field: string): boolean {
	if (typeof value !== 'boolean') fail(new Error(`${field} must be a boolean`));
	return value as boolean;
}

async function body(c: {
	req: { json: () => Promise<unknown> };
}): Promise<Record<string, unknown>> {
	const parsed = await c.req.json().catch(() => fail(new Error('body must be json')));
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

api.post('/api/rooms/:roomId/questions', async (c) => {
	const input = await body(c);
	const id = checked(() => requireId(asString(input.id, 'id'), 'id'));
	const text = checked(() => requireText(asString(input.text, 'text')));

	const result = await room(c.env, c.req.param('roomId')).postQuestion({ id, text });
	return c.json(result, result.created ? 201 : 200);
});

api.put('/api/rooms/:roomId/questions/:questionId/vote', async (c) => {
	const input = await body(c);
	const questionId = checked(() => requireId(c.req.param('questionId'), 'questionId'));
	const voterId = checked(() => requireId(asString(input.voterId, 'voterId'), 'voterId'));
	const voted = asBoolean(input.voted, 'voted');

	const result = await room(c.env, c.req.param('roomId')).setVote({
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
		const snapshot = await room(c.env, c.req.param('roomId')).snapshot({ view: 'audience' });
		response = new Response(JSON.stringify(snapshot), {
			headers: {
				'content-type': 'application/json',
				etag: `"${snapshot.version}"`,
				'cache-control': `public, max-age=${AUDIENCE_MAX_AGE}`,
			},
		});
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

/** The prefix is the only guard, so a room an audience uses is out of reach. */
const SCRATCH_PREFIX = 'scratch-';

/** Placeholder gates, not an authentication system: one shared bearer each. */
function bearerMatches(offered: string | undefined, expected: string): boolean {
	const a = new TextEncoder().encode(offered?.replace(/^Bearer /, '') ?? '');
	const b = new TextEncoder().encode(expected);
	return a.byteLength === b.byteLength && crypto.subtle.timingSafeEqual(a, b);
}

api.use('/api/rooms/:roomId/moderator/*', async (c, next) => {
	const expected = c.env.MODERATOR_TOKEN?.trim();
	if (!expected) return c.json({ error: 'moderation is not configured' }, 503);
	if (!bearerMatches(c.req.header('authorization'), expected)) {
		return c.json({ error: 'unauthorized' }, 401);
	}
	return next();
});

api.delete('/api/rooms/:roomId', async (c) => {
	const roomId = c.req.param('roomId');
	if (!roomId.startsWith(SCRATCH_PREFIX)) {
		return c.json({ error: `only ${SCRATCH_PREFIX}* rooms can be emptied` }, 403);
	}

	await room(c.env, roomId).reset();
	return c.json({ reset: roomId });
});

api.get('/api/rooms/:roomId/moderator/questions', async (c) => {
	const since = Number(c.req.query('since') ?? 0);
	if (!Number.isInteger(since) || since < 0) fail(new Error('since must be a whole number'));

	const snapshot = await room(c.env, c.req.param('roomId')).snapshot({ view: 'moderator', since });
	return c.json(snapshot, 200, { 'cache-control': 'no-store' });
});

api.patch('/api/rooms/:roomId/moderator/questions/:questionId', async (c) => {
	const input = await body(c);
	const id = checked(() => requireId(c.req.param('questionId'), 'questionId'));
	const status = checked(() => requireTarget(asString(input.status, 'status')));

	const result = await room(c.env, c.req.param('roomId')).setStatus({ id, status });
	return c.json(result, result.status === 'unknown-question' ? 404 : 200);
});

api.put('/api/rooms/:roomId/moderator/moderation', async (c) => {
	const input = await body(c);
	const result = await room(c.env, c.req.param('roomId')).setModeration(
		asBoolean(input.enabled, 'enabled'),
	);
	return c.json(result);
});
