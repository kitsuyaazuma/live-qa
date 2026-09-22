import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { NO_DEVICE, offScreen, type Question, type Snapshot } from '../protocol';
import * as api from './api';
import { recall, remember } from './storage';

/** The read is cached for two seconds, so faster only buys 304s. The jitter
 * keeps a thousand phones from arriving together. */
const POLL_MS = 2500;
const JITTER = 0.4;
const RETRY_CEILING_MS = 15000;
/** Long enough to read, short enough that a passing failure does not sit over the list. */
const ERROR_MS = 5000;

export type Connection = 'opening' | 'live' | 'stale';

/** A vote the server has confirmed at a version the poll has not reached yet. */
type Echo = { votes: number; version: number };

/** Where the write that needs the check was made, so the check is drawn there. */
export type WriteSite = { kind: 'ask' } | { kind: 'question'; id: string };

export interface Challenge {
	sitekey: string;
	at: WriteSite;
	pass: (token: string) => void;
	cancel: () => void;
}

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
	challenge: Challenge | null;
	/** Called on the first sign of a write, so the claim is done before the tap lands. */
	prepare: (at: WriteSite) => void;
	/** The new question's id, or null when it was not sent. */
	ask: (text: string, named: boolean) => Promise<string | null>;
	toggleVote: (id: string) => Promise<void>;
	withdraw: (id: string) => Promise<void>;
	dismissError: () => void;
}

function refused(cause: unknown): cause is api.ApiError {
	return cause instanceof api.ApiError && cause.message === NO_DEVICE;
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

	useEffect(() => {
		if (!error) return;
		const timer = setTimeout(() => setError(null), ERROR_MS);
		return () => clearTimeout(timer);
	}, [error]);
	const [challenge, setChallenge] = useState<Challenge | null>(null);
	const refresh = useRef(() => {});
	const claiming = useRef<Promise<void> | null>(null);
	const ready = useRef(false);

	const claim = useCallback(async (sitekey: unknown, at: WriteSite) => {
		const token =
			typeof sitekey === 'string'
				? await new Promise<string>((resolve, reject) => {
						setChallenge({
							sitekey,
							at,
							pass: resolve,
							cancel: () => reject(new Error('the check could not run; try again')),
						});
					}).finally(() => setChallenge(null))
				: undefined;
		await api.claimDevice(token);
	}, []);

	/** One claim at a time, shared by every write waiting on it. */
	const share = useCallback((run: () => Promise<void>) => {
		claiming.current ??= run()
			.then(() => {
				ready.current = true;
			})
			.finally(() => {
				claiming.current = null;
			});
		return claiming.current;
	}, []);

	const prepare = useCallback(
		(at: WriteSite) => {
			if (ready.current || claiming.current) return;
			share(() =>
				api.claimDevice().catch((cause: unknown) => {
					if (!refused(cause)) throw cause;
					return claim(cause.body.sitekey, at);
				}),
			).catch(() => {});
		},
		[claim, share],
	);

	/** A write from a browser the worker has not met is turned away naming the check;
	 * one claim later it goes through. */
	const asDevice = useCallback(
		async <T>(write: () => Promise<T>, at: WriteSite): Promise<T> => {
			if (claiming.current) await claiming.current;
			try {
				return await write();
			} catch (cause) {
				if (!refused(cause)) throw cause;
				await share(() => claim(cause.body.sitekey, at));
				return write();
			}
		},
		[claim, share],
	);

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
				const result = await asDevice(() => api.ask(roomId, id, text, named ? 'me' : 'anonymous'), {
					kind: 'ask',
				});
				setMine((current) => [...current, result.question]);
				setAsked(remember(roomId, 'asked', id, true));
				setError(null);
				refresh.current();
				return id;
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'could not send the question');
				return null;
			}
		},
		[roomId, asDevice],
	);

	const toggleVote = useCallback(
		async (id: string) => {
			const wanted = !voted.has(id);
			setVoted(remember(roomId, 'votes', id, wanted));
			try {
				const result = await asDevice(() => api.vote(roomId, id, wanted), { kind: 'question', id });
				if ('votes' in result) {
					setEchoes((current) => new Map(current).set(id, result));
				}
				setError(null);
				refresh.current();
			} catch (cause) {
				setVoted(remember(roomId, 'votes', id, !wanted));
				setError(cause instanceof Error ? cause.message : 'could not register the vote');
			}
		},
		[roomId, voted, asDevice],
	);

	const withdraw = useCallback(
		async (id: string) => {
			try {
				await asDevice(() => api.withdraw(roomId, id), { kind: 'question', id });
				setMine((current) => current.filter((question) => question.id !== id));
				setError(null);
				refresh.current();
			} catch (cause) {
				setError(cause instanceof Error ? cause.message : 'could not take the question back');
			}
		},
		[roomId, asDevice],
	);

	const questions = useMemo(() => {
		const version = snapshot?.version ?? 0;
		const seen = new Set((snapshot?.questions ?? []).map((question) => question.id));
		// A dismissed question of your own stays, as a stub, so it did not just vanish.
		const shown = (question: Question) =>
			!offScreen(question.status) || (question.status === 'dismissed' && asked.has(question.id));
		const live = (snapshot?.questions ?? [])
			.filter(shown)
			.map((question) => withEcho(question, echoes, version));
		// Own questions come from the post's answer until the cached read catches up.
		return [...live, ...mine.filter((question) => !seen.has(question.id))];
	}, [snapshot, mine, echoes, asked]);

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
		challenge,
		prepare,
		ask,
		toggleVote,
		withdraw,
		dismissError: useCallback(() => setError(null), []),
	};
}
