import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NO_DEVICE, type Question, type Snapshot } from '../protocol';
import { useRoom } from './use-room';

function question(overrides: Partial<Question> = {}): Question {
	return {
		id: 'q1',
		text: 'エージェント基盤はどの層から着手すべきでしょうか。',
		translation: null,
		votes: 0,
		status: 'published',
		version: 1,
		createdAt: 1,
		asker: null,
		...overrides,
	};
}

/** What the cached read hands back, which a test moves on its own. */
let served: Snapshot;
/** What the post answered with, so a test can lag the read behind it. */
let asked: Question | null;
let voteResult: { status: string; version: number; votes: number } | null;
let exists = true;
let claimed = false;
let siteKey: string | null = null;
let claimedWith: string | undefined;

/** Fake timers and the library's own waitFor deadlock, so time is moved by
 * hand: zero flushes the fetch that is already in flight. */
async function settle(ms = 0): Promise<void> {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

function json(body: unknown, init?: ResponseInit): Response {
	return new Response(JSON.stringify(body), {
		...init,
		headers: { 'content-type': 'application/json', ...init?.headers },
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	localStorage.clear();
	served = {
		version: 0,
		moderated: false,
		open: true,
		notice: '',
		translates: true,
		questions: [],
	};
	asked = null;
	voteResult = null;
	exists = true;
	claimed = false;
	siteKey = null;
	claimedWith = undefined;

	vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (method === 'POST' && url.endsWith('/api/device')) {
			claimedWith = (JSON.parse(String(init?.body)) as { token?: string }).token;
			if (siteKey && claimedWith === undefined) {
				return Promise.resolve(json({ error: NO_DEVICE, sitekey: siteKey }, { status: 401 }));
			}
			if (siteKey && claimedWith !== 'solved') {
				return Promise.resolve(json({ error: 'the check did not pass' }, { status: 403 }));
			}
			claimed = true;
			return Promise.resolve(new Response(null, { status: 204 }));
		}
		if (method !== 'GET' && !claimed) {
			return Promise.resolve(json({ error: NO_DEVICE, sitekey: siteKey }, { status: 401 }));
		}
		if (method === 'GET') {
			if (!exists) return Promise.resolve(json({ error: 'no such room' }, { status: 404 }));
			const etag = `"${served.version}"`;
			const offered = new Headers(init?.headers).get('if-none-match');
			if (offered === etag) return Promise.resolve(new Response(null, { status: 304 }));
			return Promise.resolve(json(served, { headers: { etag } }));
		}
		if (method === 'POST' && url.includes('/withdraw')) {
			return Promise.resolve(json({ status: 'withdrawn', version: served.version }));
		}
		if (method === 'POST') {
			// The id is the client's, which is the point: it is what gets remembered.
			const sent = JSON.parse(String(init?.body)) as { id: string; text: string };
			asked = question({ id: sent.id, text: sent.text });
			return Promise.resolve(
				json({ created: true, version: served.version, question: asked }, { status: 201 }),
			);
		}
		if (method === 'PUT' && url.includes('/vote')) {
			if (!voteResult) return Promise.resolve(json({ error: 'no' }, { status: 500 }));
			return Promise.resolve(json(voteResult));
		}
		return Promise.resolve(json({ error: 'unexpected' }, { status: 404 }));
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('useRoom', () => {
	it('says the room is missing and stops asking', async () => {
		exists = false;
		const spy = vi.spyOn(globalThis, 'fetch');
		const { result } = renderHook(() => useRoom('ghost'));
		await settle();
		const calls = spy.mock.calls.length;
		await settle(60000);

		expect(result.current.missing).toBe(true);
		expect(spy.mock.calls.length).toBe(calls);
	});

	it('claims a device cookie when a write is turned away, then sends it again', async () => {
		served = {
			version: 5,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [question({ votes: 2 })],
		};
		voteResult = { status: 'changed', version: 6, votes: 3 };
		const spy = vi.spyOn(globalThis, 'fetch');
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		await act(async () => {
			await result.current.toggleVote('q1');
		});

		const writes = spy.mock.calls
			.filter(([, init]) => init?.method && init.method !== 'GET')
			.map(([input, init]) => `${init?.method} ${String(input)}`);
		expect(writes).toEqual([
			'PUT /api/rooms/keynote/questions/q1/vote',
			'POST /api/device',
			'PUT /api/rooms/keynote/questions/q1/vote',
		]);
		expect(result.current.voted.has('q1')).toBe(true);
		expect(result.current.error).toBeNull();
	});

	it('claims once for every write turned away together', async () => {
		served = {
			version: 5,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [question({ id: 'q1', votes: 2 }), question({ id: 'q2', votes: 0 })],
		};
		voteResult = { status: 'changed', version: 6, votes: 3 };
		const spy = vi.spyOn(globalThis, 'fetch');
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		await act(async () => {
			await Promise.all([result.current.toggleVote('q1'), result.current.toggleVote('q2')]);
		});

		const claims = spy.mock.calls.filter(([input]) => String(input).endsWith('/api/device'));
		expect(claims).toHaveLength(1);
		expect([...result.current.voted].sort()).toEqual(['q1', 'q2']);
		expect(result.current.error).toBeNull();
	});

	it('claims on the first sign of a write, so the write itself goes straight through', async () => {
		served = {
			version: 5,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [question({ votes: 2 })],
		};
		voteResult = { status: 'changed', version: 6, votes: 3 };
		const spy = vi.spyOn(globalThis, 'fetch');
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		act(() => result.current.prepare({ kind: 'question', id: 'q1' }));
		await settle();
		act(() => result.current.prepare({ kind: 'question', id: 'q1' }));
		await settle();
		await act(async () => {
			await result.current.toggleVote('q1');
		});

		const writes = spy.mock.calls
			.filter(([, init]) => init?.method && init.method !== 'GET')
			.map(([input, init]) => `${init?.method} ${String(input)}`);
		expect(writes).toEqual(['POST /api/device', 'PUT /api/rooms/keynote/questions/q1/vote']);
		expect(result.current.voted.has('q1')).toBe(true);
	});

	it('draws the check where the write was prepared, before anything is sent', async () => {
		siteKey = '1x00000000000000000000AA';
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		act(() => result.current.prepare({ kind: 'ask' }));
		await settle();
		const drawn = result.current.challenge;
		await act(async () => {
			drawn?.pass('solved');
			await settle();
		});

		expect(drawn?.at).toEqual({ kind: 'ask' });
		expect(claimedWith).toBe('solved');
		expect(result.current.challenge).toBeNull();
		expect(claimed).toBe(true);
	});

	it('draws the check the deployment asks for, and claims with its token', async () => {
		served = {
			version: 5,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [question({ votes: 2 })],
		};
		voteResult = { status: 'changed', version: 6, votes: 3 };
		siteKey = '1x00000000000000000000AA';
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		let voting: Promise<void> | undefined;
		await act(async () => {
			voting = result.current.toggleVote('q1');
			await settle();
		});
		const drawn = result.current.challenge;
		await act(async () => {
			drawn?.pass('solved');
			await voting;
		});

		expect(drawn?.sitekey).toBe(siteKey);
		expect(claimedWith).toBe('solved');
		expect(result.current.challenge).toBeNull();
		expect(result.current.voted.has('q1')).toBe(true);
	});

	it('takes the vote back when the check is closed instead of passed', async () => {
		served = {
			version: 5,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [question({ votes: 2 })],
		};
		siteKey = '1x00000000000000000000AA';
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		let voting: Promise<void> | undefined;
		await act(async () => {
			voting = result.current.toggleVote('q1');
			await settle();
		});
		await act(async () => {
			result.current.challenge?.cancel();
			await voting;
		});

		expect(result.current.challenge).toBeNull();
		expect(result.current.voted.has('q1')).toBe(false);
		expect(result.current.error).toBe('the check could not run; try again');
	});

	it('shows an own question before the cached read catches up', async () => {
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		await act(async () => {
			await result.current.ask('エージェント基盤はどの層から着手すべきでしょうか。', false);
		});

		expect(result.current.questions.map((q) => q.id)).toEqual([asked?.id]);
		expect([...result.current.asked]).toEqual([asked?.id]);
	});

	it('stops showing its own copy once the read carries the question', async () => {
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();
		await act(async () => {
			await result.current.ask('エージェント基盤はどの層から着手すべきでしょうか。', false);
		});

		served = {
			version: 1,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [{ ...(asked as Question), votes: 3 }],
		};
		await settle(4000);

		expect(result.current.questions).toHaveLength(1);
		expect(result.current.questions[0]?.votes).toBe(3);
	});

	it('keeps a confirmed vote count until the read reaches that version', async () => {
		served = {
			version: 5,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [question({ votes: 2 })],
		};
		voteResult = { status: 'changed', version: 6, votes: 3 };
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		await act(async () => {
			await result.current.toggleVote('q1');
		});

		// The read still answers with version five and two votes.
		expect(result.current.questions[0]?.votes).toBe(3);
		expect(result.current.voted.has('q1')).toBe(true);
	});

	it('takes the vote back when the server refuses it', async () => {
		served = {
			version: 5,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [question({ votes: 2 })],
		};
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		await act(async () => {
			await result.current.toggleVote('q1');
		});

		expect(result.current.voted.has('q1')).toBe(false);
		expect(result.current.error).not.toBeNull();
	});

	it('drops an own question the moment it is taken back', async () => {
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();
		await act(async () => {
			await result.current.ask('エージェント基盤はどの層から着手すべきでしょうか。', false);
		});
		expect(result.current.questions).toHaveLength(1);

		await act(async () => {
			await result.current.withdraw(asked?.id ?? '');
		});

		expect(result.current.questions).toEqual([]);
		expect(result.current.error).toBeNull();
	});

	it('leaves dismissed and archived questions off the screen', async () => {
		served = {
			version: 5,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [
				question({ id: 'kept' }),
				question({ id: 'gone', status: 'dismissed', text: '' }),
				question({ id: 'past', status: 'archived', text: '' }),
			],
		};
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		expect(result.current.questions.map((q) => q.id)).toEqual(['kept']);
	});

	it('says it is stale but keeps the last list when a read fails', async () => {
		served = {
			version: 5,
			moderated: false,
			open: true,
			notice: '',
			translates: true,
			questions: [question()],
		};
		const { result } = renderHook(() => useRoom('keynote'));
		await settle();

		vi.stubGlobal('fetch', () => Promise.reject(new Error('offline')));
		await settle(4000);

		expect(result.current.connection).toBe('stale');
		expect(result.current.questions).toHaveLength(1);
	});
});
