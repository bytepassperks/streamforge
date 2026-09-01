CREATE TABLE IF NOT EXISTS storage_buckets (
  id TEXT PRIMARY KEY,
  label TEXT NOT NULL DEFAULT '',
  provider TEXT NOT NULL DEFAULT 'b2',
  endpoint TEXT NOT NULL,
  region TEXT NOT NULL,
  bucket_name TEXT NOT NULL,
  bucket_id TEXT NOT NULL DEFAULT '',
  key_id TEXT NOT NULL,
  secret_cipher TEXT NOT NULL,
  capacity_bytes INTEGER NOT NULL DEFAULT 0,
  used_bytes INTEGER NOT NULL DEFAULT 0,
  object_count INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  last_probe_at INTEGER NOT NULL DEFAULT 0,
  last_error TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_storage_buckets_target
  ON storage_buckets (endpoint, bucket_name);
CREATE INDEX IF NOT EXISTS idx_storage_buckets_status
  ON storage_buckets (status, used_bytes);

CREATE TABLE IF NOT EXISTS media_objects (
  key TEXT PRIMARY KEY,
  user_id TEXT NOT NULL DEFAULT '',
  backend TEXT NOT NULL DEFAULT 'r2',
  bucket_id TEXT NOT NULL DEFAULT '',
  size_bytes INTEGER NOT NULL DEFAULT 0,
  content_type TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_media_objects_bucket ON media_objects (bucket_id);
CREATE INDEX IF NOT EXISTS idx_media_objects_user ON media_objects (user_id);
