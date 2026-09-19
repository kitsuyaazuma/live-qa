import { runInDurableObject } from 'cloudflare:test';
import { env, exports } from 'cloudflare:workers';
import { serializeSigned } from 'hono/utils/cookie';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { signIn } from './accounts';
import { createRoom } from './rooms';

const TEXT = 'エージェント基盤はどの層から着手すべきだとお考えでしょうか。';
/** Mirrors ASK_LIMIT in wrangler.jsonc. */
const ASK_PERIOD_MS = 10_000;
function account(email: string) {
	return signIn(env.DB, {
		provider: 'google',
		providerId: email,
		email,
		name: email.split('@')[0] ?? email,
		avatar: null,
	});
}

/** A session for an account that exists, signed the way the worker signs. */
async function sessionFor(email: string): Promise<Record<string, string>> {
	const cookie = await serializeSigned('session', (await account(email)).id, 'test-secret');
	return { cookie: cookie.split(';')[0] ?? '' };
}

/** Every registered room these tests reach for; the rest are scratch rooms. */
const ROOMS = [
	'named',
	'archive',
	'badstatus',
	'bloat',
	'bust',
	'cache',
	'closed',
	'create',
	'crowd',
	'etag',
	'export',
	'fallback',
	'fresh',
	'gate',
	'hidden',
	'packed',
	'params',
	'pek2026-keynote',
	'reject',
	'resume',
	'stale304',
	'status',
	'stream',
	'trickle',
	'vote',
];

let ADMIN: Record<string, string> = {};
beforeAll(async () => {
	ADMIN = await sessionFor('admin@example.com');
	const admin = await account('admin@example.com');
	for (const id of ROOMS) await createRoom(env.DB, id, admin.id);
});

function call(path: string, init?: RequestInit) {
	return exports.default.fetch(new Request(`https://example.com${path}`, init));
}

/** The edge limit is keyed on the address, so each room here is its own. */
function post(roomId: string, id: string, text = TEXT) {
	return call(`/api/rooms/${roomId}/questions`, {
		method: 'POST',
		headers: { 'cf-connecting-ip': roomId },
		body: JSON.stringify({ id, text }),
	});
}

function read(roomId: string, headers?: HeadersInit) {
	return call(`/api/rooms/${roomId}/questions`, { headers });
}

/**
 * The cache write rides on waitUntil, so wait for it rather than racing it —
 * and poll tightly, since the entry expires two seconds after it lands.
 */
async function cached(roomId: string) {
	const key = new Request(`https://example.com/api/rooms/${roomId}/questions`);
	await vi.waitFor(async () => expect(await caches.default.match(key)).toBeDefined(), {
		interval: 5,
		timeout: 500,
	});
}

