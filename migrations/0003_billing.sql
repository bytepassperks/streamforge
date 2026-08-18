-- Migration number: 0003 	 2026-08-18T16:00:00.000Z
-- Lifetime entitlements bought through Dodo Payments.

ALTER TABLE users ADD COLUMN lifetime_at INTEGER NOT NULL DEFAULT 0;

CREATE TABLE purchases (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'dodo',
  provider_ref TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  amount_cents INTEGER NOT NULL DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'USD',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_purchases_user ON purchases(user_id);
CREATE UNIQUE INDEX idx_purchases_ref ON purchases(provider, provider_ref);

CREATE TABLE webhook_events (
  id TEXT PRIMARY KEY,
  received_at INTEGER NOT NULL
);
