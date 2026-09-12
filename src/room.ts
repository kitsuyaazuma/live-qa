import { DurableObject } from 'cloudflare:workers';

export const STATUSES = ['pending', 'published', 'answering', 'answered', 'dismissed'] as const;

export type Status = (typeof STATUSES)[number];

/** Null, on `Question`, means nothing has tried to translate it yet. */
export type StoredTranslation =
	| { ok: true; headline: string | null; full: string }
	| { ok: false; error: string; attempts: number };

export interface Question {
	id: string;
	text: string;
	translation: StoredTranslation | null;
	votes: number;
	status: Status;
	version: number;
	createdAt: number;
}

export type SnapshotView = 'audience' | 'moderator';

export interface Snapshot {
	version: number;
	moderated: boolean;
	questions: Question[];
}

/**
 * A stale client is expected, so a missing question is a result, not a throw:
 * workerd logs thrown RPC errors as uncaught exceptions. The version rides along
 * so the client can re-fetch from where it actually is.
 */
type UnknownQuestion = { status: 'unknown-question'; version: number };

export type VoteResult =
	| { status: 'changed' | 'unchanged'; version: number; votes: number }
	| UnknownQuestion;

export type StatusResult =
	| { status: 'changed' | 'unchanged'; version: number; question: Question }
	| UnknownQuestion;

export type TranslationResult =
	| { status: 'applied'; version: number; question: Question }
	| UnknownQuestion;

/** Bounds what one room can be made to store; the display caps live elsewhere. */
const TEXT_MAX = 2000;
const ID_MAX = 64;

const COLUMNS = 'id, text, translation, votes, status, version, created_at';

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
		CHECK (status IN ('pending', 'published', 'answering', 'answered', 'dismissed')),
	version INTEGER NOT NULL,
	created_at INTEGER NOT NULL
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
	moderated INTEGER NOT NULL DEFAULT 0
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
};

/** Enough for a client to take the question off screen, and nothing more. */
function withoutContent(question: Question): Question {
	return { ...question, text: '', translation: null };
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

function toQuestion(row: QuestionRow): Question {
	return {
		id: row.id,
		text: row.text,
		translation: parseTranslation(row.translation),
		votes: row.votes,
		status: row.status as Status,
		version: row.version,
		createdAt: row.created_at,
	};
}

export function requireId(value: string, field: string): string {
	if (value.length === 0 || value.length > ID_MAX) {
		throw new Error(`${field} must be 1 to ${ID_MAX} characters`);
	}
	return value;
}

export function requireText(value: string): string {
	const text = value.trim();
	if (text.length === 0 || text.length > TEXT_MAX) {
		throw new Error(`text must be 1 to ${TEXT_MAX} characters after trimming`);
	}
	return text;
}

/** Nothing returns to `pending`: a reviewed question must not become unreviewed. */
export function requireTarget(value: string): Exclude<Status, 'pending'> {
	if (value === 'pending' || !(STATUSES as readonly string[]).includes(value)) {
		throw new Error(`status must be one of: ${STATUSES.slice(1).join(', ')}`);
	}
	return value as Exclude<Status, 'pending'>;
}

/** One instance per Q&A room, addressed by room id. */
export class Room extends DurableObject<Env> {
	private version = 0;
	private moderated = false;

	constructor(ctx: DurableObjectState, env: Env) {
		super(ctx, env);
		ctx.blockConcurrencyWhile(async () => {
			ctx.storage.sql.exec(SCHEMA);
			const row = ctx.storage.sql
				.exec<{ version: number; moderated: number }>(
					'SELECT version, moderated FROM room WHERE id = 1',
				)
				.one();
			this.version = row.version;
			this.moderated = row.moderated === 1;
		});
	}

	/** The caller's `id` is the idempotency key: a retry consumes no version. */
	async postQuestion(input: { id: string; text: string }): Promise<{
		created: boolean;
		version: number;
		question: Question;
	}> {
		const id = requireId(input.id, 'id');
		const text = requireText(input.text);
		const sql = this.ctx.storage.sql;
		const next = this.version + 1;

		const created =
			sql.exec(
				`INSERT OR IGNORE INTO questions (id, text, status, version, created_at)
				 VALUES (?, ?, ?, ?, ?)`,
				id,
				text,
				this.moderated ? 'pending' : 'published',
				next,
				Date.now(),
			).rowsWritten > 0;

		if (created) this.commit(next);

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

	/** Pending questions stay pending: switching off must not publish them. */
	async setModeration(enabled: boolean): Promise<{ version: number; moderated: boolean }> {
		if (enabled === this.moderated) return { version: this.version, moderated: this.moderated };

		const next = this.version + 1;
		this.ctx.storage.sql.exec('UPDATE room SET moderated = ? WHERE id = 1', enabled ? 1 : 0);
		this.moderated = enabled;
		this.commit(next);

		return { version: this.version, moderated: this.moderated };
	}

	/**
	 * `view` is required because a default is a thing to forget, and forgetting it
	 * on the audience route would put dismissed text on every screen. Dismissed
	 * questions are blanked rather than dropped, so the diff can still tell a
	 * client to take one off screen; pending ones are dropped outright, which is
	 * safe only because nothing returns to `pending`.
	 *
	 * `moderated` changes no row, so it rides in the payload, not the diff.
	 */
	async snapshot(input: { view: SnapshotView; since?: number }): Promise<Snapshot> {
		const audience = input.view === 'audience';
		const rows = this.ctx.storage.sql
			.exec<QuestionRow>(
				`SELECT ${COLUMNS} FROM questions
				 WHERE version > ?${audience ? ` AND status != 'pending'` : ''}
				 ORDER BY version`,
				input.since ?? 0,
			)
			.toArray();

		const questions = rows.map((row) => {
			const question = toQuestion(row);
			return audience && question.status === 'dismissed' ? withoutContent(question) : question;
		});

		return { version: this.version, moderated: this.moderated, questions };
	}

	/** `deleteAll` because internal metadata survives selective deletion. */
	async reset(): Promise<void> {
		await this.ctx.storage.deleteAll();
		this.ctx.storage.sql.exec(SCHEMA);
		this.version = 0;
		this.moderated = false;
	}

	/** Runs with no await since the last write, so the room row lands atomically. */
	private commit(version: number): void {
		this.ctx.storage.sql.exec('UPDATE room SET version = ? WHERE id = 1', version);
		this.version = version;
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
}
