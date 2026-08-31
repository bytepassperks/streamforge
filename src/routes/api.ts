import { Hono } from 'hono';
import type { Context } from 'hono';
import type { Env, User } from '../lib/types';
import { currentUser, createSession, destroySession, hashPassword, randomSalt, verifyPassword } from '../lib/auth';
import { userForApiKey } from '../lib/apikeys';
import {
  OVERAGE_PER_10K_USD,
  PLANS,
  createCheckout,
  isAdmin,
  isLifetime,
  isPaid,
  lifetimeDiscount,
  offerForSeats,
  planFor,
  playUsage,
  productIdFor,
  seatsSold,
} from '../lib/billing';
import type { Cycle } from '../lib/billing';
import { announce } from '../lib/indexnow';
import { isWorthIndexing } from '../lib/seo';
import { admin } from './admin';
import { deliverTestWebhook } from '../lib/webhooks';
import { generateApiKey, hashApiKey, keyPrefix } from '../lib/apikeys';
import { sendMail } from '../lib/email';
import { RESET_TTL_SECONDS, claimReset, generateResetToken, hashResetToken, resetUrl } from '../lib/resets';
import { hlsMasterVariantUris, rewriteHlsMasterBandwidth } from '../lib/hls';
import {
  defaultPlayerConfig,
  mergePlayerConfig,
  newId,
  now,
  normalizeCtaStyle,
  normalizeCtaUrl,
  parseSource,
  slugify,
} from '../lib/util';

type Vars = { user: User };

export const api = new Hono<{ Bindings: Env; Variables: Vars }>();

const OPEN_PATHS = new Set([
  '/auth/signup',
  '/auth/login',
  '/auth/me',
  '/auth/logout',
  '/auth/forgot',
  '/auth/reset',
]);

function apiKeyPath(path: string, method: string): boolean {
  return method === 'POST' && /^\/videos\/[^/]+\/hls\/(?:parts|complete)$/.test(path);
}

api.use('*', async (c, next) => {
  const path = c.req.path.replace(/^\/api/, '');
  const match = /^Bearer\s+(.+)$/i.exec((c.req.header('authorization') ?? '').trim());
  const keyUser = apiKeyPath(path, c.req.method) && match?.[1]
    ? await userForApiKey(c.env, match[1].trim())
    : null;
  const user = keyUser ?? (await currentUser(c));
  if (user) c.set('user', user);
  if (user && Number(user.suspended) === 1 && path !== '/auth/logout') {
    return c.json({ error: 'this account is suspended' }, 403);
  }
  if (!user && !OPEN_PATHS.has(path)) return c.json({ error: 'unauthorized' }, 401);
  await next();
});

api.route('/admin', admin);

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
    'SELECT id, email, name, plan, role, suspended, password_hash, password_salt FROM users WHERE email = ?',
  )
    .bind(cleanEmail)
    .first<{
      id: string;
      email: string;
      name: string;
      plan: string;
      role: string;
      suspended: number;
      password_hash: string;
      password_salt: string;
    }>();
  if (!row || !(await verifyPassword(password ?? '', row.password_salt, row.password_hash))) {
    return c.json({ error: 'invalid email or password' }, 401);
  }
  if (Number(row.suspended) === 1) return c.json({ error: 'this account is suspended' }, 403);
  await createSession(c, row.id);
  return c.json({ user: { id: row.id, email: row.email, name: row.name, plan: row.plan, role: row.role } });
});

api.post('/auth/logout', async (c) => {
  await destroySession(c);
  return c.json({ ok: true });
});

api.get('/auth/me', (c) => {
  const user = c.get('user');
  // Embed and share snippets have to carry the canonical public host, not the
  // host the dashboard happens to be open on (a preview url, an ip, localhost).
  const publicBase = (c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin).replace(/\/$/, '');
  return user ? c.json({ user, public_base: publicBase }) : c.json({ user: null }, 200);
});

/**
 * Both reset endpoints answer the same way whether or not the address exists,
 * so the form cannot be used to discover who has an account.
 */
