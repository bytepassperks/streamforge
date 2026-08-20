-- Migration number: 0004 	 2026-08-19T18:00:00.000Z
-- Admin roles, manual overrides and an audit trail for admin actions.

ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'user';
ALTER TABLE users ADD COLUMN unlimited INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN suspended INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN notes TEXT NOT NULL DEFAULT '';

CREATE TABLE admin_audit (
  id TEXT PRIMARY KEY,
  actor_id TEXT NOT NULL,
  actor_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target TEXT NOT NULL DEFAULT '',
  detail TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_admin_audit_created ON admin_audit(created_at);
