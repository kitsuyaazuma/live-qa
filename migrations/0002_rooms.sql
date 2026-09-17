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
