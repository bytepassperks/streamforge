import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { currentUser, createSession, destroySession, hashPassword, randomSalt, verifyPassword } from '../lib/auth';
import {
  defaultPlayerConfig,
  mergePlayerConfig,
  newId,
  now,
  parseSource,
  slugify,
} from '../lib/util';

type Vars = { user: User };

export const api = new Hono<{ Bindings: Env; Variables: Vars }>();

const OPEN_PATHS = new Set(['/auth/signup', '/auth/login', '/auth/me', '/auth/logout']);

api.use('*', async (c, next) => {
  const path = c.req.path.replace(/^\/api/, '');
  const user = await currentUser(c);
  if (user) c.set('user', user);
  if (!user && !OPEN_PATHS.has(path)) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

/* ---------------------------------------------------------------- auth ---- */

api.post('/auth/signup', async (c) => {
  const { email, password, name } = await c.req.json<{ email?: string; password?: string; name?: string }>();
  const cleanEmail = (email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return c.json({ error: 'invalid email' }, 400);
  if (!password || password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);

  const existing = await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(cleanEmail).first();
  if (existing) return c.json({ error: 'an account with that email already exists' }, 409);

  const id = newId('usr');
  const salt = randomSalt();
  const hash = await hashPassword(password, salt);
  await c.env.DB.prepare(
    'INSERT INTO users (id, email, name, password_hash, password_salt, plan, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, cleanEmail, (name ?? '').trim(), hash, salt, 'free', now())
    .run();
  await createSession(c, id);
  return c.json({ user: { id, email: cleanEmail, name: (name ?? '').trim(), plan: 'free' } }, 201);
});

api.post('/auth/login', async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>();
  const cleanEmail = (email ?? '').trim().toLowerCase();
  const row = await c.env.DB.prepare(
    'SELECT id, email, name, plan, password_hash, password_salt FROM users WHERE email = ?',
  )
    .bind(cleanEmail)
    .first<{ id: string; email: string; name: string; plan: string; password_hash: string; password_salt: string }>();
  if (!row || !(await verifyPassword(password ?? '', row.password_salt, row.password_hash))) {
    return c.json({ error: 'invalid email or password' }, 401);
  }
  await createSession(c, row.id);
  return c.json({ user: { id: row.id, email: row.email, name: row.name, plan: row.plan } });
});

api.post('/auth/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

api.get('/auth/me', (c) => {
  const user = c.get('user');
  return user ? c.json({ user }) : c.json({ user: null }, 200);
});

/* ------------------------------------------------------------ projects ---- */

api.get('/projects', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM videos v WHERE v.project_id = p.id) AS video_count
       FROM projects p WHERE p.user_id = ? ORDER BY p.created_at DESC`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json({ projects: results ?? [] });
});

api.post('/projects', async (c) => {
  const { name } = await c.req.json<{ name?: string }>();
  const clean = (name ?? '').trim();
  if (!clean) return c.json({ error: 'name is required' }, 400);
  const id = newId('prj');
  await c.env.DB.prepare('INSERT INTO projects (id, user_id, name, created_at) VALUES (?, ?, ?, ?)')
    .bind(id, c.get('user').id, clean, now())
    .run();
  return c.json({ project: { id, name: clean } }, 201);
});

api.delete('/projects/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM projects WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  return c.json({ ok: true });
});

/* -------------------------------------------------------------- videos ---- */

async function uniqueSlug(c: { env: Env }, title: string): Promise<string> {
  const base = slugify(title);
  for (let i = 0; i < 25; i++) {
    const candidate = i === 0 ? base : `${base}-${i + 1}`;
    const hit = await c.env.DB.prepare('SELECT id FROM videos WHERE slug = ?').bind(candidate).first();
    if (!hit) return candidate;
  }
  return `${base}-${newId().slice(0, 6)}`;
}

api.get('/videos', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.slug, v.title, v.source_type, v.source_ref, v.thumbnail_url, v.visibility,
            v.duration, v.project_id, v.created_at,
            (SELECT COUNT(*) FROM events e WHERE e.video_id = v.id AND e.kind = 'play') AS plays,
            (SELECT COUNT(*) FROM leads l WHERE l.video_id = v.id) AS leads
       FROM videos v WHERE v.user_id = ? ORDER BY v.created_at DESC`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json({ videos: results ?? [] });
});

api.post('/videos', async (c) => {
  const body = await c.req.json<{
    title?: string;
    source?: string;
    source_type?: string;
    project_id?: string | null;
    description?: string;
  }>();
  const title = (body.title ?? '').trim() || 'Untitled video';
  const parsed = parseSource(body.source ?? '', body.source_type);
  if (!parsed) {
    return c.json({ error: 'could not recognise that video source (YouTube/Vimeo link, MP4 or HLS url)' }, 400);
  }
  const id = newId('vid');
  const slug = await uniqueSlug(c, title);
  const ts = now();
  const thumbnail =
    parsed.type === 'youtube' ? `https://i.ytimg.com/vi/${parsed.ref}/hqdefault.jpg` : '';
  await c.env.DB.prepare(
    `INSERT INTO videos (id, user_id, project_id, slug, title, description, source_type, source_ref,
                         thumbnail_url, player_config, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
    .bind(
      id,
      c.get('user').id,
      body.project_id || null,
      slug,
      title,
      (body.description ?? '').trim(),
      parsed.type,
      parsed.ref,
      thumbnail,
      JSON.stringify(defaultPlayerConfig()),
      ts,
      ts,
    )
    .run();
  return c.json({ video: { id, slug, title, source_type: parsed.type, source_ref: parsed.ref } }, 201);
});

api.get('/videos/:id', async (c) => {
  const video = await c.env.DB.prepare('SELECT * FROM videos WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .first<Record<string, unknown>>();
  if (!video) return c.json({ error: 'not found' }, 404);
  const chapters = await c.env.DB.prepare(
    'SELECT id, start_seconds, title FROM chapters WHERE video_id = ? ORDER BY start_seconds',
  )
    .bind(video.id)
    .all();
  const ctas = await c.env.DB.prepare('SELECT * FROM ctas WHERE video_id = ? ORDER BY start_seconds')
    .bind(video.id)
    .all();
  const { password_hash: _h, password_salt: _s, ...safe } = video as Record<string, unknown>;
  return c.json({
    video: { ...safe, has_password: Boolean(video.password_hash) },
    player_config: mergePlayerConfig(video.player_config as string),
    chapters: chapters.results ?? [],
    ctas: ctas.results ?? [],
  });
});

api.patch('/videos/:id', async (c) => {
  const user = c.get('user');
  const id = c.req.param('id');
  const existing = await c.env.DB.prepare('SELECT * FROM videos WHERE id = ? AND user_id = ?')
    .bind(id, user.id)
    .first<Record<string, unknown>>();
  if (!existing) return c.json({ error: 'not found' }, 404);

  const body = await c.req.json<Record<string, unknown>>();
  const updates: Record<string, string | number | null> = {};

  if (typeof body.title === 'string' && body.title.trim()) updates.title = body.title.trim();
  if (typeof body.description === 'string') updates.description = body.description;
  if (typeof body.thumbnail_url === 'string') updates.thumbnail_url = body.thumbnail_url;
  if (typeof body.thumbnail_url_b === 'string') updates.thumbnail_url_b = body.thumbnail_url_b;
  if (typeof body.captions_url === 'string') updates.captions_url = body.captions_url;
  if (typeof body.transcript === 'string') updates.transcript = body.transcript;
  if (typeof body.duration === 'number' && body.duration >= 0) updates.duration = body.duration;
  if (typeof body.allowed_domains === 'string') updates.allowed_domains = body.allowed_domains.trim();
  if (body.project_id === null || typeof body.project_id === 'string') {
    updates.project_id = (body.project_id as string) || null;
  }
  if (typeof body.source === 'string' && body.source.trim()) {
    const parsed = parseSource(body.source, body.source_type as string | undefined);
    if (!parsed) return c.json({ error: 'could not recognise that video source' }, 400);
    updates.source_type = parsed.type;
    updates.source_ref = parsed.ref;
  }
  if (body.player_config && typeof body.player_config === 'object') {
    updates.player_config = JSON.stringify(mergePlayerConfig(JSON.stringify(body.player_config)));
  }
  if (typeof body.visibility === 'string' && ['public', 'unlisted', 'password'].includes(body.visibility)) {
    updates.visibility = body.visibility;
  }
  if (typeof body.password === 'string') {
    if (body.password) {
      const salt = randomSalt();
      updates.password_salt = salt;
      updates.password_hash = await hashPassword(body.password, salt);
      updates.visibility = 'password';
    } else {
      updates.password_salt = '';
      updates.password_hash = '';
    }
  }

  if (Object.keys(updates).length === 0) return c.json({ ok: true, updated: 0 });
  updates.updated_at = now();
  const setClause = Object.keys(updates)
    .map((k) => `${k} = ?`)
    .join(', ');
  await c.env.DB.prepare(`UPDATE videos SET ${setClause} WHERE id = ? AND user_id = ?`)
    .bind(...Object.values(updates), id, user.id)
    .run();
  return c.json({ ok: true, updated: Object.keys(updates).length });
});

api.delete('/videos/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM videos WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  return c.json({ ok: true });
});

async function assertOwnedVideo(c: { env: Env }, videoId: string, userId: string): Promise<boolean> {
  const row = await c.env.DB.prepare('SELECT id FROM videos WHERE id = ? AND user_id = ?')
    .bind(videoId, userId)
    .first();
  return Boolean(row);
}

api.put('/videos/:id/chapters', async (c) => {
  const id = c.req.param('id');
  if (!(await assertOwnedVideo(c, id, c.get('user').id))) return c.json({ error: 'not found' }, 404);
  const { chapters } = await c.req.json<{ chapters?: { start_seconds?: number; title?: string }[] }>();
  const rows = (chapters ?? [])
    .filter((ch) => typeof ch.start_seconds === 'number' && (ch.title ?? '').trim())
    .sort((a, b) => (a.start_seconds ?? 0) - (b.start_seconds ?? 0));
  const statements = [c.env.DB.prepare('DELETE FROM chapters WHERE video_id = ?').bind(id)];
  for (const ch of rows) {
    statements.push(
      c.env.DB.prepare('INSERT INTO chapters (id, video_id, start_seconds, title) VALUES (?, ?, ?, ?)').bind(
        newId('chp'),
        id,
        Math.max(0, ch.start_seconds ?? 0),
        (ch.title ?? '').trim(),
      ),
    );
  }
  await c.env.DB.batch(statements);
  return c.json({ ok: true, count: rows.length });
});

api.put('/videos/:id/ctas', async (c) => {
  const id = c.req.param('id');
  if (!(await assertOwnedVideo(c, id, c.get('user').id))) return c.json({ error: 'not found' }, 404);
  const { ctas } = await c.req.json<{ ctas?: Record<string, unknown>[] }>();
  const allowedKinds = ['overlay', 'banner', 'endscreen', 'gate'];
  const rows = (ctas ?? []).filter((cta) => allowedKinds.includes(String(cta.kind)));
  const statements = [c.env.DB.prepare('DELETE FROM ctas WHERE video_id = ?').bind(id)];
  for (const cta of rows) {
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO ctas (id, video_id, kind, start_seconds, end_seconds, headline, body,
                           button_text, button_url, fields, skippable, position)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        newId('cta'),
        id,
        String(cta.kind),
        Number(cta.start_seconds ?? 0) || 0,
        Number(cta.end_seconds ?? 0) || 0,
        String(cta.headline ?? ''),
        String(cta.body ?? ''),
        String(cta.button_text ?? ''),
        String(cta.button_url ?? ''),
        String(cta.fields ?? 'email'),
        cta.skippable === false ? 0 : 1,
        String(cta.position ?? 'bottom-right'),
      ),
    );
  }
  await c.env.DB.batch(statements);
  return c.json({ ok: true, count: rows.length });
});

/* ----------------------------------------------------------- playlists ---- */

api.get('/playlists', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.*, (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS item_count
       FROM playlists p WHERE p.user_id = ? ORDER BY p.created_at DESC`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json({ playlists: results ?? [] });
});

api.post('/playlists', async (c) => {
  const body = await c.req.json<{ title?: string; description?: string; layout?: string }>();
  const title = (body.title ?? '').trim();
  if (!title) return c.json({ error: 'title is required' }, 400);
  const id = newId('pls');
  let slug = slugify(title, 'playlist');
  if (await c.env.DB.prepare('SELECT id FROM playlists WHERE slug = ?').bind(slug).first()) {
    slug = `${slug}-${newId().slice(0, 5)}`;
  }
  await c.env.DB.prepare(
    'INSERT INTO playlists (id, user_id, slug, title, description, layout, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  )
    .bind(id, c.get('user').id, slug, title, (body.description ?? '').trim(), body.layout ?? 'sidebar', now())
    .run();
  return c.json({ playlist: { id, slug, title } }, 201);
});

api.put('/playlists/:id/items', async (c) => {
  const id = c.req.param('id');
  const owned = await c.env.DB.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
    .bind(id, c.get('user').id)
    .first();
  if (!owned) return c.json({ error: 'not found' }, 404);
  const { video_ids } = await c.req.json<{ video_ids?: string[] }>();
  const ids = (video_ids ?? []).filter((v) => typeof v === 'string');
  const statements = [c.env.DB.prepare('DELETE FROM playlist_items WHERE playlist_id = ?').bind(id)];
  ids.forEach((videoId, index) => {
    statements.push(
      c.env.DB.prepare('INSERT INTO playlist_items (playlist_id, video_id, position) VALUES (?, ?, ?)').bind(
        id,
        videoId,
        index,
      ),
    );
  });
  await c.env.DB.batch(statements);
  return c.json({ ok: true, count: ids.length });
});

api.delete('/playlists/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM playlists WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  return c.json({ ok: true });
});

/* ----------------------------------------------------------- analytics ---- */

api.get('/analytics/summary', async (c) => {
  const userId = c.get('user').id;
  const totals = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM videos WHERE user_id = ?) AS videos,
       (SELECT COUNT(*) FROM events e JOIN videos v ON v.id = e.video_id
          WHERE v.user_id = ? AND e.kind = 'load') AS impressions,
       (SELECT COUNT(*) FROM events e JOIN videos v ON v.id = e.video_id
          WHERE v.user_id = ? AND e.kind = 'play') AS plays,
       (SELECT COUNT(*) FROM events e JOIN videos v ON v.id = e.video_id
          WHERE v.user_id = ? AND e.kind = 'complete') AS completions,
       (SELECT COUNT(*) FROM leads WHERE user_id = ?) AS leads,
       (SELECT COUNT(*) FROM events e JOIN videos v ON v.id = e.video_id
          WHERE v.user_id = ? AND e.kind = 'cta_click') AS cta_clicks`,
  )
    .bind(userId, userId, userId, userId, userId, userId)
    .first<Record<string, number>>();
  return c.json({ totals: totals ?? {} });
});

api.get('/analytics/videos/:id', async (c) => {
  const id = c.req.param('id');
  const userId = c.get('user').id;
  const video = await c.env.DB.prepare('SELECT id, title, duration FROM videos WHERE id = ? AND user_id = ?')
    .bind(id, userId)
    .first<{ id: string; title: string; duration: number }>();
  if (!video) return c.json({ error: 'not found' }, 404);

  const counts = await c.env.DB.prepare(
    `SELECT kind, COUNT(*) AS n FROM events WHERE video_id = ? GROUP BY kind`,
  )
    .bind(id)
    .all<{ kind: string; n: number }>();
  const retention = await c.env.DB.prepare(
    'SELECT bucket, views FROM retention WHERE video_id = ? ORDER BY bucket',
  )
    .bind(id)
    .all<{ bucket: number; views: number }>();
  const daily = await c.env.DB.prepare(
    `SELECT date(created_at, 'unixepoch') AS day, COUNT(*) AS plays
       FROM events WHERE video_id = ? AND kind = 'play'
      GROUP BY day ORDER BY day DESC LIMIT 30`,
  )
    .bind(id)
    .all();
  const referrers = await c.env.DB.prepare(
    `SELECT referrer, COUNT(*) AS n FROM events
      WHERE video_id = ? AND kind = 'load' AND referrer <> ''
      GROUP BY referrer ORDER BY n DESC LIMIT 10`,
  )
    .bind(id)
    .all();
  const devices = await c.env.DB.prepare(
    `SELECT device, COUNT(*) AS n FROM events WHERE video_id = ? AND kind = 'load' GROUP BY device`,
  )
    .bind(id)
    .all();
  const variants = await c.env.DB.prepare(
    `SELECT variant,
            SUM(CASE WHEN kind = 'load' THEN 1 ELSE 0 END) AS impressions,
            SUM(CASE WHEN kind = 'play' THEN 1 ELSE 0 END) AS plays
       FROM events WHERE video_id = ? GROUP BY variant`,
  )
    .bind(id)
    .all();

  const byKind: Record<string, number> = {};
  for (const row of counts.results ?? []) byKind[row.kind] = row.n;
  return c.json({
    video,
    counts: byKind,
    retention: retention.results ?? [],
    daily: daily.results ?? [],
    referrers: referrers.results ?? [],
    devices: devices.results ?? [],
    variants: variants.results ?? [],
  });
});

api.get('/leads', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT l.*, v.title AS video_title FROM leads l JOIN videos v ON v.id = l.video_id
      WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT 500`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json({ leads: results ?? [] });
});

api.get('/leads.csv', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT l.email, l.name, l.phone, l.position, l.referrer, l.created_at, v.title
       FROM leads l JOIN videos v ON v.id = l.video_id WHERE l.user_id = ? ORDER BY l.created_at DESC`,
  )
    .bind(c.get('user').id)
    .all<Record<string, string | number>>();
  const header = 'email,name,phone,position_seconds,referrer,created_at,video\n';
  const body = (results ?? [])
    .map((r) =>
      [r.email, r.name, r.phone, r.position, r.referrer, new Date(Number(r.created_at) * 1000).toISOString(), r.title]
        .map((v) => `"${String(v ?? '').replace(/"/g, '""')}"`)
        .join(','),
    )
    .join('\n');
  return new Response(header + body, {
    headers: { 'content-type': 'text/csv; charset=utf-8', 'content-disposition': 'attachment; filename=leads.csv' },
  });
});

