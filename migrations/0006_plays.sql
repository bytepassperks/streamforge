-- Migration number: 0006 	 2026-08-19T21:00:00.000Z
-- Play metering: recurring plans are sold on a monthly play allowance, so plays
-- are counted per account per calendar month and de-duplicated per viewer.

ALTER TABLE users ADD COLUMN subscription_id TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN plan_renews_at INTEGER NOT NULL DEFAULT 0;

-- One row per account per 'YYYY-MM' (UTC), so the billing gate is a single read.
CREATE TABLE play_usage (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  period TEXT NOT NULL,
  plays INTEGER NOT NULL DEFAULT 0,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (user_id, period)
);

-- A play is billed once per viewer per video per month; this ledger is what makes
-- the number we bill from reproducible, and it doubles as the de-dup key.
CREATE TABLE play_dedup (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  view_id TEXT NOT NULL,
  period TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  PRIMARY KEY (video_id, view_id, period)
);
CREATE INDEX idx_play_dedup_created ON play_dedup(created_at);
