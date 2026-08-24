-- What has already been announced to the IndexNow engines.
--
-- The protocol asks submitters not to resend an unchanged URL, so the modified
-- date that was sent is kept per URL and a page is only announced again once it
-- actually moves.
CREATE TABLE IF NOT EXISTS index_submissions (
  url TEXT PRIMARY KEY,
  lastmod TEXT NOT NULL,
  submitted_at INTEGER NOT NULL
);