/* ------------------------------------------------------------ webhooks ---- */

api.get('/webhooks', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT id, url, events, active, created_at FROM webhooks WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(c.get('user').id)
    .all();
  return c.json({ webhooks: results ?? [] });
});

api.post('/webhooks', async (c) => {
  const body = await c.req.json<{ url?: string; events?: string; secret?: string }>();
  const url = (body.url ?? '').trim();
  if (!/^https?:\/\//i.test(url)) return c.json({ error: 'url must be http(s)' }, 400);
  const id = newId('whk');
  await c.env.DB.prepare(
    'INSERT INTO webhooks (id, user_id, url, secret, events, active, created_at) VALUES (?, ?, ?, ?, ?, 1, ?)',
  )
    .bind(id, c.get('user').id, url, (body.secret ?? '').trim(), (body.events ?? 'lead').trim(), now())
    .run();
  return c.json({ webhook: { id, url } }, 201);
});

api.delete('/webhooks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  return c.json({ ok: true });
});

/* ------------------------------------------------------------- uploads ---- */

const UPLOAD_LIMIT_BYTES = 200 * 1024 * 1024;
const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'text/vtt': 'vtt',
};

api.post('/uploads', async (c) => {
  const form = await c.req.formData();
  // workers-types narrows FormData.get() to string, so read the entry as unknown
  // and confirm it is really an uploaded file.
  const entry: unknown = form.get('file');
  if (!(entry instanceof File)) return c.json({ error: 'file is required' }, 400);
  const file = entry;
  if (file.size > UPLOAD_LIMIT_BYTES) return c.json({ error: 'file is larger than 200MB' }, 413);
  const declared = file.type || 'application/octet-stream';
  const ext = ALLOWED_UPLOAD_TYPES[declared] ?? (file.name.endsWith('.vtt') ? 'vtt' : '');
  if (!ext) return c.json({ error: `unsupported file type: ${declared}` }, 415);
  const key = `${c.get('user').id}/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: declared } });
  return c.json({ key, url: `/media/${key}` }, 201);
});