describe('questions api', () => {
	it('creates a question once and reports a retry as already stored', async () => {
		const created = await post('create', 'q1');
		const retried = await post('create', 'q1');

		expect([created.status, retried.status]).toEqual([201, 200]);
		expect(await retried.json()).toMatchObject({ created: false, version: 1 });
	});

	it('rejects a body the durable object would have thrown on', async () => {
		const blank = await post('reject', 'q1', '   ');
		const nonJson = await call('/api/rooms/reject/questions', { method: 'POST', body: 'nope' });

		expect([blank.status, nonJson.status]).toEqual([400, 400]);
		expect((await read('reject').then((r) => r.json())) as { version: number }).toMatchObject({
			version: 0,
		});
	});

	it('tags the audience snapshot with the room version', async () => {
		await post('etag', 'q1');

		const response = await read('etag');

		expect(response.headers.get('etag')).toBe('"1"');
		expect(await response.json()).toMatchObject({ version: 1, moderated: false });
	});

	it('answers a matching if-none-match with an empty 304', async () => {
		await post('fresh', 'q1');
		await read('fresh');

		const response = await read('fresh', { 'if-none-match': '"1"' });

		expect(response.status).toBe(304);
		expect(await response.text()).toBe('');
	});

	it('answers the 304 from the cached entry, not the object', async () => {
		await post('stale304', 'q1');
		await read('stale304');
		await cached('stale304');
		await post('stale304', 'q2');

		const response = await read('stale304', { 'if-none-match': '"1"' });

		expect(response.status).toBe(304);
	});

	it('serves the audience read from cache rather than the object', async () => {
		await post('cache', 'q1');
		await read('cache');
		await cached('cache');

		await post('cache', 'q2');
		const stale = await read('cache');

		expect(stale.headers.get('etag')).toBe('"1"');
		expect(await stale.json()).toMatchObject({ version: 1 });
	});

	it('ignores a query string rather than letting it bust the cache', async () => {
		await post('bust', 'q1');
		await read('bust');
		await cached('bust');
		await post('bust', 'q2');

		const busted = await call('/api/rooms/bust/questions?t=12345');

		expect(busted.headers.get('etag')).toBe('"1"');
	});

	it('refuses a path parameter the object would have thrown on', async () => {
		const longId = 'x'.repeat(65);

		const badRoom = await post(longId, 'q1');
		const badQuestion = await call(`/api/rooms/params/questions/${longId}/vote`, {
			method: 'PUT',
			body: JSON.stringify({ voterId: 'alice', voted: true }),
		});

		expect([badRoom.status, badQuestion.status]).toEqual([400, 400]);
	});

	it('reports a vote for an unknown question as not found', async () => {
		await post('vote', 'q1');

		const ok = await call('/api/rooms/vote/questions/q1/vote', {
			method: 'PUT',
			body: JSON.stringify({ voterId: 'alice', voted: true }),
		});
		const missing = await call('/api/rooms/vote/questions/nope/vote', {
			method: 'PUT',
			body: JSON.stringify({ voterId: 'alice', voted: true }),
		});

		expect([ok.status, missing.status]).toEqual([200, 404]);
		expect(await ok.json()).toMatchObject({ status: 'changed', votes: 1 });
	});
});

describe('what the edge turns away', () => {
	it('refuses a body larger than any question', async () => {
		const bloated = await call('/api/rooms/bloat/questions', {
			method: 'POST',
			body: JSON.stringify({ id: 'q1', text: 'x'.repeat(20_000) }),
		});

		expect(bloated.status).toBe(413);
	});

	it('holds one address to a trickle of questions', async () => {
		// Windows are aligned to the wall clock; a loop that straddles one gets a fresh count.
		const left = ASK_PERIOD_MS - (Date.now() % ASK_PERIOD_MS);
		if (left < 2_000) await new Promise((resolve) => setTimeout(resolve, left));

		const from = { 'cf-connecting-ip': '203.0.113.9' };
		const statuses: number[] = [];
		for (let i = 0; i < 51; i += 1) {
			const response = await call('/api/rooms/trickle/questions', {
				method: 'POST',
				headers: from,
				body: JSON.stringify({ id: `q${i}`, text: TEXT }),
			});
			statuses.push(response.status);
		}

		expect(statuses.slice(0, 50).every((status) => status === 201)).toBe(true);
		expect(statuses[50]).toBe(429);
	});

	it('says a room is full instead of storing more, and still takes a retry', async () => {
		await post('packed', 'kept');
		await runInDurableObject(env.ROOM.getByName('packed'), (_instance, state) => {
			state.storage.sql.exec(`
				INSERT INTO questions (id, text, status, version, created_at)
				WITH RECURSIVE n(i) AS (SELECT 1 UNION ALL SELECT i + 1 FROM n WHERE i < 2000)
				SELECT 'fill-' || i, 'x', 'published', 1, 0 FROM n`);
		});

		const refused = await post('packed', 'one-more');
		const retried = await post('packed', 'kept');

		expect(refused.status).toBe(409);
		expect(retried.status).toBe(200);
	});
});

