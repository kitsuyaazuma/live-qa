import type { Account, Provider } from './protocol';

/** What a provider hands over at sign-in. */
export interface Profile {
	provider: Provider;
	providerId: string;
	email: string | null;
	name: string;
	avatar: string | null;
}

type UserRow = {
	id: string;
	provider: string;
	email: string | null;
	name: string;
	avatar: string | null;
};

const COLUMNS = 'id, provider, email, name, avatar';

function toAccount(row: UserRow): Account {
	return {
		id: row.id,
		provider: row.provider as Provider,
		email: row.email,
		name: row.name,
		avatar: row.avatar,
	};
}

/** A returning account keeps its id and what it has chosen to be called;
 * the provider's current profile only fills in what is still empty. */
export async function signIn(db: D1Database, profile: Profile): Promise<Account> {
	const row = await db
		.prepare(
			`INSERT INTO users (id, provider, provider_id, email, name, avatar, created_at)
			 VALUES (?, ?, ?, ?, ?, ?, ?)
			 ON CONFLICT (provider, provider_id) DO UPDATE
			 SET email = excluded.email, avatar = COALESCE(users.avatar, excluded.avatar)
			 RETURNING ${COLUMNS}`,
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
		.first<UserRow>();
	if (!row) throw new Error('the sign-in wrote no row');
	return toAccount(row);
}

export async function findAccount(db: D1Database, id: string): Promise<Account | null> {
	const row = await db
		.prepare(`SELECT ${COLUMNS} FROM users WHERE id = ?`)
		.bind(id)
		.first<UserRow>();
	return row && toAccount(row);
}
