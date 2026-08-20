-- Migration number: 0007 	 2026-08-20T09:00:00.000Z
-- Overage collection: once a calendar month closes, a paid account past its play
-- allowance owes $1 per 10,000 extra plays. One row per account per period is the
-- thing that makes the charge idempotent — the unique key is the duplicate guard.

CREATE TABLE overage_charges (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  plan TEXT NOT NULL,
  allowance INTEGER NOT NULL,
  plays INTEGER NOT NULL,
  over INTEGER NOT NULL,
  amount_cents INTEGER NOT NULL,
  currency TEXT NOT NULL DEFAULT 'USD',
  -- pending: owed, not yet collected. paid: collected from the subscription.
  -- failed: the provider rejected it, retryable. waived: written off by an admin.
  -- manual: owed but there is no subscription to charge (lifetime), collect by hand.
  status TEXT NOT NULL DEFAULT 'pending',
  subscription_id TEXT NOT NULL DEFAULT '',
  payment_id TEXT NOT NULL DEFAULT '',
  attempts INTEGER NOT NULL DEFAULT 0,
  error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  UNIQUE (user_id, period)
);
CREATE INDEX idx_overage_status ON overage_charges(status, period);
