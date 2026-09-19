import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { offScreen, type Question, type Snapshot } from '../protocol';
import * as api from './api';
import { recall, remember, voterId } from './storage';

/** The read is cached for two seconds, so faster only buys 304s. The jitter
 * keeps a thousand phones from arriving together. */
const POLL_MS = 2500;
const JITTER = 0.4;
const RETRY_CEILING_MS = 15000;

export type Connection = 'opening' | 'live' | 'stale';

/** A vote the server has confirmed at a version the poll has not reached yet. */
type Echo = { votes: number; version: number };

interface RoomState {
	questions: Question[];
	moderated: boolean;
	open: boolean;
	notice: string;
	connection: Connection;
	asked: Set<string>;
	voted: Set<string>;
	/** The registry has no such room, so nothing here will ever load. */
	missing: boolean;
	error: string | null;
	ask: (text: string, named: boolean) => Promise<boolean>;
	toggleVote: (id: string) => Promise<void>;
	withdraw: (id: string) => Promise<void>;
	dismissError: () => void;
}

function withEcho(question: Question, echoes: Map<string, Echo>, version: number): Question {
	const echo = echoes.get(question.id);
	return echo && version < echo.version ? { ...question, votes: echo.votes } : question;
}

export function useRoom(roomId: string): RoomState {
	const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
	const [connection, setConnection] = useState<Connection>('opening');
	const [mine, setMine] = useState<Question[]>([]);
	const [asked, setAsked] = useState(() => recall(roomId, 'asked'));
	const [voted, setVoted] = useState(() => recall(roomId, 'votes'));
	const [echoes, setEchoes] = useState<Map<string, Echo>>(new Map());
	const [error, setError] = useState<string | null>(null);
	const [missing, setMissing] = useState(false);
	const refresh = useRef(() => {});

	useEffect(() => {
		let stopped = false;
		let timer: ReturnType<typeof setTimeout> | undefined;
		let etag: string | null = null;
		let failures = 0;
		let loaded = false;

		const schedule = () => {
			const wait = failures
				? Math.min(POLL_MS * 2 ** failures, RETRY_CEILING_MS)
				: POLL_MS * (1 - JITTER / 2 + Math.random() * JITTER);
			timer = setTimeout(poll, wait);
		};

		const poll = async () => {
			// A hidden tab stops asking, but the first read happens regardless, or a
			// link opened in the background is a skeleton until looked at.
			if (document.hidden && loaded) return schedule();
			try {
				const result = await api.read(roomId, etag);
				if (stopped) return;
				etag = result.etag;
				if (result.snapshot) setSnapshot(result.snapshot);
				failures = 0;
				loaded = true;
				setConnection('live');
			} catch (cause) {
				if (stopped) return;
				if (cause instanceof api.ApiError && cause.status === 404) {
					setMissing(true);
					return;
				}
				failures += 1;
				setConnection('stale');
			}
			schedule();
		};

		refresh.current = () => {
			clearTimeout(timer);
			etag = null;
			void poll();
		};
		const onVisible = () => {
			if (!document.hidden) refresh.current();
		};

		void poll();
		document.addEventListener('visibilitychange', onVisible);
		return () => {
			stopped = true;
			clearTimeout(timer);
			document.removeEventListener('visibilitychange', onVisible);
		};
	}, [roomId]);

	const ask = useCallback(
		async (text: string, named: boolean) => {
			const id = crypto.randomUUID();
			try {
				const result = await api.ask(roomId, id, text, named ? 'me' : 'anonymous', voterId());
				setMine((current) => [...current, result.question]);
				setAsked(remember(roomId, 'asked', id, true));
				refresh.current();
				return true;
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'could not send the question');
				return false;
			}
		},
		[roomId],
	);

	const toggleVote = useCallback(
		async (id: string) => {
			const wanted = !voted.has(id);
			setVoted(remember(roomId, 'votes', id, wanted));
			try {
				const result = await api.vote(roomId, id, voterId(), wanted);
				if ('votes' in result) {
					setEchoes((current) => new Map(current).set(id, result));
				}
				refresh.current();
			} catch (cause) {
				setVoted(remember(roomId, 'votes', id, !wanted));
				setError(cause instanceof Error ? cause.message : 'could not register the vote');
			}
		},
		[roomId, voted],
	);

	const withdraw = useCallback(
		async (id: string) => {
			try {
				await api.withdraw(roomId, id, voterId());
				setMine((current) => current.filter((question) => question.id !== id));
				refresh.current();
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'could not take the question back');
			}
		},
		[roomId],
	);

	const questions = useMemo(() => {
		const version = snapshot?.version ?? 0;
		const seen = new Set((snapshot?.questions ?? []).map((question) => question.id));
		const live = (snapshot?.questions ?? [])
			.filter((question) => !offScreen(question.status))
			.map((question) => withEcho(question, echoes, version));
		// Own questions come from the post's answer until the cached read catches up.
		return [...live, ...mine.filter((question) => !seen.has(question.id))];
	}, [snapshot, mine, echoes]);

	return {
		questions,
		moderated: snapshot?.moderated ?? false,
		// Open until told otherwise, so the form does not flash a closed notice on load.
		open: snapshot?.open ?? true,
		notice: snapshot?.notice ?? '',
		connection,
		asked,
		voted,
		missing,
		error,
		ask,
		toggleVote,
		withdraw,
		dismissError: useCallback(() => setError(null), []),
	};
}