api.post('/auth/forgot', async (c) => {
  const { email } = await c.req.json<{ email?: string }>();
  const cleanEmail = (email ?? '').trim().toLowerCase();
  const row = await c.env.DB.prepare('SELECT id, name FROM users WHERE email = ? AND suspended = 0')
    .bind(cleanEmail)
    .first<{ id: string; name: string }>();
  if (row) {
    const token = generateResetToken();
    const created = now();
    await c.env.DB.batch([
      // Any link sent earlier stops working the moment a new one is asked for.
      c.env.DB.prepare('UPDATE password_resets SET used_at = ? WHERE user_id = ? AND used_at = 0').bind(
        created,
        row.id,
      ),
      c.env.DB.prepare(
        'INSERT INTO password_resets (id, user_id, token_hash, created_at, expires_at) VALUES (?, ?, ?, ?, ?)',
      ).bind(newId('rst'), row.id, await hashResetToken(token), created, created + RESET_TTL_SECONDS),
    ]);
    const base = (c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin).replace(/\/$/, '');
    c.executionCtx.waitUntil(
      sendMail(c.env, {
        to: cleanEmail,
        subject: 'Reset your Videokr password',
        text: [
          `Hi${row.name ? ` ${row.name}` : ''},`,
          'Use this link to set a new Videokr password. It works once and expires in an hour:',
          resetUrl(base, token),
          'If you did not ask for this, ignore the email — your current password still works.',
        ].join('\n\n'),
      }),
    );
  }
  return c.json({ ok: true });
});

api.post('/auth/reset', async (c) => {
  const { token, password } = await c.req.json<{ token?: string; password?: string }>();
  if (!password || password.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);
  const userId = await claimReset(c.env, (token ?? '').trim());
  if (!userId) return c.json({ error: 'this reset link has expired — request a new one' }, 400);
  const salt = randomSalt();
  await c.env.DB.batch([
    c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?').bind(
      await hashPassword(password, salt),
      salt,
      userId,
    ),
    // A reset is also how a locked-out owner evicts whoever is holding a session.
    c.env.DB.prepare('DELETE FROM sessions WHERE user_id = ?').bind(userId),
  ]);
  await createSession(c, userId);
  return c.json({ ok: true });
});

api.patch('/auth/profile', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{
    name?: string;
    email?: string;
    current_password?: string;
    password?: string;
    lead_emails?: boolean;
  }>();
  const row = await c.env.DB.prepare('SELECT password_hash, password_salt FROM users WHERE id = ?')
    .bind(user.id)
    .first<{ password_hash: string; password_salt: string }>();
  if (!row) return c.json({ error: 'unauthorized' }, 401);

  const wantsEmail = typeof body.email === 'string' && body.email.trim().toLowerCase() !== user.email;
  const wantsPassword = typeof body.password === 'string' && body.password.length > 0;
  // Changing a credential always costs the current password, so a stolen session cannot
  // take the account over.
  if (wantsEmail || wantsPassword) {
    const ok = await verifyPassword(body.current_password ?? '', row.password_salt, row.password_hash);
    if (!ok) return c.json({ error: 'current password is incorrect' }, 403);
  }

  if (typeof body.name === 'string') {
    await c.env.DB.prepare('UPDATE users SET name = ? WHERE id = ?').bind(body.name.trim(), user.id).run();
  }

  if (wantsEmail) {
    const cleanEmail = (body.email ?? '').trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) return c.json({ error: 'invalid email' }, 400);
    const taken = await c.env.DB.prepare('SELECT id FROM users WHERE email = ? AND id <> ?')
      .bind(cleanEmail, user.id)
      .first();
    if (taken) return c.json({ error: 'an account with that email already exists' }, 409);
    await c.env.DB.prepare('UPDATE users SET email = ? WHERE id = ?').bind(cleanEmail, user.id).run();
  }

  if (wantsPassword) {
    const next = body.password ?? '';
    if (next.length < 8) return c.json({ error: 'password must be at least 8 characters' }, 400);
    const salt = randomSalt();
    await c.env.DB.prepare('UPDATE users SET password_hash = ?, password_salt = ? WHERE id = ?')
      .bind(await hashPassword(next, salt), salt, user.id)
      .run();
  }

  if (typeof body.lead_emails === 'boolean') {
    await c.env.DB.prepare('UPDATE users SET lead_emails = ? WHERE id = ?')
      .bind(body.lead_emails ? 1 : 0, user.id)
      .run();
  }

  const updated = await c.env.DB.prepare('SELECT id, email, name, plan, role, lead_emails FROM users WHERE id = ?')
    .bind(user.id)
    .first();
  return c.json({ user: updated });
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

/* A library card with no poster reads as broken, so linked sources get theirs at
   creation: YouTube from its url pattern, Vimeo from its oembed document. */
