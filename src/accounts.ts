import type { Account, Provider } from './protocol';

/** What a provider hands over at sign-in. */
export interface Profile {
	provider: Provider;
	providerId: string;
	email: string | null;
	name: string;
	avatar: string | null;
}

export interface Picture {
	bytes: Uint8Array<ArrayBuffer>;
	type: string;
	updatedAt: number;
}

type UserRow = {
	id: string;
	provider: string;
	email: string | null;
	name: string;
	avatar: string | null;
	uploaded_at: number | null;
};

const ACCOUNT = `SELECT u.id, u.provider, u.email, u.name, u.avatar, a.updated_at AS uploaded_at
	FROM users u LEFT JOIN avatars a ON a.user_id = u.id`;

/** The version rides in the URL, so the picture itself can be cached for good. */
export function avatarPath(userId: string, version: number): string {
	return `/api/avatars/${encodeURIComponent(userId)}?v=${version}`;
}

function toAccount(row: UserRow): Account {
	return {
		id: row.id,
		provider: row.provider as Provider,
		email: row.email,
		name: row.name,
		avatar: row.uploaded_at === null ? row.avatar : avatarPath(row.id, row.uploaded_at),
	};
}

/** A returning account keeps its id and the name it has chosen; the provider's
 * current email and picture come along each time. */
export async function signIn(db: D1Database, profile: Profile): Promise<Account> {
	const row = await db
		.prepare(
			`INSERT INTO users (id, provider, provider_id, email, name, avatar, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (provider, provider_id) DO UPDATE
			 SET email = excluded.email, avatar = excluded.avatar
			 RETURNING id`,
		)
		.bind(
			crypto.randomUUID(),
			profile.provider,
			profile.providerId,
			profile.email,
			profile.name,
			profile.avatar,
			Date.now(),
		)
		.first<{ id: string }>();
	const account = row && (await findAccount(db, row.id));
	if (!account) throw new Error('the sign-in wrote no row');
	return account;
}

export async function findAccount(db: D1Database, id: string): Promise<Account | null> {
	const row = await db.prepare(`${ACCOUNT} WHERE u.id = ?`).bind(id).first<UserRow>();
	return row && toAccount(row);
}

export async function rename(db: D1Database, id: string, name: string): Promise<void> {
	await db.prepare('UPDATE users SET name = ? WHERE id = ?').bind(name, id).run();
}

export async function setAvatar(
	db: D1Database,
	id: string,
	bytes: ArrayBuffer,
	type: string,
): Promise<void> {
	await db
		.prepare(
			`INSERT INTO avatars (user_id, bytes, type, updated_at) VALUES (?, ?, ?, ?)
			 ON CONFLICT (user_id) DO UPDATE
			 SET bytes = excluded.bytes, type = excluded.type, updated_at = excluded.updated_at`,
		)
		.bind(id, bytes, type, Date.now())
		.run();
}

export async function clearAvatar(db: D1Database, id: string): Promise<void> {
	await db.prepare('DELETE FROM avatars WHERE user_id = ?').bind(id).run();
}

export async function avatarOf(db: D1Database, id: string): Promise<Picture | null> {
	// D1 hands a blob back as a plain array of numbers.
	const row = await db
		.prepare('SELECT bytes, type, updated_at FROM avatars WHERE user_id = ?')
		.bind(id)
		.first<{ bytes: number[]; type: string; updated_at: number }>();
	return row && { bytes: new Uint8Array(row.bytes), type: row.type, updatedAt: row.updated_at };
}
