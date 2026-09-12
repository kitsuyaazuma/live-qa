import { exports } from 'cloudflare:workers';
import { describe, expect, it, vi } from 'vitest';

const TEXT = 'エージェント基盤はどの層から着手すべきだとお考えでしょうか。';
const TOKEN = { authorization: 'Bearer test-token' };

function call(path: string, init?: RequestInit) {
	return exports.default.fetch(new Request(`https://example.com${path}`, init));
}

function post(roomId: string, id: string, text = TEXT) {
	return call(`/api/rooms/${roomId}/questions`, {
		method: 'POST',
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

describe('moderator api', () => {
	it('refuses a request without the token', async () => {
		const anonymous = await call('/api/rooms/gate/moderator/questions');
		const wrong = await call('/api/rooms/gate/moderator/questions', {
			headers: { authorization: 'Bearer wrong' },
		});

		expect([anonymous.status, wrong.status]).toEqual([401, 401]);
	});

	it('shows pending questions only to the moderator', async () => {
		await call('/api/rooms/hidden/moderator/moderation', {
			method: 'PUT',
			headers: TOKEN,
			body: JSON.stringify({ enabled: true }),
		});
		await post('hidden', 'q1');

		const audience = (await read('hidden').then((r) => r.json())) as { questions: unknown[] };
		const moderator = (await call('/api/rooms/hidden/moderator/questions', {
			headers: TOKEN,
		}).then((r) => r.json())) as { questions: unknown[] };

		expect(audience.questions).toEqual([]);
		expect(moderator.questions).toHaveLength(1);
	});

	it('refuses a status that is not a transition target', async () => {
		await post('badstatus', 'q1');

		const garbage = await call('/api/rooms/badstatus/moderator/questions/q1', {
			method: 'PATCH',
			headers: TOKEN,
			body: JSON.stringify({ status: 'nonsense' }),
		});
		const backwards = await call('/api/rooms/badstatus/moderator/questions/q1', {
			method: 'PATCH',
			headers: TOKEN,
			body: JSON.stringify({ status: 'pending' }),
		});

		expect([garbage.status, backwards.status]).toEqual([400, 400]);
	});

	it('changes a status and reports an unknown question as not found', async () => {
		await post('status', 'q1');

		const changed = await call('/api/rooms/status/moderator/questions/q1', {
			method: 'PATCH',
			headers: TOKEN,
			body: JSON.stringify({ status: 'answering' }),
		});
		const missing = await call('/api/rooms/status/moderator/questions/nope', {
			method: 'PATCH',
			headers: TOKEN,
			body: JSON.stringify({ status: 'answering' }),
		});

		expect([changed.status, missing.status]).toEqual([200, 404]);
		expect(await changed.json()).toMatchObject({ status: 'changed' });
	});
});

describe('disposable rooms', () => {
	function wipe(roomId: string) {
		return call(`/api/rooms/${roomId}`, { method: 'DELETE' });
	}

	it('refuses to empty a room that is not disposable', async () => {
		await post('pek2026-keynote', 'q1');

		const refused = await wipe('pek2026-keynote');

		expect(refused.status).toBe(403);
		expect((await read('pek2026-keynote').then((r) => r.json())) as { version: number }).toEqual(
			expect.objectContaining({ version: 1 }),
		);
	});

	it('empties a disposable room and leaves it usable', async () => {
		await post('scratch-2', 'q1');

		const wiped = await wipe('scratch-2');

		expect(wiped.status).toBe(200);
		const after = await call('/api/rooms/scratch-2/moderator/questions', { headers: TOKEN }).then(
			(r) => r.json() as Promise<{ version: number; questions: unknown[] }>,
		);
		expect(after).toMatchObject({ version: 0, questions: [] });
		expect((await post('scratch-2', 'q2')).status).toBe(201);
	});
});
