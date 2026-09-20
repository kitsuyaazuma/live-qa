import { DurableObject } from 'cloudflare:workers';
import { translationSettingsFromEnv } from './config';
import {
	type Asker,
	type AskResult,
	offScreen,
	type Question,
	type RoomSettings,
	requireId,
	requireNotice,
	requireTarget,
	requireText,
	type Snapshot,
	type Status,
	type StatusResult,
	type StoredTranslation,
	type TranslationResult,
	type VoteResult,
	type WithdrawResult,
	withdrawable,
} from './protocol';
import { type TranslationSettings, WorkersAiTranslator } from './translate';

export type SnapshotView = 'audience' | 'operator';

/** Workers AI allows three hundred text generations a minute per account. */
const TRANSLATION_BATCH = 5;
const TRANSLATION_DELAY_MS = 1000;
const TRANSLATION_ATTEMPTS_MAX = 3;

/** Past this a room is being flooded, not asked; a retry of a stored id still lands. */
const QUESTIONS_MAX = 2000;

/** Operator screens, and a leak rather than an audience past that. */
const STREAMS_MAX = 8;

/** Short enough that no proxy decides an idle stream has died, and it doubles
 * as the reaper: a screen that closed is noticed on the next failed write. */
const HEARTBEAT_MS = 15000;

const COLUMNS = 'id, text, translation, votes, status, version, created_at, asker';

/**
 * The counter is its own row, not `MAX(questions.version)`, so a delete cannot
 * walk it backwards. The status default is the closed one deliberately.
 */
const SCHEMA = `
CREATE TABLE IF NOT EXISTS questions (
	id TEXT PRIMARY KEY,
	text TEXT NOT NULL,
	translation TEXT,
	votes INTEGER NOT NULL DEFAULT 0 CHECK (votes >= 0),
	status TEXT NOT NULL DEFAULT 'pending'
		CHECK (status IN ('pending', 'published', 'answering', 'answered', 'dismissed', 'archived', 'withdrawn')),
	version INTEGER NOT NULL,
	created_at INTEGER NOT NULL,
	asker TEXT,
	owner TEXT
) STRICT;

CREATE INDEX IF NOT EXISTS questions_version ON questions (version);

CREATE UNIQUE INDEX IF NOT EXISTS questions_answering
	ON questions (status) WHERE status = 'answering';

CREATE TABLE IF NOT EXISTS votes (
	question_id TEXT NOT NULL,
	voter_id TEXT NOT NULL,
	PRIMARY KEY (question_id, voter_id)
) STRICT;

CREATE TABLE IF NOT EXISTS room (
	id INTEGER PRIMARY KEY CHECK (id = 1),
	version INTEGER NOT NULL DEFAULT 0,
	moderated INTEGER NOT NULL DEFAULT 0,
	open INTEGER NOT NULL DEFAULT 1,
	notice TEXT NOT NULL DEFAULT ''
) STRICT;

INSERT OR IGNORE INTO room (id, version, moderated) VALUES (1, 0, 0);
`;

type QuestionRow = {
	id: string;
	text: string;
	translation: string | null;
	votes: number;
	status: string;
	version: number;
	created_at: number;
	asker: string | null;
};

/** Enough for a client to take the question off screen, and nothing more. */
function withoutContent(question: Question): Question {
	return { ...question, text: '', translation: null, asker: null };
}

/** Reported, not thrown: one bad row must not take down a whole snapshot. */
function parseTranslation(raw: string | null): StoredTranslation | null {
	if (raw === null) return null;
	try {
		return JSON.parse(raw) as StoredTranslation;
	} catch {
		return { ok: false, error: 'stored translation is not valid json', attempts: 0 };
	}
}

function parseAsker(raw: string | null): Asker | null {
	if (raw === null) return null;
	try {
		return JSON.parse(raw) as Asker;
	} catch {
		return null;
	}
}

const encoder = new TextEncoder();

type Stream = WritableStreamDefaultWriter<Uint8Array>;

function frame(version: number, diff: Snapshot): Uint8Array {
	return encoder.encode(`id: ${version}\ndata: ${JSON.stringify(diff)}\n\n`);
}

function toQuestion(row: QuestionRow): Question {
	return {
		id: row.id,
		text: row.text,
		translation: parseTranslation(row.translation),
		votes: row.votes,
		status: row.status as Status,
		version: row.version,
		createdAt: row.created_at,
		asker: parseAsker(row.asker),
	};
}