describe('export', () => {
	it('hands an operator every question as csv, and nobody else', async () => {
		await post('export', 'q1');
		await call('/api/rooms/export/questions/q1', {
			method: 'PATCH',
			headers: ADMIN,
			body: JSON.stringify({ status: 'dismissed' }),
		});

		const anonymous = await call('/api/rooms/export/export');
		const csv = await call('/api/rooms/export/export', { headers: ADMIN });
		const text = await csv.text();

		expect(anonymous.status).toBe(401);
		expect(csv.headers.get('content-disposition')).toBe('attachment; filename="export.csv"');
		expect(text.split('\r\n')[1]).toMatch(new RegExp(`^q1,.*,dismissed,0,,${TEXT},,$`));
	});
});

describe('next talk', () => {
	it('lets an operator archive the room, and nobody else', async () => {
		await post('archive', 'q1');

		const anonymous = await call('/api/rooms/archive/archive', { method: 'POST' });
		const cleared = await call('/api/rooms/archive/archive', { method: 'POST', headers: ADMIN });

		expect(anonymous.status).toBe(401);
		expect(await cleared.json()).toEqual({ version: 2, archived: 1 });
	});
});

describe('room settings', () => {
	it('closes a room to new questions and says so', async () => {
		const closed = await call('/api/rooms/closed', {
			method: 'PATCH',
			headers: ADMIN,
			body: JSON.stringify({ open: false }),
		});
		const refused = await post('closed', 'q1');
		const nothing = await call('/api/rooms/closed', {
			method: 'PATCH',
			headers: ADMIN,
			body: JSON.stringify({}),
		});

		expect(await closed.json()).toMatchObject({ open: false, moderated: false });
		expect(refused.status).toBe(409);
		expect(await refused.json()).toEqual({ error: 'this room is closed to new questions' });
		expect(nothing.status).toBe(400);
	});
});

describe('signing in', () => {
	it('turns a provider away until it has been configured', async () => {
		const google = await call('/auth/google?next=/r/keynote/admin');

		expect(google.status).toBe(503);
		expect(google.headers.get('set-cookie')).toContain('return-to=%2Fr%2Fkeynote%2Fadmin');
	});

	it('signs out without remembering where to come back to', async () => {
		const out = await call('/auth/logout', { method: 'POST' });

		expect(out.status).toBe(204);
		expect(out.headers.get('set-cookie')).not.toContain('return-to');
	});
});

describe('asking with a name', () => {
	it('signs the question with what the account is called, only when asked to', async () => {
		const me = await sessionFor('asker@example.com');
		const ask = (as: string | undefined, headers: Record<string, string>, id: string) =>
			call('/api/rooms/named/questions', {
				method: 'POST',
				headers: { ...headers, 'cf-connecting-ip': 'named', 'content-type': 'application/json' },
				body: JSON.stringify({ id, text: TEXT, as }),
			});

		const named = (await ask('me', me, 'q1').then((r) => r.json())) as {
			question: { asker: { name: string } | null };
		};
		const quiet = (await ask('anonymous', me, 'q2').then((r) => r.json())) as {
			question: { asker: unknown };
		};
		const plain = (await ask(undefined, {}, 'q3').then((r) => r.json())) as {
			question: { asker: unknown };
		};
		const stranger = await ask('me', {}, 'q4');
		const garbage = await ask('someone', me, 'q5');

		expect(named.question.asker).toEqual({ name: 'asker', avatar: null });
		expect([quiet.question.asker, plain.question.asker]).toEqual([null, null]);
		expect([stranger.status, garbage.status]).toEqual([401, 400]);
	});
});

