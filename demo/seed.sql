-- The demo's host and a participant who asks under their name.
INSERT OR IGNORE INTO users (id, provider, provider_id, email, name, avatar, created_at)
VALUES
  ('demo-host', 'google', 'demo-host', 'host@example.com', 'Host', NULL, 0),
  ('demo-mika', 'github', 'demo-mika', 'mika@example.com', 'Mika', NULL, 0);
