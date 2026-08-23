-- Password resets and lead notification email.
--
-- Only the hash of a reset token is stored, so the table cannot be used to take
-- an account over; a token is single use and expires on its own.
CREATE TABLE IF NOT EXISTS password_resets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL,
  used_at INTEGER NOT NULL DEFAULT 0
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_password_resets_hash ON password_resets (token_hash);
CREATE INDEX IF NOT EXISTS idx_password_resets_user ON password_resets (user_id);

-- Owners are emailed each captured lead unless they turn it off in Settings.
ALTER TABLE users ADD COLUMN lead_emails INTEGER NOT NULL DEFAULT 1;
