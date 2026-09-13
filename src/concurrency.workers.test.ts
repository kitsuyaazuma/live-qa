import { env, exports } from 'cloudflare:workers';
import { serializeSigned } from 'hono/utils/cookie';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { signIn } from './accounts';

/**
 * The room is one Durable Object instance, so these check the two things that
 * decide whether it survives an audience: that concurrent reads are answered
 * from the cache instead of the object, and that concurrent writes to the
 * object lose nothing.
 */

const BURST = 50;
const TEXT = 'エージェント基盤はどの層から着手すべきだとお考えでしょうか。';
let ADMIN: Record<string, string> = {};
beforeAll(async () => {
	const account = await signIn(env.DB, {
		provider: 'google',
		providerId: 'admin@example.com',
		email: 'admin@example.com',
		name: 'Admin',
		avatar: null,
	});
	const cookie = await serializeSigned('session', account.id, 'test-secret');
	ADMIN = { cookie: cookie.split(';')[0] ?? '' };
});

function call(path: string, init?: RequestInit) {
	return exports.default.fetch(new Request(`https://example.com${path}`, init));
}

/** The edge limit is keyed on the address, so each room here is its own. */
function post(roomId: string, id: string) {
	return call(`/api/rooms/${roomId}/questions`, {
		method: 'POST',
		headers: { 'cf-connecting-ip': roomId },
		body: JSON.stringify({ id, text: TEXT }),
	});
}

function vote(roomId: string, questionId: string, voterId: string) {
	return call(`/api/rooms/${roomId}/questions/${questionId}/vote`, {
		method: 'PUT',
		headers: { 'cf-connecting-ip': roomId },
		body: JSON.stringify({ voterId, voted: true }),
	});
}

async function warm(roomId: string) {
	await call(`/api/rooms/${roomId}/questions`);
	const key = new Request(`https://example.com/api/rooms/${roomId}/questions`);
	await vi.waitFor(async () => expect(await caches.default.match(key)).toBeDefined(), {
		interval: 5,
		timeout: 500,
	});
}

async function moderatorView(roomId: string) {
	const response = await call(`/api/rooms/${roomId}/moderator/questions`, { headers: ADMIN });
	return (await response.json()) as { version: number; questions: { id: string; votes: number }[] };
}

const times = (n: number) => Array.from({ length: n }, (_, i) => i);

describe('a burst of readers', () => {
	it('is answered entirely from the cache', async () => {
		await post('burstread', 'q1');
		await warm('burstread');
		await post('burstread', 'q2');

		const versions = await Promise.all(
			times(BURST).map(async () => {
				const response = await call('/api/rooms/burstread/questions');
				const body = (await response.json()) as { version: number };
				return body.version;
			}),
		);

		// The object is at 2; anything answered by it would say so.
		expect(new Set(versions)).toEqual(new Set([1]));
	});
});

describe('a burst of writers', () => {
	it('loses no votes when every voter is different', async () => {
		await post('burstvote', 'q1');

		await Promise.all(times(BURST).map((i) => vote('burstvote', 'q1', `voter-${i}`)));

		const { questions } = await moderatorView('burstvote');
		expect(questions[0]?.votes).toBe(BURST);
	});

	it('counts one vote when every request is the same voter', async () => {
		await post('samevoter', 'q1');

		await Promise.all(times(BURST).map(() => vote('samevoter', 'q1', 'alice')));

		const { questions } = await moderatorView('samevoter');
		expect(questions[0]?.votes).toBe(1);
	});

	it('gives every question its own version', async () => {
		await Promise.all(times(BURST).map((i) => post('burstpost', `q${i}`)));

		const { version, questions } = await moderatorView('burstpost');
		expect(questions).toHaveLength(BURST);
		expect(new Set(questions.map((q) => q.id)).size).toBe(BURST);
		expect(version).toBe(BURST);
	});

	it('stores one question when a retry arrives while the first is in flight', async () => {
		const responses = await Promise.all(times(BURST).map(() => post('retryburst', 'q1')));

		const created = responses.filter((r) => r.status === 201);
		const { version, questions } = await moderatorView('retryburst');
		expect(created).toHaveLength(1);
		expect(questions).toHaveLength(1);
		expect(version).toBe(1);
	});
});
