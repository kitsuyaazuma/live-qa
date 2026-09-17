import type { Operator, RoomInfo } from './protocol';

/** Load tests use these. They are never in the registry, and anyone may empty them. */
export const SCRATCH_PREFIX = 'scratch-';

export function isScratch(id: string): boolean {
	return id.startsWith(SCRATCH_PREFIX);
}

type RoomRow = { id: string; created_at: number };
type OperatorRow = { email: string; added_at: number };

const ROOM = 'id, created_at';

function toInfo(row: RoomRow): RoomInfo {
	return { id: row.id, createdAt: row.created_at };
}

/** Null when the name is taken. */
export async function createRoom(db: D1Database, id: string, by: string): Promise<RoomInfo | null> {
	const row = await db
		.prepare(
			`INSERT INTO rooms (id, created_by, created_at) VALUES (?, ?, ?)
			 ON CONFLICT (id) DO NOTHING
			 RETURNING ${ROOM}`,
		)
		.bind(id, by, Date.now())
		.first<RoomRow>();
	return row && toInfo(row);
}

export async function findRoom(db: D1Database, id: string): Promise<RoomInfo | null> {
	if (isScratch(id)) return { id, createdAt: null };
	const row = await db.prepare(`SELECT ${ROOM} FROM rooms WHERE id = ?`).bind(id).first<RoomRow>();
	return row && toInfo(row);
}

export async function deleteRoom(db: D1Database, id: string): Promise<boolean> {
	const { meta } = await db.prepare('DELETE FROM rooms WHERE id = ?').bind(id).run();
	return meta.changes > 0;
}

/** Every room for an admin; for anyone else, the rooms their email is on. */
export async function listRooms(
	db: D1Database,
	email: string | null,
	all: boolean,
): Promise<RoomInfo[]> {
	if (!all && !email) return [];
	const { results } = all
		? await db.prepare(`SELECT ${ROOM} FROM rooms ORDER BY created_at DESC`).all<RoomRow>()
		: await db
				.prepare(
					`SELECT r.id, r.created_at FROM rooms r
					 JOIN room_operators o ON o.room_id = r.id
					 WHERE o.email = ? ORDER BY r.created_at DESC`,
				)
				.bind(email)
				.all<RoomRow>();
	return results.map(toInfo);
}

export async function isOperator(
	db: D1Database,
	roomId: string,
	email: string | null,
): Promise<boolean> {
	if (!email) return false;
	const row = await db
		.prepare('SELECT 1 AS yes FROM room_operators WHERE room_id = ? AND email = ?')
		.bind(roomId, email.toLowerCase())
		.first();
	return row !== null;
}

export async function operatorsOf(db: D1Database, roomId: string): Promise<Operator[]> {
	const { results } = await db
		.prepare('SELECT email, added_at FROM room_operators WHERE room_id = ? ORDER BY added_at')
		.bind(roomId)
		.all<OperatorRow>();
	return results.map((row) => ({ email: row.email, addedAt: row.added_at }));
}

export async function addOperator(
	db: D1Database,
	roomId: string,
	email: string,
	by: string,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO room_operators (room_id, email, added_by, added_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT (room_id, email) DO NOTHING`,
		)
		.bind(roomId, email, by, Date.now())
		.run();
}

export async function removeOperator(db: D1Database, roomId: string, email: string): Promise<void> {
	await db
		.prepare('DELETE FROM room_operators WHERE room_id = ? AND email = ?')
		.bind(roomId, email)
		.run();
}