/** One instance per Q&A room, addressed by room id. */
export class Room extends DurableObject<Env> {
	private version = 0;
	private moderated = false;
	private open = true;
	private notice = '';
	private readonly streams = new Set<Stream>();
	private beat: ReturnType<typeof setInterval> | undefined;
	private readonly translation: TranslationSettings | null;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		this.translation = translationSettingsFromEnv(env);
		ctx.blockConcurrencyWhile(async () => {
			const sql = ctx.storage.sql;
			sql.exec(SCHEMA);
			const row = sql
				.exec<{ version: number; moderated: number; open: number; notice: string }>(
					'SELECT version, moderated, open, notice FROM room WHERE id = 1',
				)
				.one();
			this.version = row.version;
			this.moderated = row.moderated === 1;
			this.open = row.open === 1;
			this.notice = row.notice;
			// The question and its alarm are separate writes, so one can arrive alone.
			if (this.untranslated(1).length > 0) await this.scheduleTranslation();
		});
	}

	/** The caller's `id` is the idempotency key: a retry consumes no version. */
	async postQuestion(input: {
		id: string;
		text: string;
		asker?: Asker | null;
		/** The voter id of the device that asked; only it may withdraw. */
		owner?: string | null;
	}): Promise<AskResult> {
		const id = requireId(input.id, 'id');
		const text = requireText(input.text);
		const sql = this.ctx.storage.sql;
		const next = this.version + 1;

		if (!this.exists(id)) {
			if (!this.open) return { status: 'room-closed', version: this.version };
			if (this.count() >= QUESTIONS_MAX) return { status: 'room-full', version: this.version };
		}

		const created =
			sql.exec(
				`INSERT OR IGNORE INTO questions (id, text, status, version, created_at, asker, owner)
				 VALUES (?, ?, ?, ?, ?, ?, ?)`,
				id,
				text,
				this.moderated ? 'pending' : 'published',
				next,
				Date.now(),
				input.asker ? JSON.stringify(input.asker) : null,
				input.owner ?? null,
			).rowsWritten > 0;

		if (created) {
			this.commit(next);
			await this.scheduleTranslation();
		}

		return { created, version: this.version, question: this.question(id) };
	}

	/**
	 * Takes the state the voter wants rather than toggling, so a retry after a
	 * lost response cannot undo the vote it was retrying. There is no downvote:
	 * a negative count on the audience screen would shame the asker.
	 */
	async setVote(input: {
		questionId: string;
		voterId: string;
		voted: boolean;
	}): Promise<VoteResult> {
		const questionId = requireId(input.questionId, 'questionId');
		const voterId = requireId(input.voterId, 'voterId');
		const sql = this.ctx.storage.sql;

		if (!this.exists(questionId)) {
			return { status: 'unknown-question', version: this.version };
		}

		const next = this.version + 1;
		const changed =
			(input.voted
				? sql.exec(
						'INSERT OR IGNORE INTO votes (question_id, voter_id) VALUES (?, ?)',
						questionId,
						voterId,
					)
				: sql.exec('DELETE FROM votes WHERE question_id = ? AND voter_id = ?', questionId, voterId)
			).rowsWritten > 0;

		if (changed) {
			sql.exec(
				'UPDATE questions SET votes = votes + ?, version = ? WHERE id = ?',
				input.voted ? 1 : -1,
				next,
				questionId,
			);
			this.commit(next);
		}

		return {
			status: changed ? 'changed' : 'unchanged',
			version: this.version,
			votes: this.question(questionId).votes,
		};
	}

	/**
	 * Moving on counts as finishing, so the question on screen is demoted — and
	 * reopening exists for when it was not. Demotion first, or the index refuses.
	 */
	async setStatus(input: { id: string; status: Status }): Promise<StatusResult> {
		const id = requireId(input.id, 'id');
		const target = requireTarget(input.status);
		const sql = this.ctx.storage.sql;

		if (!this.exists(id)) return { status: 'unknown-question', version: this.version };

		const current = this.question(id);
		if (current.status === target) {
			return { status: 'unchanged', version: this.version, question: current };
		}

		const next = this.version + 1;
		if (target === 'answering') {
			sql.exec(
				`UPDATE questions SET status = 'answered', version = ? WHERE status = 'answering'`,
				next,
			);
		}
		sql.exec('UPDATE questions SET status = ?, version = ? WHERE id = ?', target, next, id);
		this.commit(next);

		return { status: 'changed', version: this.version, question: this.question(id) };
	}

	async withdraw(input: { id: string; voterId: string }): Promise<WithdrawResult> {
		const id = requireId(input.id, 'id');
		const voterId = requireId(input.voterId, 'voterId');
		const sql = this.ctx.storage.sql;

		if (!this.exists(id)) return { status: 'unknown-question', version: this.version };
		const { owner } = sql
			.exec<{ owner: string | null }>('SELECT owner FROM questions WHERE id = ?', id)
			.one();
		if (owner === null || owner !== voterId) return { status: 'not-yours', version: this.version };

		const current = this.question(id);
		if (current.status === 'withdrawn') return { status: 'unchanged', version: this.version };
		if (!withdrawable(current, Date.now())) return { status: 'too-late', version: this.version };

		const next = this.version + 1;
		sql.exec(`UPDATE questions SET status = 'withdrawn', version = ? WHERE id = ?`, next, id);
		this.commit(next);
		return { status: 'withdrawn', version: this.version };
	}

	/** Failures keep a running count so a retry policy has something to read. */
	async applyTranslation(input: {
		id: string;
		result: { headline: string | null; full: string } | { error: string };
	}): Promise<TranslationResult> {
		const id = requireId(input.id, 'id');
		if (!this.exists(id)) return { status: 'unknown-question', version: this.version };

		const previous = this.question(id).translation;
		const stored: StoredTranslation =
			'error' in input.result
				? {
						ok: false,
						error: input.result.error,
						attempts: (previous && !previous.ok ? previous.attempts : 0) + 1,
					}
				: { ok: true, headline: input.result.headline, full: input.result.full };

		const next = this.version + 1;
		this.ctx.storage.sql.exec(
			'UPDATE questions SET translation = ?, version = ? WHERE id = ?',
			JSON.stringify(stored),
			next,
			id,
		);
		this.commit(next);

		return { status: 'applied', version: this.version, question: this.question(id) };
	}

	/** A failure is recorded as an attempt rather than thrown: a throw retries the
	 * whole batch, so one question the model refuses would hold up the rest. */
	async alarm(): Promise<void> {
		if (!this.translation) return;

		const due = this.untranslated(TRANSLATION_BATCH);
		if (due.length === 0) return;

		const translator = new WorkersAiTranslator(this.env.AI, this.translation);
		for (const result of await translator.translate(due)) {
			await this.applyTranslation({
				id: result.id,
				result: result.error
					? { error: result.error }
					: { headline: result.headline, full: result.full },
			});
		}

		// Asked again rather than inferred: questions arrive while the model works.
		if (this.untranslated(1).length > 0) {
			await this.ctx.storage.setAlarm(Date.now() + TRANSLATION_DELAY_MS);
		}
	}

	/** Everything leaves the screens at once; the export still has it all. */
	async archive(): Promise<{ version: number; archived: number }> {
		const sql = this.ctx.storage.sql;
		const archived = sql
			.exec<{ n: number }>(`SELECT count(*) AS n FROM questions WHERE status != 'archived'`)
			.one().n;
		if (archived > 0) {
			const next = this.version + 1;
			sql.exec(
				`UPDATE questions SET status = 'archived', version = ? WHERE status != 'archived'`,
				next,
			);
			this.commit(next);
		}
		return { version: this.version, archived };
	}

	/** Pending questions stay pending: switching off must not publish them. */
	async setModeration(enabled: boolean): Promise<RoomSettings> {
		if (enabled !== this.moderated) {
			this.ctx.storage.sql.exec('UPDATE room SET moderated = ? WHERE id = 1', enabled ? 1 : 0);
			this.moderated = enabled;
			this.commit(this.version + 1);
		}
		return this.settings();
	}

	async setNotice(value: string): Promise<RoomSettings> {
		const notice = requireNotice(value);
		if (notice !== this.notice) {
			this.ctx.storage.sql.exec('UPDATE room SET notice = ? WHERE id = 1', notice);
			this.notice = notice;
			this.commit(this.version + 1);
		}
		return this.settings();
	}

	/** Closing stops new questions only; votes on what is there keep moving. */
	async setOpen(open: boolean): Promise<RoomSettings> {
		if (open !== this.open) {
			this.ctx.storage.sql.exec('UPDATE room SET open = ? WHERE id = 1', open ? 1 : 0);
			this.open = open;
			this.commit(this.version + 1);
		}
		return this.settings();
	}

	/** `view` is required because a default is a thing to forget, and forgetting
	 * it on the audience route would put dismissed text on every screen. */
	async snapshot(input: { view: SnapshotView; since?: number }): Promise<Snapshot> {
		return this.project(input.view, input.since ?? 0);
	}

	/** Null past the cap: a thousand streams on one object is what the cached read exists to avoid. */
	async subscribe(since: number): Promise<ReadableStream | null> {
		if (this.streams.size >= STREAMS_MAX) return null;

		const { readable, writable } = new TransformStream<Uint8Array, Uint8Array>();
		const writer = writable.getWriter();
		this.streams.add(writer);
		this.beat ??= setInterval(() => this.each(encoder.encode(': beat\n\n')), HEARTBEAT_MS);
		this.send(writer, frame(this.version, this.project('operator', since)));

		return readable;
	}

	/** `deleteAll` because internal metadata survives selective deletion. */
	async reset(): Promise<void> {
		await this.ctx.storage.deleteAll();
		this.ctx.storage.sql.exec(SCHEMA);
		this.version = 0;
		this.moderated = false;
		this.open = true;
		this.notice = '';
		// A screen cannot be told to forget in a diff, so it is made to reconnect.
		for (const writer of this.streams) void writer.close().catch(() => {});
		this.streams.clear();
	}

	/** Runs with no await since the last write, so the room row lands atomically. */
	private commit(version: number): void {
		this.ctx.storage.sql.exec('UPDATE room SET version = ? WHERE id = 1', version);
		this.version = version;
		// Only the rows this version touched: a screen holds the rest already.
		if (this.streams.size > 0) this.each(frame(version, this.project('operator', version - 1)));
	}

	private each(bytes: Uint8Array): void {
		for (const writer of this.streams) this.send(writer, bytes);
	}

	/** Not awaited: a commit must reach the room row with no await in between,
	 * and a screen that has closed must not hold up the room. */
	private send(writer: Stream, bytes: Uint8Array): void {
		writer.write(bytes).catch(() => {
			this.streams.delete(writer);
			if (this.streams.size === 0) {
				clearInterval(this.beat);
				this.beat = undefined;
			}
		});
	}

	/**
	 * Dismissed and archived questions are blanked rather than dropped, so a diff
	 * can still tell a screen to take one down; pending ones are dropped outright
	 * from the audience view, which is safe only because nothing returns to `pending`.
	 *
	 * The settings change no row, so they ride in the payload, not the diff.
	 */
	private project(view: SnapshotView, since: number): Snapshot {
		const audience = view === 'audience';
		const rows = this.ctx.storage.sql
			.exec<QuestionRow>(
				`SELECT ${COLUMNS} FROM questions
				 WHERE version > ?${audience ? ` AND status != 'pending'` : ''}
				 ORDER BY version`,
				since,
			)
			.toArray();

		const questions = rows.map((row) => {
			const question = toQuestion(row);
			return audience && offScreen(question.status) ? withoutContent(question) : question;
		});

		return { ...this.settings(), translates: this.translation !== null, questions };
	}

	private settings(): RoomSettings {
		return {
			version: this.version,
			moderated: this.moderated,
			open: this.open,
			notice: this.notice,
		};
	}

	private count(): number {
		return this.ctx.storage.sql.exec<{ n: number }>('SELECT count(*) AS n FROM questions').one().n;
	}

	private exists(id: string): boolean {
		return (
			this.ctx.storage.sql.exec('SELECT 1 FROM questions WHERE id = ?', id).toArray().length > 0
		);
	}

	private question(id: string): Question {
		return toQuestion(
			this.ctx.storage.sql
				.exec<QuestionRow>(`SELECT ${COLUMNS} FROM questions WHERE id = ?`, id)
				.one(),
		);
	}

	/** Only when none is pending, or a room that keeps receiving questions would
	 * push its own alarm out of reach. */
	private async scheduleTranslation(): Promise<void> {
		if (!this.translation) return;
		if ((await this.ctx.storage.getAlarm()) !== null) return;
		await this.ctx.storage.setAlarm(Date.now() + TRANSLATION_DELAY_MS);
	}

	/** `json_valid` first, so one unreadable row cannot wedge the queue. */
	private untranslated(limit: number): { id: string; text: string }[] {
		return this.ctx.storage.sql
			.exec<{ id: string; text: string }>(
				`SELECT id, text FROM questions
				 WHERE status NOT IN ('dismissed', 'archived', 'withdrawn')
				   AND (translation IS NULL
				        OR (json_valid(translation)
				            AND json_extract(translation, '$.ok') = 0
				            AND json_extract(translation, '$.attempts') < ?))
				 ORDER BY version
				 LIMIT ?`,
				TRANSLATION_ATTEMPTS_MAX,
				limit,
			)
			.toArray();
	}
}
