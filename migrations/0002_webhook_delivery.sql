-- Migration number: 0002 	 2026-08-18T13:30:00.000Z
-- Records the outcome of the last delivery attempt so failing endpoints are
-- visible in the dashboard instead of failing silently.
ALTER TABLE webhooks ADD COLUMN last_status INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhooks ADD COLUMN last_attempt_at INTEGER NOT NULL DEFAULT 0;
ALTER TABLE webhooks ADD COLUMN last_error TEXT NOT NULL DEFAULT '';