describe('profile', () => {
	it('lets an account choose its name, within reason', async () => {
		const me = await sessionFor('named@example.com');
		const renamed = await call('/api/me', {
			method: 'PATCH',
			headers: { ...me, 'content-type': 'application/json' },
			body: JSON.stringify({ name: '  Named   Person ' }),
		});
		const blank = await call('/api/me', {
			method: 'PATCH',
			headers: { ...me, 'content-type': 'application/json' },
			body: JSON.stringify({ name: '   ' }),
		});
		const nobody = await call('/api/me', { method: 'PATCH', body: JSON.stringify({ name: 'X' }) });

		expect(await renamed.json()).toMatchObject({ account: { name: 'Named Person' } });
		expect([blank.status, nobody.status]).toEqual([400, 401]);
	});

	it('serves an uploaded picture from a versioned url, and drops it again', async () => {
		const me = await sessionFor('pictured@example.com');
		const put = (type: string, bytes: number) =>
			call('/api/me/avatar', {
				method: 'PUT',
				headers: { ...me, 'content-type': type },
				body: new Uint8Array(bytes),
			});

		const uploaded = (await put('image/png', 64).then((r) => r.json())) as {
			account: { avatar: string };
		};
		const served = await call(uploaded.account.avatar);
		const wrongType = await put('text/plain', 8);
		const tooBig = await put('image/png', 300 * 1024);
		const dropped = (await call('/api/me/avatar', { method: 'DELETE', headers: me }).then((r) =>
			r.json(),
		)) as { account: { avatar: string | null } };
		const gone = await call(uploaded.account.avatar);

		expect(uploaded.account.avatar).toMatch(/^\/api\/avatars\/[^?]+\?v=\d+$/);
		expect(served.status).toBe(200);
		expect(served.headers.get('content-type')).toBe('image/png');
		expect(served.headers.get('cache-control')).toContain('immutable');
		expect((await served.arrayBuffer()).byteLength).toBe(64);
		expect([wrongType.status, tooBig.status]).toEqual([415, 413]);
		expect(dropped.account.avatar).toBeNull();
		expect(gone.status).toBe(404);
	});
});

describe('operator api', () => {
	it('turns away someone not signed in, and someone who is but is no admin', async () => {
		const anonymous = await call('/api/rooms/gate/events');
		const visitor = await call('/api/rooms/gate/events', {
			headers: await sessionFor('visitor@example.com'),
		});
		const forged = await call('/api/rooms/gate/events', {
			headers: { cookie: 'session=someone.AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=' },
		});

		expect([anonymous.status, visitor.status, forged.status]).toEqual([401, 403, 401]);
	});

	it('tells a browser who it is', async () => {
		const nobody = await call('/api/me');
		const admin = await call('/api/me', { headers: ADMIN });

		expect(nobody.status).toBe(401);
		expect(await admin.json()).toMatchObject({
			admin: true,
			account: { email: 'admin@example.com' },
		});
	});

	it('shows pending questions only to an operator', async () => {
		await call('/api/rooms/hidden', {
			method: 'PATCH',
			headers: ADMIN,
			body: JSON.stringify({ moderated: true }),
		});
		await post('hidden', 'q1');

		const audience = (await read('hidden').then((r) => r.json())) as { questions: unknown[] };
		const operator = (await pushed(
			(await events('hidden')).body?.getReader() as ReadableStreamDefaultReader<Uint8Array>,
		)) as { questions: unknown[] };

		expect(audience.questions).toEqual([]);
		expect(operator.questions).toHaveLength(1);
	});

	it('refuses a status that is not a transition target', async () => {
		await post('badstatus', 'q1');

		const garbage = await call('/api/rooms/badstatus/questions/q1', {
			method: 'PATCH',
			headers: ADMIN,
			body: JSON.stringify({ status: 'nonsense' }),
		});
		const backwards = await call('/api/rooms/badstatus/questions/q1', {
			method: 'PATCH',
			headers: ADMIN,
			body: JSON.stringify({ status: 'pending' }),
		});

		expect([garbage.status, backwards.status]).toEqual([400, 400]);
	});

	it('changes a status and reports an unknown question as not found', async () => {
		await post('status', 'q1');

		const changed = await call('/api/rooms/status/questions/q1', {
			method: 'PATCH',
			headers: ADMIN,
			body: JSON.stringify({ status: 'answering' }),
		});
		const missing = await call('/api/rooms/status/questions/nope', {
			method: 'PATCH',
			headers: ADMIN,
			body: JSON.stringify({ status: 'answering' }),
		});

		expect([changed.status, missing.status]).toEqual([200, 404]);
		expect(await changed.json()).toMatchObject({ status: 'changed' });
	});
});

