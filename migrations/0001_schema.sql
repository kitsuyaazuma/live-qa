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

CREATE TABLE avatars (
	user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
	bytes BLOB NOT NULL,
	type TEXT NOT NULL,
	updated_at INTEGER NOT NULL
) STRICT;

CREATE TABLE rooms (
	id TEXT PRIMARY KEY,
	created_by TEXT NOT NULL REFERENCES users(id),
	created_at INTEGER NOT NULL
) STRICT;

CREATE TABLE room_operators (
	room_id TEXT NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
	email TEXT NOT NULL,
	added_by TEXT NOT NULL REFERENCES users(id),
	added_at INTEGER NOT NULL,
	PRIMARY KEY (room_id, email)
) STRICT;

CREATE INDEX room_operators_email ON room_operators(email);