async function posterFor(type: string, ref: string): Promise<string> {
  if (type === 'youtube') return `https://i.ytimg.com/vi/${ref}/hqdefault.jpg`;
  if (type !== 'vimeo') return '';
  try {
    const res = await fetch(`https://vimeo.com/api/oembed.json?url=https://vimeo.com/${encodeURIComponent(ref)}`, {
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return '';
    const doc = await res.json<{ thumbnail_url?: string }>();
    return typeof doc.thumbnail_url === 'string' ? doc.thumbnail_url : '';
  } catch {
    return '';
  }
}

api.get('/videos', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT v.id, v.slug, v.title, v.source_type, v.source_ref, v.fallback_ref, v.thumbnail_url, v.visibility,
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
  const user = c.get('user');
  const videoLimit = planFor(user).videos;
  if (videoLimit !== null) {
    const row = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM videos WHERE user_id = ?')
      .bind(user.id)
      .first<{ n: number }>();
    if ((row?.n ?? 0) >= videoLimit) {
      return c.json(
        {
          error: `the free plan holds ${videoLimit} videos \u2014 upgrade for unlimited`,
          upgrade: true,
        },
        402,
      );
    }
  }
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
  const thumbnail = await posterFor(parsed.type, parsed.ref);
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
  return c.json({ video: { id, slug, title, source_type: parsed.type, source_ref: parsed.ref, fallback_ref: '' } }, 201);
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
  if (typeof body.slug === 'string') {
    const slug = slugify(body.slug, '');
    if (!slug) return c.json({ error: 'slug must contain letters or numbers' }, 400);
    const conflict = await c.env.DB.prepare('SELECT id FROM videos WHERE slug = ? AND id != ?')
      .bind(slug, id)
      .first<{ id: string }>();
    if (conflict) return c.json({ error: 'that URL is already taken' }, 409);
    updates.slug = slug;
  }
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
  /* A page that just became public, or a public page whose title, chapters or
     poster just changed, is announced immediately instead of waiting for the
     nightly sweep — minutes to indexed rather than days. */
  const visibility = (updates.visibility as string | undefined) ?? (existing.visibility as string);
  const title = (updates.title as string | undefined) ?? (existing.title as string);
  if (visibility === 'public' && isWorthIndexing(title)) {
    const slug = (updates.slug as string | undefined) ?? (existing.slug as string);
    c.executionCtx.waitUntil(announce(c.env, `/v/${slug}`));
  }
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

const HLS_PART_LIMIT = 20 * 1024 * 1024;
const HLS_PART_COUNT_LIMIT = 3000;
const HLS_PATH = /^[A-Za-z0-9][A-Za-z0-9_.-]*(\/[A-Za-z0-9][A-Za-z0-9_.-]*)*$/;
const HLS_TYPES: Record<string, string> = {
  '.m3u8': 'application/vnd.apple.mpegurl',
  '.ts': 'video/mp2t',
  '.m4s': 'video/mp4',
  '.mp4': 'video/mp4',
};

function hlsPrefix(userId: string, videoId: string): string {
  return `${userId}/${videoId}/hls`;
}

function hlsPartType(path: string): string {
  const dot = path.lastIndexOf('.');
  return dot >= 0 ? HLS_TYPES[path.slice(dot).toLowerCase()] ?? '' : '';
}

async function listAllR2Objects(media: R2Bucket, prefix: string): Promise<R2Object[]> {
  const objects: R2Object[] = [];
  let cursor: string | undefined;
  do {
    const page = await media.list({ prefix, limit: 1000, ...(cursor ? { cursor } : {}) });
    objects.push(...page.objects);
    if (!page.truncated) break;
    cursor = page.cursor;
  } while (cursor);
  return objects;
}

async function repairedHlsMaster(
  media: R2Bucket,
  prefix: string,
  master: string,
  objects: R2Object[],
): Promise<string> {
  const variants = await Promise.all(
    hlsMasterVariantUris(master).map(async (variantUri) => {
      const cleanVariantUri = variantUri.split(/[?#]/, 1)[0];
      if (!cleanVariantUri || cleanVariantUri.startsWith('/') || /^[a-z][a-z\d+.-]*:/i.test(cleanVariantUri)) return null;
      const variantKey = `${prefix}/${cleanVariantUri}`;
      const playlistObject = await media.get(variantKey);
      if (!playlistObject) return null;
      const slash = cleanVariantUri.lastIndexOf('/');
      const directory = slash >= 0 ? cleanVariantUri.slice(0, slash + 1) : '';
      const segmentPrefix = `${prefix}/${directory}`;
      const segmentSizes: Record<string, number> = {};
      for (const object of objects) {
        if (object.key.startsWith(segmentPrefix)) {
          segmentSizes[object.key.slice(segmentPrefix.length)] = object.size;
        }
      }
      return { playlist: await playlistObject.text(), segmentSizes };
    }),
  );
  return rewriteHlsMasterBandwidth(master, variants);
}

api.post('/videos/:id/hls/parts', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  if (!(await assertOwnedVideo(c, id, user.id))) return c.json({ error: 'not found' }, 404);
  const form = await c.req.formData();
  const pathValue = form.get('path');
  const entry: unknown = form.get('file');
  const path = typeof pathValue === 'string' ? pathValue : '';
  if (!HLS_PATH.test(path) || path.split('/').some((part) => part === '..')) {
    return c.json({ error: 'invalid HLS part path' }, 400);
  }
  if (!hlsPartType(path)) return c.json({ error: 'unsupported HLS part extension' }, 415);
  if (!(entry instanceof File)) return c.json({ error: 'file is required' }, 400);
  if (entry.size > HLS_PART_LIMIT) return c.json({ error: 'HLS parts must be 20MB or smaller' }, 413);

  const prefix = hlsPrefix(user.id, id);
  const key = `${prefix}/${path}`;
  await c.env.MEDIA.put(key, entry.stream(), { httpMetadata: { contentType: hlsPartType(path) } });
  return c.json({ ok: true, path, key });
});

api.post('/videos/:id/hls/complete', async (c) => {
  const id = c.req.param('id');
  const user = c.get('user');
  const video = await c.env.DB.prepare(
    'SELECT id, source_type, source_ref, fallback_ref FROM videos WHERE id = ? AND user_id = ?',
  )
    .bind(id, user.id)
    .first<{ id: string; source_type: string; source_ref: string; fallback_ref: string }>();
  if (!video) return c.json({ error: 'not found' }, 404);

  const prefix = hlsPrefix(user.id, id);
  const masterKey = `${prefix}/master.m3u8`;
  const master = await c.env.MEDIA.get(masterKey);
  if (!master) return c.json({ error: 'master.m3u8 has not been uploaded' }, 400);
  const masterText = await master.text();
  const objects = await listAllR2Objects(c.env.MEDIA, prefix);
  if (objects.length > HLS_PART_COUNT_LIMIT) {
    return c.json({ error: 'an HLS ladder cannot contain more than 3000 parts' }, 413);
  }
  const repairedMaster = await repairedHlsMaster(c.env.MEDIA, prefix, masterText, objects);
  if (repairedMaster !== masterText) {
    await c.env.MEDIA.put(masterKey, repairedMaster, {
      httpMetadata: { contentType: 'application/vnd.apple.mpegurl' },
    });
  }

  const nextRef = `/media/${masterKey}`;
  const fallback =
    video.fallback_ref ||
    (video.source_type === 'mp4' &&
    /^\/media\/.+\.(?:mp4|webm)(?:$|\?)/i.test(video.source_ref)
      ? video.source_ref
      : '');
  await c.env.DB.prepare(
    `UPDATE videos SET source_type = 'hls', source_ref = ?, fallback_ref = ?, updated_at = ? WHERE id = ? AND user_id = ?`,
  )
    .bind(nextRef, fallback, now(), id, user.id)
    .run();
  return c.json({ ok: true, source_type: 'hls', source_ref: nextRef, fallback_ref: fallback });
});

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
  const usedIds = new Set<string>();
  for (const cta of rows) {
    const suppliedId = typeof cta.id === 'string' ? cta.id : '';
    const ctaId =
      /^cta_[a-z0-9]+$/i.test(suppliedId) && !usedIds.has(suppliedId) ? suppliedId : newId('cta');
    usedIds.add(ctaId);
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO ctas (id, video_id, kind, start_seconds, end_seconds, headline, body,
                           button_text, button_url, fields, skippable, position, style)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      ).bind(
        ctaId,
        id,
        String(cta.kind),
        Number(cta.start_seconds ?? 0) || 0,
        Number(cta.end_seconds ?? 0) || 0,
        String(cta.headline ?? ''),
        String(cta.body ?? ''),
        String(cta.button_text ?? ''),
        normalizeCtaUrl(cta.button_url),
        String(cta.fields ?? 'email'),
        cta.skippable === false ? 0 : 1,
        String(cta.position ?? 'bottom-right'),
        normalizeCtaStyle(cta.style, cta.kind),
      ),
    );
  }
  await c.env.DB.batch(statements);
  return c.json({ ok: true, count: rows.length });
});

