/**
 * Integration API (`/api/v1`), authenticated with an account API key rather
 * than a browser session. This is what the Videokr WordPress plugin talks to:
 * it needs to list an account's library to build a picker, and it needs the
 * embed base URL so the shortcode can render without hardcoding a host.
 */
import { Hono } from 'hono';
import type { Env, User } from '../lib/types';
import { userForApiKey } from '../lib/apikeys';
import { planFor, playUsage } from '../lib/billing';
import { now } from '../lib/util';

type Vars = { user: User };

interface LibraryVideo {
  id: string;
  slug: string;
  title: string;
  source_type: string;
  thumbnail_url: string;
  visibility: string;
  duration: number;
  created_at: number;
}

interface LibraryPlaylist {
  id: string;
  slug: string;
  title: string;
  visibility: string;
  layout: string;
  created_at: number;
  item_count: number;
}

interface InsightTotals {
  videos: number;
  impressions: number;
  plays: number;
  completions: number;
  cta_clicks: number;
  leads: number;
}

interface DailyPlays {
  day: string;
  plays: number;
}

interface TopVideo {
  id: string;
  slug: string;
  title: string;
  thumbnail_url: string;
  plays: number;
  completions: number;
}

interface PluginLead {
  email: string;
  name: string;
  phone: string;
  position: number;
  created_at: number;
  video_title: string;
}

export const plugin = new Hono<{ Bindings: Env; Variables: Vars }>();

function bearer(header: string | undefined): string {
  if (!header) return '';
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match ? match[1].trim() : header.trim();
}

/* A plugin can also call this from the browser (the block editor preview), so
   the key-authenticated endpoints answer preflight and allow any origin: the
   key is the credential, cookies are never used. */
plugin.options('*', (c) =>
  c.body(null, 204, {
    'access-control-allow-origin': '*',
    'access-control-allow-headers': 'authorization, content-type',
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-max-age': '86400',
  }),
);

plugin.use('*', async (c, next) => {
  const key = bearer(c.req.header('authorization')) || (c.req.query('api_key') ?? '');
  const user = key ? await userForApiKey(c.env, key) : null;
  if (!user) return c.json({ error: 'invalid or revoked API key' }, 401);
  c.set('user', user);
  await next();
  c.header('access-control-allow-origin', '*');
});

/** Used by the plugin's "Connect" button to prove the key works. */
plugin.get('/account', async (c) => {
  const user = c.get('user');
  const plan = planFor(user);
  const usage = await playUsage(c.env, user);
  return c.json({
    account: { email: user.email, name: user.name, plan: user.plan, plan_name: plan.name },
    usage: { plays: usage.plays, allowance: usage.allowance, blocked: usage.blocked },
    /* The origin the key was presented to, so an integration echoes back the
       host it is actually talking to rather than a configured default. */
    base_url: new URL(c.req.url).origin,
  });
});

plugin.get('/videos', async (c) => {
  const search = (c.req.query('search') ?? '').trim().toLowerCase();
  const { results } = await c.env.DB.prepare(
    `SELECT id, slug, title, source_type, thumbnail_url, visibility, duration, created_at
       FROM videos WHERE user_id = ? ORDER BY created_at DESC`,
  )
    .bind(c.get('user').id)
    .all<LibraryVideo>();
  const videos = (results ?? []).filter(
    (video) => !search || video.title.toLowerCase().includes(search) || video.slug.includes(search),
  );
  return c.json({ videos, base_url: c.env.PUBLIC_BASE_URL });
});

/**
 * Everything the plugin's Insights screen draws: lifetime totals, the last 30
 * days of plays, the account's best videos and its play allowance. Kept as one
 * response so WordPress makes a single cached request per page load.
 */
plugin.get('/insights', async (c) => {
  const user = c.get('user');
  const plan = planFor(user);
  const usage = await playUsage(c.env, user);
  const totals = await c.env.DB.prepare(
    `SELECT
       (SELECT COUNT(*) FROM videos WHERE user_id = ?) AS videos,
       (SELECT COUNT(*) FROM events e JOIN videos v ON v.id = e.video_id
          WHERE v.user_id = ? AND e.kind = 'load') AS impressions,
       (SELECT COUNT(*) FROM events e JOIN videos v ON v.id = e.video_id
          WHERE v.user_id = ? AND e.kind = 'play') AS plays,
       (SELECT COUNT(*) FROM events e JOIN videos v ON v.id = e.video_id
          WHERE v.user_id = ? AND e.kind = 'complete') AS completions,
       (SELECT COUNT(*) FROM events e JOIN videos v ON v.id = e.video_id
          WHERE v.user_id = ? AND e.kind = 'cta_click') AS cta_clicks,
       (SELECT COUNT(*) FROM leads WHERE user_id = ?) AS leads`,
  )
    .bind(user.id, user.id, user.id, user.id, user.id, user.id)
    .first<InsightTotals>();
  const daily = await c.env.DB.prepare(
    `SELECT date(e.created_at, 'unixepoch') AS day, COUNT(*) AS plays
       FROM events e JOIN videos v ON v.id = e.video_id
      WHERE v.user_id = ? AND e.kind = 'play' AND e.created_at >= ?
      GROUP BY day ORDER BY day`,
  )
    .bind(user.id, now() - 30 * 86400)
    .all<DailyPlays>();
  const top = await c.env.DB.prepare(
    `SELECT v.id, v.slug, v.title, v.thumbnail_url,
            SUM(CASE WHEN e.kind = 'play' THEN 1 ELSE 0 END) AS plays,
            SUM(CASE WHEN e.kind = 'complete' THEN 1 ELSE 0 END) AS completions
       FROM videos v LEFT JOIN events e ON e.video_id = v.id
      WHERE v.user_id = ?
      GROUP BY v.id ORDER BY plays DESC, v.created_at DESC LIMIT 10`,
  )
    .bind(user.id)
    .all<TopVideo>();
  return c.json({
    account: { email: user.email, plan: user.plan, plan_name: plan.name },
    usage: { plays: usage.plays, allowance: usage.allowance, blocked: usage.blocked },
    totals: totals ?? null,
    daily: daily.results ?? [],
    top: top.results ?? [],
  });
});

/** Form submissions, so a site owner sees their leads without leaving WordPress. */
plugin.get('/leads', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT l.email, l.name, l.phone, l.position, l.created_at, v.title AS video_title
       FROM leads l JOIN videos v ON v.id = l.video_id
      WHERE l.user_id = ? ORDER BY l.created_at DESC LIMIT 100`,
  )
    .bind(c.get('user').id)
    .all<PluginLead>();
  return c.json({ leads: results ?? [] });
});

plugin.get('/playlists', async (c) => {
  const { results } = await c.env.DB.prepare(
    `SELECT p.id, p.slug, p.title, p.visibility, p.layout, p.created_at,
            (SELECT COUNT(*) FROM playlist_items i WHERE i.playlist_id = p.id) AS item_count
       FROM playlists p WHERE p.user_id = ? ORDER BY p.created_at DESC`,
  )
    .bind(c.get('user').id)
    .all<LibraryPlaylist>();
  return c.json({ playlists: results ?? [], base_url: c.env.PUBLIC_BASE_URL });
});