describe('the client fallback', () => {
	it('leaves a mistyped endpoint as not found rather than answering with a page', async () => {
		const mistyped = await call('/api/rooms/fallback/question');

		expect(mistyped.status).toBe(404);
		expect(mistyped.headers.get('content-type')).not.toContain('text/html');
	});
});

describe('disposable rooms', () => {
	function wipe(roomId: string) {
		return call(`/api/rooms/${roomId}`, { method: 'DELETE' });
	}

	it('does not let a stranger empty a room that is not disposable', async () => {
		await post('pek2026-keynote', 'q1');

		const refused = await wipe('pek2026-keynote');

		expect(refused.status).toBe(401);
		expect((await read('pek2026-keynote').then((r) => r.json())) as { version: number }).toEqual(
			expect.objectContaining({ version: 1 }),
		);
	});

	it('empties a disposable room and leaves it usable', async () => {
		await post('scratch-2', 'q1');

		const wiped = await wipe('scratch-2');

		expect(wiped.status).toBe(200);
		const after = await pushed(
			(await events('scratch-2')).body?.getReader() as ReadableStreamDefaultReader<Uint8Array>,
		);
		expect(after).toMatchObject({ version: 0, questions: [] });
		expect((await post('scratch-2', 'q2')).status).toBe(201);
	});
});

/** Reads one pushed payload, stepping over the heartbeat comments. */
async function pushed(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<unknown> {
	const decoder = new TextDecoder();
	let buffered = '';
	while (true) {
		const { value, done } = await reader.read();
		if (done) throw new Error('the stream closed');
		buffered += decoder.decode(value, { stream: true });
		const end = buffered.indexOf('\n\n');
		if (end === -1) continue;
		const event = buffered.slice(0, end);
		buffered = buffered.slice(end + 2);
		const data = event.split('\n').find((line) => line.startsWith('data: '));
		if (data) return JSON.parse(data.slice(6));
	}
}

function events(roomId: string, since?: number) {
	const query = since === undefined ? '' : `?since=${since}`;
	return call(`/api/rooms/${roomId}/events${query}`, { headers: ADMIN });
}

describe('operator stream', () => {
	it('opens with the room as it stands and pushes what changes after', async () => {
		await post('stream', 'q1');
		const response = await events('stream');
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();

		const opening = await pushed(reader);
		await post('stream', 'q2');
		const change = await pushed(reader);
		await reader.cancel();

		expect(response.headers.get('content-type')).toBe('text/event-stream');
		expect(opening).toMatchObject({ version: 1, questions: [{ id: 'q1' }] });
		// Only the row that moved: the screen is holding the rest already.
		expect(change).toMatchObject({ version: 2, questions: [{ id: 'q2' }] });
	});

	it('sends a reconnecting screen only what it missed', async () => {
		await post('resume', 'q1');
		await post('resume', 'q2');

		const response = await events('resume', 1);
		const reader = (response.body as ReadableStream<Uint8Array>).getReader();
		const opening = await pushed(reader);
		await reader.cancel();

		expect(opening).toMatchObject({ version: 2, questions: [{ id: 'q2' }] });
	});

	it('turns away more screens than one room should have', async () => {
		const opened = await Promise.all(Array.from({ length: 9 }, () => events('crowd')));

		const statuses = opened.map((response) => response.status);
		await Promise.all(opened.map((response) => response.body?.cancel()));

		expect(statuses.filter((status) => status === 200)).toHaveLength(8);
		expect(statuses.filter((status) => status === 503)).toHaveLength(1);
	});

	it('refuses a stream to someone not signed in', async () => {
		const anonymous = await call('/api/rooms/stream/events');

		expect(anonymous.status).toBe(401);
	});
});