/* ----------------------------------------------------------- playlists ---- */

api.get('/playlists', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.description, p.layout, p.autoplay_next, p.visibility, p.created_at,
            p.password_hash != '' AS has_password,
            (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS item_count,
            (SELECT GROUP_CONCAT(i.video_id) FROM (
               SELECT video_id FROM playlist_items WHERE playlist_id = p.id ORDER BY position
             ) i) AS item_ids
       FROM playlists p WHERE p.user_id = ? ORDER BY p.created_at DESC`,
  )
    .bind(c.get('user').id)
    .all<Record<string, unknown> & { item_ids: string | null }>();
  // The dashboard ticks the videos already on a playlist, so it needs the members,
  // not just how many there are.
  const playlists = (results ?? []).map(({ item_ids, ...row }) => ({
    ...row,
    video_ids: item_ids ? String(item_ids).split(',') : [],
  }));
  return c.json({ playlists });
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

api.patch('/playlists/:id', async (c) => {
  const id = c.req.param('id');
  const owned = await c.env.DB.prepare('SELECT id FROM playlists WHERE id = ? AND user_id = ?')
    .bind(id, c.get('user').id)
    .first();
  if (!owned) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{
    title?: string;
    description?: string;
    layout?: string;
    autoplay_next?: boolean | number;
    visibility?: string;
    password?: string;
  }>();
  const sets: string[] = [];
  const values: (string | number)[] = [];
  if (typeof body.title === 'string' && body.title.trim()) {
    sets.push('title = ?');
    values.push(body.title.trim());
  }
  if (typeof body.description === 'string') {
    sets.push('description = ?');
    values.push(body.description.trim());
  }
  if (body.layout === 'sidebar' || body.layout === 'grid' || body.layout === 'filmstrip') {
    sets.push('layout = ?');
    values.push(body.layout);
  }
  if (body.autoplay_next != null) {
    sets.push('autoplay_next = ?');
    values.push(body.autoplay_next ? 1 : 0);
  }
  if (body.visibility === 'public' || body.visibility === 'unlisted' || body.visibility === 'password') {
    sets.push('visibility = ?');
    values.push(body.visibility);
    if (body.visibility !== 'password') {
      sets.push('password_hash = ?', 'password_salt = ?');
      values.push('', '');
    }
  }
  const password = (body.password ?? '').trim();
  if (password) {
    const salt = randomSalt();
    sets.push('password_hash = ?', 'password_salt = ?');
    values.push(await hashPassword(password, salt), salt);
  }
  if (!sets.length) return c.json({ ok: true });
  values.push(id);
  await c.env.DB.prepare(`UPDATE playlists SET ${sets.join(', ')} WHERE id = ?`)
    .bind(...values)
    .run();
  return c.json({ ok: true });
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
  const video = c.req.query('video') ?? '';
  const { results } = await c.env.DB.prepare(
    `SELECT l.*, v.title AS video_title FROM leads l JOIN videos v ON v.id = l.video_id
      WHERE l.user_id = ? AND (? = '' OR l.video_id = ?) ORDER BY l.created_at DESC LIMIT 500`,
  )
    .bind(c.get('user').id, video, video)
    .all();
  return c.json({ leads: results ?? [] });
});

api.get('/leads.csv', async (c) => {
  const video = c.req.query('video') ?? '';
  const { results } = await c.env.DB.prepare(
    `SELECT l.email, l.name, l.phone, l.position, l.referrer, l.created_at, v.title
       FROM leads l JOIN videos v ON v.id = l.video_id
      WHERE l.user_id = ? AND (? = '' OR l.video_id = ?) ORDER BY l.created_at DESC`,
  )
    .bind(c.get('user').id, video, video)
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
    `SELECT id, url, events, active, created_at, last_status, last_attempt_at, last_error
       FROM webhooks WHERE user_id = ? ORDER BY created_at DESC`,
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

/* A customer needs to know an endpoint works before waiting for a real lead. */
api.post('/webhooks/:id/test', async (c) => {
  const hook = await c.env.DB.prepare('SELECT id, url, secret, events FROM webhooks WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .first<{ id: string; url: string; secret: string; events: string }>();
  if (!hook) return c.json({ error: 'not found' }, 404);
  const result = await deliverTestWebhook(c.env, hook);
  return c.json(result, result.ok ? 200 : 502);
});

api.delete('/webhooks/:id', async (c) => {
  await c.env.DB.prepare('DELETE FROM webhooks WHERE id = ? AND user_id = ?')
    .bind(c.req.param('id'), c.get('user').id)
    .run();
  return c.json({ ok: true });
});

/* ------------------------------------------------------------ api keys ---- */

api.get('/keys', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT id, name, prefix, created_at, last_used_at FROM api_keys
      WHERE user_id = ? AND revoked_at = 0 ORDER BY created_at DESC`,
  )
    .bind(c.get('user').id)
    .all();
  return c.json({ keys: results ?? [] });
});

