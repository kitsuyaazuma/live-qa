CREATE TABLE users (
	id TEXT PRIMARY KEY,
	provider TEXT NOT NULL CHECK (provider IN ('google', 'github')),
	provider_id TEXT NOT NULL,
	email TEXT,
	name TEXT NOT NULL,
	avatar TEXT,
	created_at INTEGER NOT NULL,
	UNIQUE (provider, provider_id)
) STRICT;
