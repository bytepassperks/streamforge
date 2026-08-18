import { Hono } from 'hono';
import type { Chapter, Cta, Env, Video } from '../lib/types';
import {
  deviceFromUserAgent,
  escapeHtml,
  hostnameAllowed,
  mergePlayerConfig,
  newId,
  now,
  retentionBucket,
} from '../lib/util';
import { verifyPassword } from '../lib/auth';
import { signAccessToken, verifyAccessToken } from '../lib/tokens';
import { dispatchWebhooks } from '../lib/webhooks';
import { offerForSeats, seatsSold, verifyDodoSignature } from '../lib/billing';

export const pub = new Hono<{ Bindings: Env }>();

/**
 * Embeds may be loaded from any customer site, so the config endpoint is CORS
 * open; access control is enforced per video via domain allowlist + password.
 */
pub.use('/api/embed/*', async (c, next) => {
  await next();
  c.header('access-control-allow-origin', '*');
  c.header('access-control-allow-headers', 'content-type');
});

/* ---------------------------------------------------------- lifetime ---- */

/** Seat counter for the landing page — derived from real paid purchases. */
pub.get('/api/public/offer', async (c) => {
  const offer = offerForSeats(await seatsSold(c.env));
  c.header('cache-control', 'public, max-age=60');
  return c.json({ offer });
});

/**
 * Dodo Payments delivers Standard Webhooks; a verified `payment.succeeded`
 * whose metadata carries our user id flips that account to lifetime.
 */
pub.post('/api/billing/dodo/webhook', async (c) => {
  const body = await c.req.text();
  const id = c.req.header('webhook-id') ?? '';
  const verified = await verifyDodoSignature(
    c.env.DODO_WEBHOOK_SECRET ?? '',
    { id, timestamp: c.req.header('webhook-timestamp') ?? '', signature: c.req.header('webhook-signature') ?? '' },
    body,
  );
  if (!verified) return c.json({ error: 'invalid signature' }, 401);

  const seen = await c.env.DB.prepare('SELECT id FROM webhook_events WHERE id = ?').bind(id).first();
  if (seen) return c.json({ ok: true, duplicate: true });

  let event: {
    type?: string;
    data?: {
      payment_id?: string;
      metadata?: Record<string, string>;
      total_amount?: number;
      currency?: string;
      customer?: { email?: string };
    };
  };
  try {
    event = JSON.parse(body);
  } catch {
    return c.json({ error: 'invalid json' }, 400);
  }
  // Recorded only once the payload parses, so a malformed body can be retried.
  await c.env.DB.prepare('INSERT INTO webhook_events (id, received_at) VALUES (?, ?)').bind(id, now()).run();
  if (event.type !== 'payment.succeeded') return c.json({ ok: true, ignored: event.type ?? '' });

  const data = event.data ?? {};
  const userId = data.metadata?.user_id ?? '';
  const email = (data.customer?.email ?? '').trim().toLowerCase();
  const user = userId
    ? await c.env.DB.prepare('SELECT id FROM users WHERE id = ?').bind(userId).first<{ id: string }>()
    : email
      ? await c.env.DB.prepare('SELECT id FROM users WHERE email = ?').bind(email).first<{ id: string }>()
      : null;
  if (!user) return c.json({ ok: true, unmatched: true });

  const ts = now();
  await c.env.DB.prepare("UPDATE users SET plan = 'lifetime', lifetime_at = ? WHERE id = ?")
    .bind(ts, user.id)
    .run();
  await c.env.DB.prepare(
    `INSERT INTO purchases (id, user_id, provider, provider_ref, status, amount_cents, currency, created_at, updated_at)
     VALUES (?, ?, 'dodo', ?, 'paid', ?, ?, ?, ?)
     ON CONFLICT(provider, provider_ref) DO UPDATE SET status = 'paid', updated_at = excluded.updated_at`,
  )
    .bind(
      newId('pur'),
      user.id,
      data.payment_id ?? id,
      Math.round(data.total_amount ?? 0),
      (data.currency ?? 'USD').toUpperCase(),
      ts,
      ts,
    )
    .run();
  await c.env.DB.prepare(
    "UPDATE purchases SET status = 'superseded', updated_at = ? WHERE user_id = ? AND status = 'pending'",
  )
    .bind(ts, user.id)
    .run();
  return c.json({ ok: true });
});

