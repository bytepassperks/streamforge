import type { Env, Playlist, Video } from './types';
import { baseUrl, isWorthIndexing, isoDate } from './seo';
import { contentUrls } from '../routes/content';

/**
 * IndexNow is one protocol with several front doors. api.indexnow.org fans a
 * submission out to every participating engine, and the engine-specific hosts
 * are kept as well: they cost one request each, and a single engine having a bad
 * day then cannot swallow the notification for the others.
 */
const ENDPOINTS = [
  'https://api.indexnow.org/indexnow',
  'https://www.bing.com/indexnow',
  'https://yandex.com/indexnow',
  'https://search.seznam.cz/indexnow',
  'https://searchadvisor.naver.com/indexnow',
];

/** One submission carries plenty for a site this size; the protocol allows 10k. */
const BATCH = 1000;

/**
 * The key is a shared secret only in the sense that it must be unguessable —
 * the protocol requires the same value to be served publicly at
 * `/{key}.txt`, which is how an engine proves the submitter owns the host.
 */
export function indexNowKey(env: Env): string | undefined {
  const key = (env.INDEXNOW_KEY || '').trim();
  return /^[A-Za-z0-9-]{8,128}$/.test(key) ? key : undefined;
}

export interface IndexTarget {
  loc: string;
  lastmod: string;
}

export interface SubmitResult {
  endpoint: string;
  status: number;
  ok: boolean;
}

export interface SubmitReport {
  submitted: string[];
  unchanged: number;
  results: SubmitResult[];
  reason?: string;
}

/** Every public URL worth telling an engine about, with the date it last moved. */
export async function siteTargets(env: Env): Promise<IndexTarget[]> {
  const base = baseUrl(env);
  const { results: videos } = await env.DB.prepare(
    `SELECT slug, title, created_at, updated_at FROM videos WHERE visibility = 'public' ORDER BY updated_at DESC LIMIT 5000`,
  ).all<Pick<Video, 'slug' | 'title' | 'created_at' | 'updated_at'>>();
  const { results: playlists } = await env.DB.prepare(
    `SELECT slug, created_at FROM playlists WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 5000`,
  ).all<Pick<Playlist, 'slug' | 'created_at'>>();
  return [
    { loc: `${base}/`, lastmod: contentLastmod(base) },
    ...contentUrls(base).map((entry) => ({ loc: entry.loc, lastmod: entry.lastmod })),
    ...(videos ?? [])
      .filter((video) => isWorthIndexing(video.title))
      .map((video) => ({
      loc: `${base}/v/${video.slug}`,
      lastmod: isoDate(video.updated_at || video.created_at),
    })),
    ...(playlists ?? []).map((playlist) => ({
      loc: `${base}/pl/${playlist.slug}`,
      lastmod: isoDate(playlist.created_at),
    })),
  ];
}

/** The home page changes whenever the content library around it does. */
function contentLastmod(base: string): string {
  return contentUrls(base).reduce(
    (newest, entry) => (entry.lastmod > newest ? entry.lastmod : newest),
    new Date(0).toISOString(),
  );
}

/**
 * Notifies the engines about the URLs whose `lastmod` moved since the last
 * notification. Resubmitting an unchanged URL is the one thing IndexNow asks
 * callers not to do, so what was sent is remembered per URL.
 */
export async function submitChanged(env: Env, targets: IndexTarget[]): Promise<SubmitReport> {
  const key = indexNowKey(env);
  if (!key) return { submitted: [], unchanged: 0, results: [], reason: 'no INDEXNOW_KEY configured' };
  if (!targets.length) return { submitted: [], unchanged: 0, results: [] };

  const { results } = await env.DB.prepare('SELECT url, lastmod FROM index_submissions').all<{
    url: string;
    lastmod: string;
  }>();
  const seen = new Map((results ?? []).map((row) => [row.url, row.lastmod]));
  const changed = targets.filter((target) => (seen.get(target.loc) ?? '') < target.lastmod);
  if (!changed.length) return { submitted: [], unchanged: targets.length, results: [] };

  const urls = changed.slice(0, BATCH).map((target) => target.loc);
  const report = await submitUrls(env, urls);
  if (report.results.some((result) => result.ok)) await remember(env, changed.slice(0, BATCH));
  return { ...report, unchanged: targets.length - changed.length };
}

/** Sends an explicit list, bypassing the change check — used by the admin action. */
export async function submitUrls(env: Env, urls: string[]): Promise<SubmitReport> {
  const key = indexNowKey(env);
  if (!key) return { submitted: [], unchanged: 0, results: [], reason: 'no INDEXNOW_KEY configured' };
  const host = new URL(baseUrl(env)).host;
  const body = JSON.stringify({ host, key, keyLocation: `${baseUrl(env)}/${key}.txt`, urlList: urls });
  const results = await Promise.all(
    ENDPOINTS.map(async (endpoint): Promise<SubmitResult> => {
      try {
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 'content-type': 'application/json; charset=utf-8' },
          body,
        });
        return { endpoint, status: response.status, ok: response.ok };
      } catch {
        return { endpoint, status: 0, ok: false };
      }
    }),
  );
  return { submitted: urls, unchanged: 0, results };
}

async function remember(env: Env, targets: IndexTarget[]): Promise<void> {
  const at = Math.floor(Date.now() / 1000);
  const statements = targets.map((target) =>
    env.DB.prepare(
      `INSERT INTO index_submissions (url, lastmod, submitted_at) VALUES (?, ?, ?)
         ON CONFLICT(url) DO UPDATE SET lastmod = excluded.lastmod, submitted_at = excluded.submitted_at`,
    ).bind(target.loc, target.lastmod, at),
  );
  await env.DB.batch(statements);
}

/**
 * Publishing hook: a single page that just appeared or changed, announced
 * immediately rather than waiting for the nightly sweep.
 */
export async function announce(env: Env, path: string): Promise<SubmitReport> {
  const loc = `${baseUrl(env)}${path.startsWith('/') ? '' : '/'}${path}`;
  return submitChanged(env, [{ loc, lastmod: new Date().toISOString() }]);
}
