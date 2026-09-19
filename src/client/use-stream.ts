import { useEffect, useState } from 'react';
import type { Question } from '../protocol';
import { frames } from './sse';

/** Longer than the heartbeat, so silence this long means the stream is gone. */
const SILENCE_MS = 25000;
const RETRY_MS = 1000;
const RETRY_CEILING_MS = 10000;

export type StreamConnection = 'opening' | 'live' | 'stale' | 'denied' | 'crowded';

export interface StreamState {
	questions: Question[];
	version: number;
	moderated: boolean;
	open: boolean;
	translates: boolean;
	connection: StreamConnection;
}

const EMPTY: StreamState = {
	questions: [],
	version: 0,
	moderated: false,
	open: true,
	translates: false,
	connection: 'opening',
};

export function useStream(roomId: string, enabled: boolean): StreamState {
	const [state, setState] = useState<StreamState>(EMPTY);

	useEffect(() => {
		if (!enabled) return;

		const rows = new Map<string, Question>();
		let stopped = false;
		let since = 0;
		let attempt = 0;

		const run = async () => {
			while (!stopped) {
				const controller = new AbortController();
				let silence = setTimeout(() => controller.abort(), SILENCE_MS);
				try {
					const response = await fetch(
						`/api/rooms/${encodeURIComponent(roomId)}/events?since=${since}`,
						{ signal: controller.signal },
					);
					if (response.status === 401 || response.status === 403) {
						setState((current) => ({ ...current, connection: 'denied' }));
						return;
					}
					if (response.status === 503) {
						setState((current) => ({ ...current, connection: 'crowded' }));
					} else if (!response.ok || !response.body) {
						throw new Error(`the room answered ${response.status}`);
					} else {
						attempt = 0;
						for await (const diff of frames(response.body)) {
							if (stopped) break;
							clearTimeout(silence);
							silence = setTimeout(() => controller.abort(), SILENCE_MS);
							if (!diff) continue;
							// A lower version means the room was emptied; what is held is stale.
							if (diff.version < since) rows.clear();
							for (const question of diff.questions) rows.set(question.id, question);
							since = diff.version;
							setState({
								questions: [...rows.values()],
								version: diff.version,
								moderated: diff.moderated,
								open: diff.open,
								translates: diff.translates,
								connection: 'live',
							});
						}
					}
				} catch {
					setState((current) => ({ ...current, connection: 'stale' }));
				} finally {
					clearTimeout(silence);
					controller.abort();
				}
				if (stopped) return;
				attempt += 1;
				await new Promise((resolve) =>
					setTimeout(resolve, Math.min(RETRY_MS * 2 ** attempt, RETRY_CEILING_MS)),
				);
			}
		};

		void run();
		return () => {
			stopped = true;
		};
	}, [roomId, enabled]);

	return state;
}