function embedderHostname(c: { req: { header: (n: string) => string | undefined } }): string | null {
  const source = c.req.header('referer') || c.req.header('origin') || '';
  if (!source) return null;
  try {
    return new URL(source).hostname;
  } catch {
    return null;
  }
}

async function loadVideoBySlugOrId(env: Env, key: string): Promise<Video | null> {
  return env.DB.prepare('SELECT * FROM videos WHERE id = ? OR slug = ? LIMIT 1')
    .bind(key, key)
    .first<Video>();
}

interface EmbedPayload {
  video: {
    id: string;
    slug: string;
    title: string;
    description: string;
    source_type: string;
    source_ref: string;
    duration: number;
    thumbnail_url: string;
    captions_url: string;
  };
  player: ReturnType<typeof mergePlayerConfig>;
  chapters: Pick<Chapter, 'start_seconds' | 'title'>[];
  ctas: Omit<Cta, 'video_id'>[];
  variant: 'a' | 'b';
  badge: boolean;
}

async function buildEmbedPayload(env: Env, video: Video, variant: 'a' | 'b'): Promise<EmbedPayload> {
  const chapters = await env.DB.prepare(
    'SELECT start_seconds, title FROM chapters WHERE video_id = ? ORDER BY start_seconds',
  )
    .bind(video.id)
    .all<Pick<Chapter, 'start_seconds' | 'title'>>();
  const ctas = await env.DB.prepare(
    `SELECT id, kind, start_seconds, end_seconds, headline, body, button_text, button_url, fields,
            skippable, position
       FROM ctas WHERE video_id = ? ORDER BY start_seconds`,
  )
    .bind(video.id)
    .all<Omit<Cta, 'video_id'>>();
  const thumbnail = variant === 'b' && video.thumbnail_url_b ? video.thumbnail_url_b : video.thumbnail_url;
  const owner = await env.DB.prepare('SELECT plan FROM users WHERE id = ?')
    .bind(video.user_id)
    .first<{ plan: string }>();
  return {
    video: {
      id: video.id,
      slug: video.slug,
      title: video.title,
      description: video.description,
      source_type: video.source_type,
      source_ref: video.source_ref,
      duration: video.duration,
      thumbnail_url: thumbnail,
      captions_url: video.captions_url,
    },
    player: mergePlayerConfig(video.player_config),
    chapters: chapters.results ?? [],
    ctas: ctas.results ?? [],
    variant,
    badge: owner?.plan !== 'lifetime',
  };
}

pub.get('/api/embed/:key', async (c) => {
  const video = await loadVideoBySlugOrId(c.env, c.req.param('key'));
  if (!video) return c.json({ error: 'not found' }, 404);

  const host = embedderHostname(c);
  if (video.allowed_domains && host && !hostnameAllowed(host, video.allowed_domains)) {
    return c.json({ error: 'this video is not allowed to play on this domain', code: 'domain_blocked' }, 403);
  }

  if (video.visibility === 'password' && video.password_hash) {
    const token = c.req.query('token') ?? '';
    const ok = token && (await verifyAccessToken(video.password_hash, video.id, token));
    if (!ok) return c.json({ error: 'password required', code: 'password_required', title: video.title }, 401);
  }

  const variant: 'a' | 'b' = video.thumbnail_url_b && Math.random() < 0.5 ? 'b' : 'a';
  return c.json(await buildEmbedPayload(c.env, video, variant));
});

pub.post('/api/embed/:key/unlock', async (c) => {
  const video = await loadVideoBySlugOrId(c.env, c.req.param('key'));
  if (!video) return c.json({ error: 'not found' }, 404);
  if (!video.password_hash) return c.json({ error: 'video is not password protected' }, 400);
  const { password } = await c.req.json<{ password?: string }>();
  const ok = await verifyPassword(password ?? '', video.password_salt, video.password_hash);
  if (!ok) return c.json({ error: 'incorrect password' }, 401);
  return c.json({ token: await signAccessToken(video.password_hash, video.id) });
});

