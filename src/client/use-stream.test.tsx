import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Question, Snapshot } from '../protocol';
import { useStream } from './use-stream';

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

function diff(version: number, questions: Question[]): Snapshot {
	return { version, moderated: false, translates: true, questions };
}

/** The room's end of the stream, so a test can push a frame when it wants. */
let push: (text: string) => void;
let close: () => void;
let asked: string[];
let status: number;

function frame(payload: Snapshot): string {
	return `id: ${payload.version}\ndata: ${JSON.stringify(payload)}\n\n`;
}

function open(): Response {
	const body = new ReadableStream<Uint8Array>({
		start(controller) {
			push = (text) => controller.enqueue(new TextEncoder().encode(text));
			close = () => controller.close();
		},
	});
	return new Response(body, { status: 200 });
}

async function settle(ms = 0): Promise<void> {
	await act(async () => {
		await vi.advanceTimersByTimeAsync(ms);
	});
}

beforeEach(() => {
	vi.useFakeTimers();
	asked = [];
	status = 200;
	vi.stubGlobal('fetch', (input: string) => {
		asked.push(String(input));
		return Promise.resolve(status === 200 ? open() : new Response('no', { status }));
	});
});

afterEach(() => {
	vi.unstubAllGlobals();
	vi.useRealTimers();
});

describe('useStream', () => {
	it('holds every question it has been told about, not just the last frame', async () => {
		const { result } = renderHook(() => useStream('keynote', true));
		await settle();

		await act(async () => {
			push(frame(diff(1, [question({ id: 'q1' })])));
		});
		await act(async () => {
			push(frame(diff(2, [question({ id: 'q2', version: 2 })])));
		});

		expect(result.current.questions.map((q) => q.id)).toEqual(['q1', 'q2']);
		expect(result.current.version).toBe(2);
		expect(result.current.connection).toBe('live');
	});

	it('replaces a question the room has changed', async () => {
		const { result } = renderHook(() => useStream('keynote', true));
		await settle();

		await act(async () => {
			push(frame(diff(1, [question({ status: 'published' })])));
		});
		await act(async () => {
			push(frame(diff(2, [question({ status: 'answering', version: 2 })])));
		});

		expect(result.current.questions).toHaveLength(1);
		expect(result.current.questions[0]?.status).toBe('answering');
	});

	it('steps over the heartbeats', async () => {
		const { result } = renderHook(() => useStream('keynote', true));
		await settle();

		await act(async () => {
			push(': beat\n\n');
			push(frame(diff(3, [question()])));
		});

		expect(result.current.questions).toHaveLength(1);
	});

	it('forgets what it holds when the room comes back at a lower version', async () => {
		const { result } = renderHook(() => useStream('keynote', true));
		await settle();
		await act(async () => {
			push(frame(diff(4, [question({ id: 'old' })])));
		});

		await act(async () => {
			push(frame(diff(0, [])));
		});

		expect(result.current.questions).toEqual([]);
	});

	it('asks again from where it stopped when the stream drops', async () => {
		renderHook(() => useStream('keynote', true));
		await settle();
		await act(async () => {
			push(frame(diff(7, [question()])));
		});

		await act(async () => {
			close();
		});
		await settle(5000);

		expect(asked[0]).toContain('since=0');
		expect(asked[1]).toContain('since=7');
	});

	it('says it is not allowed rather than asking again', async () => {
		status = 401;
		const { result } = renderHook(() => useStream('keynote', true));

		await settle(20000);

		expect(result.current.connection).toBe('denied');
		expect(asked).toHaveLength(1);
	});
});
