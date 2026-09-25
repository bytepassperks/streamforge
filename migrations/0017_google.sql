-- Google sign-in: a Google account is linked to a Videokr user by its stable
-- `sub` claim. Empty means the user has never signed in with Google.

ALTER TABLE users ADD COLUMN google_sub TEXT NOT NULL DEFAULT '';
CREATE INDEX idx_users_google_sub ON users(google_sub);
