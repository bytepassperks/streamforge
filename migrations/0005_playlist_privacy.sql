-- Page-level privacy for playlists: a playlist can be public, unlisted (URL only)
-- or password protected, independently of the videos it holds.
ALTER TABLE playlists ADD COLUMN visibility TEXT NOT NULL DEFAULT 'public';
ALTER TABLE playlists ADD COLUMN password_hash TEXT NOT NULL DEFAULT '';
ALTER TABLE playlists ADD COLUMN password_salt TEXT NOT NULL DEFAULT '';
