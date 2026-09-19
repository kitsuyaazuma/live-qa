import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question, Snapshot } from '../protocol';
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

	vi.stubGlobal('fetch', (input: string, init?: RequestInit) => {
		const url = String(input);
		const method = init?.method ?? 'GET';
		if (method === 'GET') {
			if (!exists) return Promise.resolve(json({ error: 'no such room' }, { status: 404 }));
			const etag = `"${served.version}"`;
			const offered = new Headers(init?.headers).get('if-none-match');
			if (offered === etag) return Promise.resolve(new Response(null, { status: 304 }));
			return Promise.resolve(json(served, { headers: { etag } }));
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
