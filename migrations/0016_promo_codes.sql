CREATE TABLE promo_codes (
  id              TEXT PRIMARY KEY,
  code            TEXT NOT NULL UNIQUE,
  plan            TEXT NOT NULL,
  grant_days      INTEGER NOT NULL,
  redeem_by       INTEGER NOT NULL,
  max_redemptions INTEGER NOT NULL,
  redemptions     INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1,
  note            TEXT NOT NULL DEFAULT '',
  created_at      INTEGER NOT NULL
);

CREATE TABLE promo_redemptions (
  id            TEXT PRIMARY KEY,
  code_id       TEXT NOT NULL,
  code          TEXT NOT NULL,
  user_id       TEXT NOT NULL,
  plan          TEXT NOT NULL,
  granted_until INTEGER NOT NULL,
  created_at    INTEGER NOT NULL
);
CREATE UNIQUE INDEX promo_redemptions_code_user ON promo_redemptions (code_id, user_id);
CREATE INDEX promo_redemptions_user ON promo_redemptions (user_id, created_at);

ALTER TABLE users ADD COLUMN grant_plan TEXT NOT NULL DEFAULT '';
ALTER TABLE users ADD COLUMN grant_until INTEGER NOT NULL DEFAULT 0;
ALTER TABLE users ADD COLUMN grant_code TEXT NOT NULL DEFAULT '';