/* -------------------------------------------------------------- tracking --- */

const TRACKED_KINDS = new Set(['load', 'play', 'pause', 'progress', 'complete', 'seek', 'cta_view', 'cta_click']);

pub.post('/api/track', async (c) => {
  const body = await c.req.json<{
    video_id?: string;
    view_id?: string;
    kind?: string;
    position?: number;
    value?: string;
    variant?: string;
    duration?: number;
  }>();
  const kind = String(body.kind ?? '');
  if (!TRACKED_KINDS.has(kind)) return c.json({ error: 'unknown event' }, 400);
  const video = await c.env.DB.prepare('SELECT id, user_id, duration FROM videos WHERE id = ?')
    .bind(String(body.video_id ?? ''))
    .first<{ id: string; user_id: string; duration: number }>();
  if (!video) return c.json({ error: 'not found' }, 404);

  const referrerRaw = c.req.header('referer') ?? '';
  let referrer = '';
  try {
    referrer = referrerRaw ? new URL(referrerRaw).hostname : '';
  } catch {
    referrer = '';
  }
  const position = Number(body.position ?? 0) || 0;
  const duration = Number(body.duration ?? 0) || video.duration;
  const variant = body.variant === 'b' ? 'b' : 'a';

  const statements = [
    c.env.DB.prepare(
      `INSERT INTO events (id, video_id, view_id, kind, position, value, referrer, country, device, variant, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      newId('evt'),
      video.id,
      String(body.view_id ?? 'anon').slice(0, 40),
      kind,
      position,
      String(body.value ?? '').slice(0, 200),
      referrer,
      (c.req.raw as unknown as { cf?: { country?: string } }).cf?.country ?? '',
      deviceFromUserAgent(c.req.header('user-agent') ?? ''),
      variant,
      now(),
    ),
  ];

  if (kind === 'progress' && duration > 0) {
    const bucket = retentionBucket(position, duration);
    statements.push(
      c.env.DB.prepare(
        `INSERT INTO retention (video_id, bucket, views) VALUES (?, ?, 1)
         ON CONFLICT(video_id, bucket) DO UPDATE SET views = views + 1`,
      ).bind(video.id, bucket),
    );
  }
  if (duration > 0 && !(video.duration > 0)) {
    statements.push(
      c.env.DB.prepare('UPDATE videos SET duration = ? WHERE id = ?').bind(duration, video.id),
    );
  }
  await c.env.DB.batch(statements);

  if (kind === 'play' || kind === 'complete' || kind === 'cta_click') {
    c.executionCtx.waitUntil(
      dispatchWebhooks(c.env, video.user_id, kind, { video_id: video.id, position, referrer }),
    );
  }
  return c.json({ ok: true });
});

pub.post('/api/leads/:videoId', async (c) => {
  const video = await c.env.DB.prepare('SELECT id, user_id FROM videos WHERE id = ?')
    .bind(c.req.param('videoId'))
    .first<{ id: string; user_id: string }>();
  if (!video) return c.json({ error: 'not found' }, 404);
  const body = await c.req.json<{
    email?: string;
    name?: string;
    phone?: string;
    position?: number;
    view_id?: string;
  }>();
  const email = (body.email ?? '').trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'a valid email is required' }, 400);

  let referrer = '';
  try {
    const raw = c.req.header('referer') ?? '';
    referrer = raw ? new URL(raw).hostname : '';
  } catch {
    referrer = '';
  }
  const id = newId('led');
  await c.env.DB.batch([
    c.env.DB.prepare(
      `INSERT INTO leads (id, video_id, user_id, email, name, phone, position, referrer, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    ).bind(
      id,
      video.id,
      video.user_id,
      email,
      (body.name ?? '').trim().slice(0, 120),
      (body.phone ?? '').trim().slice(0, 40),
      Number(body.position ?? 0) || 0,
      referrer,
      now(),
    ),
    c.env.DB.prepare(
      `INSERT INTO events (id, video_id, view_id, kind, position, value, referrer, country, device, variant, created_at)
       VALUES (?, ?, ?, 'lead', ?, ?, ?, '', ?, 'a', ?)`,
    ).bind(
      newId('evt'),
      video.id,
      String(body.view_id ?? 'anon').slice(0, 40),
      Number(body.position ?? 0) || 0,
      email,
      referrer,
      deviceFromUserAgent(c.req.header('user-agent') ?? ''),
      now(),
    ),
  ]);
  c.executionCtx.waitUntil(
    dispatchWebhooks(c.env, video.user_id, 'lead', { lead_id: id, video_id: video.id, email, referrer }),
  );
  return c.json({ ok: true }, 201);
});

