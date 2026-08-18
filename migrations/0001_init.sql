-- StreamForge initial schema

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  password_salt TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free',
  created_at INTEGER NOT NULL
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX idx_sessions_user ON sessions(user_id);

CREATE TABLE projects (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_projects_user ON projects(user_id);

CREATE TABLE videos (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- youtube | vimeo | mp4 | hls
  source_type TEXT NOT NULL,
  -- youtube/vimeo id, or absolute/relative media url
  source_ref TEXT NOT NULL,
  duration REAL NOT NULL DEFAULT 0,
  thumbnail_url TEXT NOT NULL DEFAULT '',
  thumbnail_url_b TEXT NOT NULL DEFAULT '',
  captions_url TEXT NOT NULL DEFAULT '',
  transcript TEXT NOT NULL DEFAULT '',
  -- player appearance + behaviour, JSON
  player_config TEXT NOT NULL DEFAULT '{}',
  -- public | unlisted | password
  visibility TEXT NOT NULL DEFAULT 'public',
  password_hash TEXT NOT NULL DEFAULT '',
  password_salt TEXT NOT NULL DEFAULT '',
  -- comma separated hostname patterns; empty = any
  allowed_domains TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE INDEX idx_videos_user ON videos(user_id);
CREATE INDEX idx_videos_project ON videos(project_id);

CREATE TABLE chapters (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  start_seconds REAL NOT NULL,
  title TEXT NOT NULL
);
CREATE INDEX idx_chapters_video ON chapters(video_id, start_seconds);

CREATE TABLE ctas (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  -- overlay | banner | endscreen | gate
  kind TEXT NOT NULL,
  start_seconds REAL NOT NULL DEFAULT 0,
  end_seconds REAL NOT NULL DEFAULT 0,
  headline TEXT NOT NULL DEFAULT '',
  body TEXT NOT NULL DEFAULT '',
  button_text TEXT NOT NULL DEFAULT '',
  button_url TEXT NOT NULL DEFAULT '',
  -- for gate: comma separated field names (name,email)
  fields TEXT NOT NULL DEFAULT 'email',
  skippable INTEGER NOT NULL DEFAULT 1,
  position TEXT NOT NULL DEFAULT 'bottom-right'
);
CREATE INDEX idx_ctas_video ON ctas(video_id);

CREATE TABLE playlists (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  slug TEXT NOT NULL UNIQUE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  -- sidebar | grid | filmstrip
  layout TEXT NOT NULL DEFAULT 'sidebar',
  autoplay_next INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);

CREATE TABLE playlist_items (
  playlist_id TEXT NOT NULL REFERENCES playlists(id) ON DELETE CASCADE,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  position INTEGER NOT NULL,
  PRIMARY KEY (playlist_id, video_id)
);

CREATE TABLE events (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  -- anonymous, rotating per view; no cookies used
  view_id TEXT NOT NULL,
  -- load | play | pause | progress | complete | cta_view | cta_click | lead | seek
  kind TEXT NOT NULL,
  position REAL NOT NULL DEFAULT 0,
  value TEXT NOT NULL DEFAULT '',
  referrer TEXT NOT NULL DEFAULT '',
  country TEXT NOT NULL DEFAULT '',
  device TEXT NOT NULL DEFAULT '',
  variant TEXT NOT NULL DEFAULT 'a',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_events_video ON events(video_id, created_at);
CREATE INDEX idx_events_view ON events(view_id);

-- pre-aggregated watch retention: 100 buckets of the video timeline
CREATE TABLE retention (
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  bucket INTEGER NOT NULL,
  views INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (video_id, bucket)
);

CREATE TABLE leads (
  id TEXT PRIMARY KEY,
  video_id TEXT NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  name TEXT NOT NULL DEFAULT '',
  phone TEXT NOT NULL DEFAULT '',
  position REAL NOT NULL DEFAULT 0,
  referrer TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_leads_user ON leads(user_id, created_at);

CREATE TABLE webhooks (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  secret TEXT NOT NULL DEFAULT '',
  -- comma separated event kinds
  events TEXT NOT NULL DEFAULT 'lead',
  active INTEGER NOT NULL DEFAULT 1,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_webhooks_user ON webhooks(user_id);

CREATE TABLE player_presets (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  config TEXT NOT NULL,
  created_at INTEGER NOT NULL
);
