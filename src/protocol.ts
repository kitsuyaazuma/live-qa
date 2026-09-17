/** The wire contract. Nothing here imports a worker module, so the client can
 * be type checked against it. */

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

export interface Snapshot {
	version: number;
	moderated: boolean;
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

export type RoomFull = { status: 'room-full'; version: number };

export type AskResult = { created: boolean; version: number; question: Question } | RoomFull;

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

/** Nothing returns to `pending`: a reviewed question must not become unreviewed. */
export function requireTarget(value: string): Exclude<Status, 'pending'> {
	if (value === 'pending' || !(STATUSES as readonly string[]).includes(value)) {
		throw new Error(`status must be one of: ${STATUSES.slice(1).join(', ')}`);
	}
	return value as Exclude<Status, 'pending'>;
}

/** Only a shape check; the provider is who vouches for the address. */
export function requireEmail(value: string): string {
	const email = value.trim().toLowerCase();
	if (email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
		throw new Error('email must look like an address');
	}
	return email;
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