/** The only time the full key exists outside the integration that stores it. */
api.post('/keys', async (c) => {
  const body = await c.req.json<{ name?: string }>().catch(() => ({ name: '' }));
  const key = generateApiKey();
  const id = newId('key');
  await c.env.DB.prepare(
    'INSERT INTO api_keys (id, user_id, name, prefix, key_hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  )
    .bind(id, c.get('user').id, (body.name ?? '').trim().slice(0, 60), keyPrefix(key), await hashApiKey(key), now())
    .run();
  return c.json({ id, key }, 201);
});

api.delete('/keys/:id', async (c) => {
  await c.env.DB.prepare('UPDATE api_keys SET revoked_at = ? WHERE id = ? AND user_id = ? AND revoked_at = 0')
    .bind(now(), c.req.param('id'), c.get('user').id)
    .run();
  return c.json({ ok: true });
});

/* ------------------------------------------------------------- billing ---- */

api.get('/billing', async (c) => {
  const user = c.get('user');
  const offer = offerForSeats(await seatsSold(c.env), lifetimeDiscount(c.env));
  const videos = await c.env.DB.prepare('SELECT COUNT(*) AS n FROM videos WHERE user_id = ?')
    .bind(user.id)
    .first<{ n: number }>();
  const { results } = await c.env.DB.prepare(
    'SELECT id, status, amount_cents, currency, created_at FROM purchases WHERE user_id = ? ORDER BY created_at DESC',
  )
    .bind(user.id)
    .all();
  const plan = planFor(user);
  const plays = await playUsage(c.env, user);
  return c.json({
    plan: user.plan,
    plan_name: plan.name,
    lifetime: isLifetime(user),
    paid: isPaid(user),
    admin: isAdmin(user),
    checkout_ready: Boolean(c.env.DODO_PAYMENTS_API_KEY && c.env.DODO_LIFETIME_PRODUCT_ID),
    subscription_ready: Boolean(c.env.DODO_PAYMENTS_API_KEY && c.env.DODO_STARTER_PRODUCT_ID),
    subscription_id: user.subscription_id ?? '',
    plan_renews_at: user.plan_renews_at ?? 0,
    offer,
    plans: PLANS,
    overage_per_10k_usd: OVERAGE_PER_10K_USD,
    plays,
    usage: {
      videos: videos?.n ?? 0,
      video_limit: plan.videos,
      storage_limit_bytes: plan.storageBytes,
    },
    purchases: results ?? [],
  });
});

/**
 * Subscription checkout. Lifetime accounts have nothing to gain from a
 * subscription, and an account already on the requested plan is rejected so a
 * customer cannot end up paying twice.
 */
api.post('/billing/subscribe', async (c) => {
  const user = c.get('user');
  const body = await c.req.json<{ plan?: string; cycle?: string }>().catch(() => ({}) as Record<string, string>);
  const plan = body.plan ?? '';
  const cycle: Cycle = body.cycle === 'annual' ? 'annual' : 'monthly';
  if (plan !== 'starter' && plan !== 'agency') return c.json({ error: 'plan must be starter or agency' }, 400);
  if (isLifetime(user)) return c.json({ error: 'your lifetime licence already covers this' }, 409);
  if (user.plan === plan) return c.json({ error: `you are already on ${PLANS[plan].name}` }, 409);
  if (!productIdFor(c.env, plan, cycle)) return c.json({ error: 'this plan is not on sale yet' }, 503);
  const base = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
  const result = await createCheckout(c.env, user, `${base}/app.html?purchase=complete`, plan, cycle);
  if (!result.ok) return c.json({ error: result.error }, result.status as 502 | 503);
  return c.json({ url: result.url });
});

api.post('/billing/checkout', async (c) => {
  const user = c.get('user');
  if (isLifetime(user)) return c.json({ error: 'you already own lifetime' }, 409);
  const base = c.env.PUBLIC_BASE_URL || new URL(c.req.url).origin;
  const result = await createCheckout(c.env, user, `${base}/app.html?purchase=complete`);
  if (!result.ok) return c.json({ error: result.error }, result.status as 502 | 503);
  const id = newId('pur');
  const ts = now();
  await c.env.DB.prepare(
    `INSERT INTO purchases (id, user_id, provider, provider_ref, status, amount_cents, currency, created_at, updated_at)
     VALUES (?, ?, 'dodo', ?, 'pending', ?, 'USD', ?, ?)`,
  )
    .bind(id, user.id, id, offerForSeats(await seatsSold(c.env), lifetimeDiscount(c.env)).net_usd * 100, ts, ts)
    .run();
  return c.json({ url: result.url });
});

/* ------------------------------------------------------------- uploads ---- */

/* Images and caption files are metadata, not content: a poster or a logo has no reason to
   weigh what a video does, and a loose cap is a cheap way to fill storage. */
const UPLOAD_LIMITS = { video: 200 * 1024 * 1024, image: 5 * 1024 * 1024, text: 1024 * 1024 };
const ALLOWED_UPLOAD_TYPES: Record<string, string> = {
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'text/vtt': 'vtt',
};

function uploadLimitFor(ext: string): { bytes: number; label: string } {
  if (ext === 'mp4' || ext === 'webm') return { bytes: UPLOAD_LIMITS.video, label: '200MB' };
  if (ext === 'vtt') return { bytes: UPLOAD_LIMITS.text, label: '1MB' };
  return { bytes: UPLOAD_LIMITS.image, label: '5MB' };
}

const MULTIPART_PART_LIMIT = 10 * 1024 * 1024;
const MULTIPART_PART_COUNT_LIMIT = 40;

function multipartKeyError(key: string, userId: string): 'ownership' | 'format' | null {
  if (!key.startsWith(`${userId}/`)) return 'ownership';
  const name = key.slice(userId.length + 1);
  return /^[A-Za-z0-9_-]+\.(?:mp4|webm)$/.test(name) ? null : 'format';
}

function multipartError(c: Context<{ Bindings: Env; Variables: Vars }>, key: unknown, userId: string): Response | null {
  if (typeof key !== 'string' || !key) return c.json({ error: 'upload key is required' }, 400);
  const error = multipartKeyError(key, userId);
  if (error === 'ownership') return c.json({ error: 'upload does not belong to this user' }, 403);
  if (error === 'format') return c.json({ error: 'invalid upload key' }, 400);
  return null;
}

api.post('/uploads/create', async (c) => {
  const body = await c.req.json<{ filename?: string; extension?: string; size?: number }>();
  const filename = typeof body.filename === 'string' ? body.filename.trim() : '';
  const extension = (typeof body.extension === 'string' ? body.extension : filename.split('.').pop() ?? '')
    .replace(/^\./, '')
    .toLowerCase();
  if (extension !== 'mp4' && extension !== 'webm') {
    return c.json({ error: 'only MP4 and WebM video uploads are supported' }, 415);
  }
  const size = body.size;
  if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
    return c.json({ error: 'a valid file size is required' }, 400);
  }
  const limit = uploadLimitFor(extension);
  if (size > limit.bytes) return c.json({ error: `file is larger than ${limit.label}` }, 413);
  const key = `${c.get('user').id}/${newId()}.${extension}`;
  const upload = await c.env.MEDIA.createMultipartUpload(key, {
    httpMetadata: { contentType: `video/${extension}` },
  });
  return c.json({ key, uploadId: upload.uploadId }, 201);
});

