/** The wire contract. Nothing here imports a worker module, so the client can
 * be type checked against it. */

export const STATUSES = [
	'pending',
	'published',
	'answering',
	'answered',
	'dismissed',
	'archived',
	'withdrawn',
] as const;

export type Status = (typeof STATUSES)[number];

/** Where an operator can move a question. Only the asker withdraws; nothing returns to review. */
export type Target = Exclude<Status, 'pending' | 'withdrawn'>;

/** Off every audience screen. The row still travels, blank, so a screen can drop its own copy. */
export function offScreen(status: Status): boolean {
	return status === 'dismissed' || status === 'archived' || status === 'withdrawn';
}

/** Long enough to notice a mis-send, short enough that a question on the stage stays put. */
export const WITHDRAW_MS = 5 * 60_000;

/** The asker may still take it back: young, and nobody has picked it up yet. */
export function withdrawable(question: Question, now: number): boolean {
	return (
		(question.status === 'pending' || question.status === 'published') &&
		now - question.createdAt <= WITHDRAW_MS
	);
}

/** Null, on `Question`, means nothing has tried to translate it yet. */
export type StoredTranslation =
	| { ok: true; headline: string | null; full: string }
	| { ok: false; error: string; attempts: number };

/** Who asked, as they were called at the time. Null is anonymous. */
export interface Asker {
	name: string;
	avatar: string | null;
}

export interface Question {
	id: string;
	text: string;
	translation: StoredTranslation | null;
	votes: number;
	status: Status;
	version: number;
	createdAt: number;
	asker: Asker | null;
}

export interface Snapshot {
	version: number;
	moderated: boolean;
	/** False once an operator has closed the room to new questions. */
	open: boolean;
	/** One line from the operators for every screen; empty is none. */
	notice: string;
	/** False when no translator is configured, so no screen promises one. */
	translates: boolean;
	questions: Question[];
}

/**
 * A stale client is expected, so a missing question is a result, not a throw:
 * workerd logs thrown RPC errors as uncaught exceptions. The version rides along
 * so the client can re-fetch from where it actually is.
 */
type UnknownQuestion = { status: 'unknown-question'; version: number };

export type RoomSettings = Pick<Snapshot, 'version' | 'moderated' | 'open' | 'notice'>;

export type Refused = { status: 'room-full' | 'room-closed'; version: number };

export type AskResult = { created: boolean; version: number; question: Question } | Refused;

export type VoteResult =
	| { status: 'changed' | 'unchanged'; version: number; votes: number }
	| UnknownQuestion;

export type StatusResult =
	| { status: 'changed' | 'unchanged'; version: number; question: Question }
	| UnknownQuestion;

export type WithdrawResult =
	| { status: 'withdrawn' | 'unchanged' | 'not-yours' | 'too-late'; version: number }
	| UnknownQuestion;

export type TranslationResult =
	| { status: 'applied'; version: number; question: Question }
	| UnknownQuestion;

/** Bounds what one room can be made to store; the display caps live elsewhere. */
export const TEXT_MAX = 2000;
export const ID_MAX = 64;

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

const TARGETS: readonly string[] = STATUSES.filter((s) => s !== 'pending' && s !== 'withdrawn');

export function requireTarget(value: string): Target {
	if (!TARGETS.includes(value)) throw new Error(`status must be one of: ${TARGETS.join(', ')}`);
	return value as Target;
}

export const NAME_MAX = 40;

/** Long enough for a time and a sentence, short enough to stay one line on the stage. */
export const NOTICE_MAX = 140;

/** Empty clears it. */
export function requireNotice(value: string): string {
	const notice = value.trim().replace(/\s+/g, ' ');
	if (notice.length > NOTICE_MAX)
		throw new Error(`notice must be at most ${NOTICE_MAX} characters`);
	return notice;
}

export function requireName(value: string): string {
	const name = value.trim().replace(/\s+/g, ' ');
	if (name.length === 0 || name.length > NAME_MAX) {
		throw new Error(`name must be 1 to ${NAME_MAX} characters`);
	}
	return name;
}

/** Only a shape check; the provider is who vouches for the address. A string, so
 * an input's `pattern` can take it unanchored. */
export const EMAIL_PATTERN = '[^\\s@]+@[^\\s@]+\\.[^\\s@]+';
export const EMAIL_MAX = 254;
const EMAIL = new RegExp(`^${EMAIL_PATTERN}$`);

export function requireEmail(value: string): string {
	const email = value.trim().toLowerCase();
	if (email.length > EMAIL_MAX || !EMAIL.test(email)) {
		throw new Error('email must look like an address');
	}
	return email;
}

/** Load tests use these. They are never in the registry, and anyone may empty them. */
export const SCRATCH_PREFIX = 'scratch-';

export function isScratch(id: string): boolean {
	return id.startsWith(SCRATCH_PREFIX);
}

/** A room the registry knows. Scratch rooms are not in it, so they carry no date. */
export interface RoomInfo {
	id: string;
	createdAt: number | null;
}

export interface Operator {
	email: string;
	addedAt: number;
}

export type Provider = 'google' | 'github';

/** Someone who signed in. Only what a screen needs to show them. */
export interface Account {
	id: string;
	provider: Provider;
	email: string | null;
	name: string;
	avatar: string | null;
}

/** What the browser is told about its own session. */
export interface Me {
	account: Account;
	admin: boolean;
}

export const NO_DEVICE = 'no device cookie; claim one first';

/** The 401 a write gets without a device cookie, naming the check a claim must pass. */
export interface DeviceRefusal {
	error: typeof NO_DEVICE;
	sitekey: string | null;
}
