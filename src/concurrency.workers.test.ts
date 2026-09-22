import { env, exports } from 'cloudflare:workers';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import { signIn } from './accounts';
import { createRoom } from './rooms';
import { signedCookie } from './test-cookies';

/**
 * The room is one Durable Object instance, so these check the two things that
 * decide whether it survives an audience: that concurrent reads are answered
 * from the cache instead of the object, and that concurrent writes to the
 * object lose nothing.
 */

const BURST = 50;
const TEXT = 'エージェント基盤はどの層から着手すべきだとお考えでしょうか。';
const ROOMS = ['burstpost', 'burstread', 'burstvote', 'retryburst', 'samevoter'];

beforeAll(async () => {
	const admin = await signIn(env.DB, {
		provider: 'google',
		providerId: 'admin@example.com',
		email: 'admin@example.com',
		name: 'Admin',
		avatar: null,
	});
	for (const id of ROOMS) await createRoom(env.DB, id, admin.id);
});

function call(path: string, init?: RequestInit) {
	return exports.default.fetch(new Request(`https://example.com${path}`, init));
}

/** The room's name doubles as the address, so the address limits stay apart per test. */
async function device(roomId: string, id: string): Promise<Record<string, string>> {
	return { 'cf-connecting-ip': roomId, cookie: await signedCookie('device', id) };
}

async function post(roomId: string, id: string) {
	return call(`/api/rooms/${roomId}/questions`, {
		method: 'POST',
		headers: await device(roomId, `${roomId}/${id}`),
		body: JSON.stringify({ id, text: TEXT }),
	});
}

async function vote(roomId: string, questionId: string, voterId: string) {
	return call(`/api/rooms/${roomId}/questions/${questionId}/vote`, {
		method: 'PUT',
		headers: await device(roomId, voterId),
		body: JSON.stringify({ voted: true }),
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

function operatorView(roomId: string) {
	return env.ROOM.getByName(roomId).snapshot({ view: 'operator' });
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

		const { questions } = await operatorView('burstvote');
		expect(questions[0]?.votes).toBe(BURST);
	});

	/** Straight to the object: at the edge one device is held to its own limit. */
	it('counts one vote when every request is the same voter', async () => {
		await post('samevoter', 'q1');
		const room = env.ROOM.getByName('samevoter');

		await Promise.all(
			times(BURST).map(() => room.setVote({ questionId: 'q1', voterId: 'alice', voted: true })),
		);

		const { questions } = await operatorView('samevoter');
		expect(questions[0]?.votes).toBe(1);
	});

	it('gives every question its own version', async () => {
		await Promise.all(times(BURST).map((i) => post('burstpost', `q${i}`)));

		const { version, questions } = await operatorView('burstpost');
		expect(questions).toHaveLength(BURST);
		expect(new Set(questions.map((q) => q.id)).size).toBe(BURST);
		expect(version).toBe(BURST);
	});

	it('stores one question when a retry arrives while the first is in flight', async () => {
		const room = env.ROOM.getByName('retryburst');

		const results = await Promise.all(
			times(BURST).map(() => room.postQuestion({ id: 'q1', text: TEXT })),
		);

		const created = results.filter((result) => 'created' in result && result.created);
		const { version, questions } = await operatorView('retryburst');
		expect(created).toHaveLength(1);
		expect(questions).toHaveLength(1);
		expect(version).toBe(1);
	});
});