/* ------------------------------------------------------------ delivery ----- */

/** R2-backed media delivery with range support so seeking works in the player. */
pub.get('/media/*', async (c) => {
  const key = decodeURIComponent(c.req.path.replace(/^\/media\//, ''));
  if (!key) return c.text('not found', 404);
  const range = c.req.header('range');
  const object = range
    ? await c.env.MEDIA.get(key, { range: c.req.raw.headers })
    : await c.env.MEDIA.get(key);
  if (!object) return c.text('not found', 404);

  const headers = new Headers();
  object.writeHttpMetadata(headers);
  headers.set('etag', object.httpEtag);
  headers.set('accept-ranges', 'bytes');
  headers.set('cache-control', 'public, max-age=31536000, immutable');
  if (range && object.range && 'offset' in object.range) {
    const offset = object.range.offset ?? 0;
    const length = object.range.length ?? object.size - offset;
    headers.set('content-range', `bytes ${offset}-${offset + length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }
  return new Response(object.body, { headers });
});

function playerShell(payloadJson: string, title: string, extraBody = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<link rel="stylesheet" href="/player/player.css">
<style>html,body{margin:0;height:100%;background:transparent}</style>
</head>
<body>
<div id="sf-player" class="sf-fill"></div>
${extraBody}
<script>window.__SF_EMBED__ = ${payloadJson};</script>
<script src="/player/player.js"></script>
<script>StreamForge.mount(document.getElementById('sf-player'), window.__SF_EMBED__);</script>
</body>
</html>`;
}

/** iframe target for embeds. */
pub.get('/e/:key', async (c) => {
  const video = await loadVideoBySlugOrId(c.env, c.req.param('key'));
  if (!video) return c.html('<p style="font:14px sans-serif">Video not found.</p>', 404);

  const host = embedderHostname(c);
  if (video.allowed_domains && host && !hostnameAllowed(host, video.allowed_domains)) {
    return c.html(
      `<div style="font:14px/1.5 system-ui;padding:24px;color:#fff;background:#111">
         This video is not authorised to play on <b>${escapeHtml(host)}</b>.
       </div>`,
      403,
    );
  }
  if (video.visibility === 'password' && video.password_hash) {
    const payload = JSON.stringify({
      locked: true,
      video: { id: video.id, slug: video.slug, title: video.title, thumbnail_url: video.thumbnail_url },
    });
    return c.html(playerShell(payload, video.title));
  }
  const variant: 'a' | 'b' = video.thumbnail_url_b && Math.random() < 0.5 ? 'b' : 'a';
  const payload = await buildEmbedPayload(c.env, video, variant);
  return c.html(playerShell(JSON.stringify(payload), video.title));
});

/** Public, SEO-friendly video page. */
pub.get('/v/:slug', async (c) => {
  const video = await loadVideoBySlugOrId(c.env, c.req.param('slug'));
  if (!video) return c.html('<p style="font:14px sans-serif">Video not found.</p>', 404);
  if (video.visibility === 'password' && video.password_hash) {
    const payload = JSON.stringify({
      locked: true,
      video: { id: video.id, slug: video.slug, title: video.title, thumbnail_url: video.thumbnail_url },
    });
    return c.html(pageShell(video, payload, c.env));
  }
  const payload = await buildEmbedPayload(c.env, video, 'a');
  return c.html(pageShell(video, JSON.stringify(payload), c.env));
});

function pageShell(video: Video, payloadJson: string, env: Env): string {
  const base = env.PUBLIC_BASE_URL.replace(/\/$/, '');
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'VideoObject',
    name: video.title,
    description: video.description,
    thumbnailUrl: video.thumbnail_url || undefined,
    uploadDate: new Date(video.created_at * 1000).toISOString(),
    duration: video.duration ? `PT${Math.round(video.duration)}S` : undefined,
    embedUrl: `${base}/e/${video.slug}`,
  });
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(video.title)}</title>
<meta name="description" content="${escapeHtml(video.description).slice(0, 300)}">
<meta property="og:type" content="video.other">
<meta property="og:title" content="${escapeHtml(video.title)}">
<meta property="og:description" content="${escapeHtml(video.description).slice(0, 300)}">
${video.thumbnail_url ? `<meta property="og:image" content="${escapeHtml(video.thumbnail_url)}">` : ''}
<meta property="og:video" content="${base}/e/${escapeHtml(video.slug)}">
<meta name="twitter:card" content="player">
<meta name="twitter:title" content="${escapeHtml(video.title)}">
<meta name="twitter:description" content="${escapeHtml(video.description).slice(0, 200)}">
${video.thumbnail_url ? `<meta name="twitter:image" content="${escapeHtml(video.thumbnail_url)}">` : ''}
<meta name="twitter:player" content="${base}/e/${escapeHtml(video.slug)}">
<meta name="twitter:player:width" content="1280">
<meta name="twitter:player:height" content="720">
<link rel="stylesheet" href="/player/player.css">
<link rel="stylesheet" href="/styles.css">
<script type="application/ld+json">${jsonLd}</script>
</head>
<body class="sf-page">
<header class="sf-page-head"><a class="sf-brand" href="/">Videokr</a></header>
<main class="sf-page-main">
  <div class="sf-page-player"><div id="sf-player" class="sf-fill"></div></div>
  <h1>${escapeHtml(video.title)}</h1>
  ${video.description ? `<p class="sf-page-desc">${escapeHtml(video.description)}</p>` : ''}
  ${
    video.transcript
      ? `<section class="sf-transcript"><h2>Transcript</h2>
           <input id="sf-transcript-search" placeholder="Search this transcript…" aria-label="Search transcript">
           <pre id="sf-transcript-body">${escapeHtml(video.transcript)}</pre></section>`
      : ''
  }
</main>
<script>window.__SF_EMBED__ = ${payloadJson};</script>
<script src="/player/player.js"></script>
<script src="/page.js"></script>
</body>
</html>`;
}

/** Public playlist page: a collection of videos on one page. */
pub.get('/pl/:slug', async (c) => {
  const playlist = await c.env.DB.prepare('SELECT * FROM playlists WHERE slug = ? OR id = ?')
    .bind(c.req.param('slug'), c.req.param('slug'))
    .first<{ id: string; title: string; description: string; layout: string; autoplay_next: number }>();
  if (!playlist) return c.html('<p style="font:14px sans-serif">Playlist not found.</p>', 404);
  const { results } = await c.env.DB.prepare(
    `SELECT v.* FROM playlist_items i JOIN videos v ON v.id = i.video_id
      WHERE i.playlist_id = ? ORDER BY i.position`,
  )
    .bind(playlist.id)
    .all<Video>();
  const videos = results ?? [];
  const payloads = await Promise.all(videos.map((v) => buildEmbedPayload(c.env, v, 'a')));
  const data = JSON.stringify({
    playlist: { title: playlist.title, layout: playlist.layout, autoplay_next: Boolean(playlist.autoplay_next) },
    items: payloads,
  });
  return c.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(playlist.title)}</title>
<meta name="description" content="${escapeHtml(playlist.description).slice(0, 300)}">
<link rel="stylesheet" href="/player/player.css">
<link rel="stylesheet" href="/styles.css">
</head>
<body class="sf-page">
<header class="sf-page-head"><a class="sf-brand" href="/">Videokr</a></header>
<main class="sf-playlist" data-layout="${escapeHtml(playlist.layout)}">
  <div class="sf-playlist-stage"><div id="sf-player" class="sf-fill"></div></div>
  <aside class="sf-playlist-list" id="sf-playlist-list"></aside>
</main>
<h1 class="sf-playlist-title">${escapeHtml(playlist.title)}</h1>
<script>window.__SF_PLAYLIST__ = ${data};</script>
<script src="/player/player.js"></script>
<script src="/playlist.js"></script>
</body>
</html>`);
});