api.post('/uploads/part', async (c) => {
  const form = await c.req.formData();
  const key = form.get('key');
  const uploadId = form.get('uploadId');
  const partNumber = Number(form.get('partNumber'));
  const entry: unknown = form.get('file');
  const invalidKey = multipartError(c, key, c.get('user').id);
  if (invalidKey) return invalidKey;
  if (typeof uploadId !== 'string' || !uploadId) return c.json({ error: 'upload id is required' }, 400);
  if (!Number.isInteger(partNumber) || partNumber < 1 || partNumber > MULTIPART_PART_COUNT_LIMIT) {
    return c.json({ error: 'part number must be between 1 and 40' }, 400);
  }
  if (!(entry instanceof File)) return c.json({ error: 'file is required' }, 400);
  if (entry.size > MULTIPART_PART_LIMIT) return c.json({ error: 'upload parts must be 10 MB or smaller' }, 413);
  try {
    const upload = c.env.MEDIA.resumeMultipartUpload(key as string, uploadId);
    const part = await upload.uploadPart(partNumber, entry.stream());
    return c.json({ etag: part.etag });
  } catch {
    return c.json({ error: 'upload session not found or expired' }, 400);
  }
});

api.post('/uploads/complete', async (c) => {
  const body = await c.req.json<{
    key?: string;
    uploadId?: string;
    parts?: Array<{ partNumber?: number; etag?: string }>;
  }>();
  const invalidKey = multipartError(c, body.key, c.get('user').id);
  if (invalidKey) return invalidKey;
  if (typeof body.uploadId !== 'string' || !body.uploadId) return c.json({ error: 'upload id is required' }, 400);
  if (!Array.isArray(body.parts) || body.parts.length < 1 || body.parts.length > MULTIPART_PART_COUNT_LIMIT) {
    return c.json({ error: 'parts must contain between 1 and 40 entries' }, 400);
  }
  let previous = 0;
  const parts: R2UploadedPart[] = [];
  for (const part of body.parts) {
    if (
      !Number.isInteger(part.partNumber) ||
      (part.partNumber as number) < 1 ||
      (part.partNumber as number) > MULTIPART_PART_COUNT_LIMIT ||
      typeof part.etag !== 'string' ||
      !part.etag ||
      (part.partNumber as number) <= previous
    ) {
      return c.json({ error: 'parts must be ordered by part number' }, 400);
    }
    previous = part.partNumber as number;
    parts.push({ partNumber: previous, etag: part.etag });
  }
  try {
    const upload = c.env.MEDIA.resumeMultipartUpload(body.key as string, body.uploadId);
    await upload.complete(parts);
  } catch {
    return c.json({ error: 'upload session not found or expired' }, 400);
  }
  const object = await c.env.MEDIA.head(body.key as string);
  if (object && object.size > UPLOAD_LIMITS.video) {
    await c.env.MEDIA.delete(body.key as string);
    return c.json({ error: `file is larger than ${uploadLimitFor('mp4').label}` }, 413);
  }
  return c.json({ key: body.key, url: `/media/${body.key}` }, 201);
});

