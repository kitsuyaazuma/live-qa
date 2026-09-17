import type {
	Me,
	Operator,
	Question,
	RoomInfo,
	Snapshot,
	StatusResult,
	VoteResult,
} from '../protocol';

const JSON_BODY = { 'content-type': 'application/json' };

export class ApiError extends Error {
	constructor(
		readonly status: number,
		message: string,
	) {
		super(message);
	}
}

/** Hono sends a plain string for a rejected request and json for a refused one. */
async function reason(response: Response): Promise<string> {
	const body = await response.text();
	try {
		const parsed = JSON.parse(body) as { error?: unknown };
		if (typeof parsed.error === 'string') return parsed.error;
	} catch {
		// Not json: the body is the message.
	}
	return body.slice(0, 200) || response.statusText;
}

function rooms(roomId: string): string {
	return `/api/rooms/${encodeURIComponent(roomId)}`;
}

async function send<T>(path: string, init: RequestInit): Promise<T> {
	const response = await fetch(path, init);
	if (!response.ok) throw new ApiError(response.status, await reason(response));
	return (await response.json()) as T;
}

export interface Asked {
	created: boolean;
	version: number;
	question: Question;
}

export function ask(roomId: string, id: string, text: string): Promise<Asked> {
	return send(`${rooms(roomId)}/questions`, {
		method: 'POST',
		headers: JSON_BODY,
		body: JSON.stringify({ id, text }),
	});
}

export function vote(
	roomId: string,
	questionId: string,
	voterId: string,
	voted: boolean,
): Promise<VoteResult> {
	return send(`${rooms(roomId)}/questions/${encodeURIComponent(questionId)}/vote`, {
		method: 'PUT',
		headers: JSON_BODY,
		body: JSON.stringify({ voterId, voted }),
	});
}

/** A null snapshot is a 304: the room has not moved since that etag. */
export async function read(
	roomId: string,
	etag: string | null,
): Promise<{ snapshot: Snapshot | null; etag: string | null }> {
	const response = await fetch(`${rooms(roomId)}/questions`, {
		headers: etag ? { 'if-none-match': etag } : undefined,
	});
	if (response.status === 304) return { snapshot: null, etag };
	if (!response.ok) throw new ApiError(response.status, await reason(response));
	return { snapshot: (await response.json()) as Snapshot, etag: response.headers.get('etag') };
}

export function setStatus(
	roomId: string,
	questionId: string,
	status: Question['status'],
): Promise<StatusResult> {
	return send(`${rooms(roomId)}/questions/${encodeURIComponent(questionId)}`, {
		method: 'PATCH',
		headers: JSON_BODY,
		body: JSON.stringify({ status }),
	});
}

export function setModeration(
	roomId: string,
	enabled: boolean,
): Promise<{ version: number; moderated: boolean }> {
	return send(rooms(roomId), {
		method: 'PATCH',
		headers: JSON_BODY,
		body: JSON.stringify({ moderated: enabled }),
	});
}

/** Null is nobody: the browser holds no session the worker accepts. */
export async function me(): Promise<Me | null> {
	const response = await fetch('/api/me');
	if (response.status === 401) return null;
	if (!response.ok) throw new ApiError(response.status, await reason(response));
	return (await response.json()) as Me;
}

export async function signOut(): Promise<void> {
	await fetch('/auth/logout', { method: 'POST' });
}

export interface RoomAccess {
	room: RoomInfo;
	/** Whether the account behind the cookie may run this room. */
	operator: boolean;
}

/** Null when there is no such room. */
export async function roomInfo(roomId: string): Promise<RoomAccess | null> {
	const response = await fetch(rooms(roomId));
	if (response.status === 404) return null;
	if (!response.ok) throw new ApiError(response.status, await reason(response));
	return (await response.json()) as RoomAccess;
}

export async function listRooms(): Promise<RoomInfo[]> {
	return (await send<{ rooms: RoomInfo[] }>('/api/rooms', {})).rooms;
}

export async function createRoom(id: string): Promise<RoomInfo> {
	const created = await send<{ room: RoomInfo }>('/api/rooms', {
		method: 'POST',
		headers: JSON_BODY,
		body: JSON.stringify({ id }),
	});
	return created.room;
}

export function deleteRoom(roomId: string): Promise<{ deleted: string }> {
	return send(rooms(roomId), { method: 'DELETE' });
}

export async function operators(roomId: string): Promise<Operator[]> {
	return (await send<{ operators: Operator[] }>(`${rooms(roomId)}/operators`, {})).operators;
}

export async function setOperator(
	roomId: string,
	email: string,
	present: boolean,
): Promise<Operator[]> {
	const changed = await send<{ operators: Operator[] }>(
		`${rooms(roomId)}/operators/${encodeURIComponent(email)}`,
		{ method: present ? 'PUT' : 'DELETE' },
	);
	return changed.operators;
}