api.post('/uploads/abort', async (c) => {
  const body = await c.req.json<{ key?: string; uploadId?: string }>();
  const invalidKey = multipartError(c, body.key, c.get('user').id);
  if (invalidKey) return invalidKey;
  if (typeof body.uploadId !== 'string' || !body.uploadId) return c.json({ error: 'upload id is required' }, 400);
  try {
    const upload = c.env.MEDIA.resumeMultipartUpload(body.key as string, body.uploadId);
    await upload.abort();
    return c.json({ ok: true });
  } catch {
    return c.json({ error: 'upload session not found or expired' }, 400);
  }
});

api.post('/uploads', async (c) => {
  const form = await c.req.formData();
  // workers-types narrows FormData.get() to string, so read the entry as unknown
  // and confirm it is really an uploaded file.
  const entry: unknown = form.get('file');
  if (!(entry instanceof File)) return c.json({ error: 'file is required' }, 400);
  const file = entry;
  const declared = file.type || 'application/octet-stream';
  const ext = ALLOWED_UPLOAD_TYPES[declared] ?? (file.name.endsWith('.vtt') ? 'vtt' : '');
  if (!ext) return c.json({ error: `unsupported file type: ${declared}` }, 415);
  const limit = uploadLimitFor(ext);
  if (file.size > limit.bytes) return c.json({ error: `file is larger than ${limit.label}` }, 413);
  const key = `${c.get('user').id}/${newId()}.${ext}`;
  await c.env.MEDIA.put(key, file.stream(), { httpMetadata: { contentType: declared } });
  return c.json({ key, url: `/media/${key}` }, 201);
});
