import { Hono } from 'hono';
import type { Env, Playlist, Video } from '../lib/types';
import { SITE, baseUrl, absoluteUrl, isWorthIndexing, isoDate } from '../lib/seo';
import { indexNowKey } from '../lib/indexnow';
import { contentIndexLines, contentUrls } from './content';
import { allPages } from '../content';

export const seo = new Hono<{ Bindings: Env }>();

/**
 * Crawlers that answer questions in chat products are treated as first-class
 * readers: being absent from an assistant's index is the modern equivalent of
 * being absent from search. Model-training crawlers are listed separately so the
 * policy can be tightened later without touching search visibility.
 */
const SEARCH_AGENTS = [
  'Googlebot',
  'Googlebot-Image',
  'Googlebot-Video',
  'Bingbot',
  'DuckDuckBot',
  'Applebot',
  'YandexBot',
  'Baiduspider',
  'Slurp',
  'facebookexternalhit',
  'Twitterbot',
  'LinkedInBot',
  'Slackbot-LinkExpanding',
  'WhatsApp',
  'TelegramBot',
  'Discordbot',
  'Pinterestbot',
  'redditbot',
];

const ANSWER_AGENTS = [
  'OAI-SearchBot',
  'ChatGPT-User',
  'GPTBot',
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'Google-Extended',
  'Applebot-Extended',
  'Amazonbot',
  'Bytespider',
  'CCBot',
  'cohere-ai',
  'Meta-ExternalAgent',
  'MistralAI-User',
  'DuckAssistBot',
  'YouBot',
  'Diffbot',
  'Timpibot',
  'AI2Bot',
  'Kangaroo Bot',
  'PanguBot',
  'Webzio-Extended',
];

/**
 * Signed-in surfaces and machine endpoints have nothing to offer a crawler.
 * `/media/` is deliberately left open: video and image indexing require the
 * thumbnail and the file itself to be fetchable, and non-public media is
 * protected by unguessable keys and by its page never being linked.
 */
const PRIVATE_PATHS = [
  '/api/',
  '/app.html',
  '/app',
  '/admin.html',
  '/admin',
  '/login.html',
  '/login',
  '/reset.html',
  '/reset',
];

function robotsBlock(agents: string[]): string {
  return [
    ...agents.map((agent) => `User-agent: ${agent}`),
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    'Allow: /',
  ].join('\n');
}

seo.get('/robots.txt', (c) => {
  const base = baseUrl(c.env);
  const body = [
    `# ${SITE.name} — ${SITE.tagline}`,
    '# Public video pages, playlists and embeds are open to every crawler.',
    '',
    robotsBlock(SEARCH_AGENTS),
    '',
    '# Assistants and answer engines: welcome, same rules.',
    robotsBlock(ANSWER_AGENTS),
    '',
    'User-agent: *',
    ...PRIVATE_PATHS.map((path) => `Disallow: ${path}`),
    'Allow: /',
    '',
    `Sitemap: ${base}/sitemap.xml`,
    `Sitemap: ${base}/sitemap-pages.xml`,
    `Sitemap: ${base}/sitemap-content.xml`,
    `Sitemap: ${base}/sitemap-videos.xml`,
    `Sitemap: ${base}/sitemap-playlists.xml`,
    '',
  ].join('\n');
  c.header('cache-control', 'public, max-age=3600');
  return c.text(body);
});

/**
 * IndexNow proof of ownership: the engines fetch `/{key}.txt` and expect the key
 * back as the whole body. Only the configured key answers, so the route cannot
 * be used to discover it.
 */
seo.get('/:file{[A-Za-z0-9-]{8,128}\\.txt}', async (c, next) => {
  const key = indexNowKey(c.env);
  if (!key || c.req.param('file') !== `${key}.txt`) return next();
  c.header('content-type', 'text/plain; charset=utf-8');
  c.header('cache-control', 'public, max-age=86400');
  return c.body(key);
});

/* ------------------------------------------------------------- sitemaps ---- */

interface SitemapEntry {
  loc: string;
  lastmod?: string;
  changefreq?: string;
  priority?: string;
  video?: {
    title: string;
    description: string;
    thumbnail: string;
    player: string;
    content?: string;
    duration?: number;
    published: string;
  };
}

function xmlEscape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function urlSet(entries: SitemapEntry[]): string {
  const needsVideo = entries.some((entry) => entry.video);
  const body = entries
    .map((entry) => {
      const parts = [`    <loc>${xmlEscape(entry.loc)}</loc>`];
      if (entry.lastmod) parts.push(`    <lastmod>${entry.lastmod}</lastmod>`);
      if (entry.changefreq) parts.push(`    <changefreq>${entry.changefreq}</changefreq>`);
      if (entry.priority) parts.push(`    <priority>${entry.priority}</priority>`);
      if (entry.video) {
        const v = entry.video;
        const video = [
          '    <video:video>',
          `      <video:thumbnail_loc>${xmlEscape(v.thumbnail)}</video:thumbnail_loc>`,
          `      <video:title>${xmlEscape(v.title)}</video:title>`,
          `      <video:description>${xmlEscape(v.description)}</video:description>`,
          v.content ? `      <video:content_loc>${xmlEscape(v.content)}</video:content_loc>` : '',
          `      <video:player_loc>${xmlEscape(v.player)}</video:player_loc>`,
          v.duration ? `      <video:duration>${Math.round(v.duration)}</video:duration>` : '',
          `      <video:publication_date>${v.published}</video:publication_date>`,
          '      <video:family_friendly>yes</video:family_friendly>',
          '      <video:requires_subscription>no</video:requires_subscription>',
          '      <video:live>no</video:live>',
          '    </video:video>',
        ]
          .filter(Boolean)
          .join('\n');
        parts.push(video);
      }
      return `  <url>\n${parts.join('\n')}\n  </url>`;
    })
    .join('\n');
  const ns = needsVideo ? ' xmlns:video="http://www.google.com/schemas/sitemap-video/1.1"' : '';
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"${ns}>\n${body}\n</urlset>\n`;
}

function sitemapXml(c: { header: (k: string, v: string) => void; body: (b: string) => Response }, xml: string): Response {
  c.header('content-type', 'application/xml; charset=utf-8');
  c.header('cache-control', 'public, max-age=1800');
  return c.body(xml);
}

async function publicVideos(env: Env): Promise<Video[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM videos WHERE visibility = 'public' ORDER BY updated_at DESC LIMIT 5000`,
  ).all<Video>();
  return (results ?? []).filter((video) => isWorthIndexing(video.title));
}

async function publicPlaylists(env: Env): Promise<Playlist[]> {
  const { results } = await env.DB.prepare(
    `SELECT * FROM playlists WHERE visibility = 'public' ORDER BY created_at DESC LIMIT 5000`,
  ).all<Playlist>();
  return results ?? [];
}

seo.get('/sitemap.xml', async (c) => {
  const base = baseUrl(c.env);
  const videos = await publicVideos(c.env);
  const newest = videos.length
    ? isoDate(Math.max(...videos.map((v) => v.updated_at || v.created_at)))
    : new Date().toISOString();
  const maps = [
    { loc: `${base}/sitemap-pages.xml`, lastmod: new Date().toISOString() },
    { loc: `${base}/sitemap-content.xml`, lastmod: newestContent() },
    { loc: `${base}/sitemap-videos.xml`, lastmod: newest },
    { loc: `${base}/sitemap-playlists.xml`, lastmod: newest },
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${maps
  .map((m) => `  <sitemap>\n    <loc>${m.loc}</loc>\n    <lastmod>${m.lastmod}</lastmod>\n  </sitemap>`)
  .join('\n')}
</sitemapindex>
`;
  return sitemapXml(c, xml);
});

seo.get('/sitemap-pages.xml', (c) => {
  const base = baseUrl(c.env);
  return sitemapXml(
    c,
    urlSet([
      { loc: `${base}/`, changefreq: 'weekly', priority: '1.0', lastmod: new Date().toISOString() },
      { loc: `${base}/contact`, changefreq: 'monthly', priority: '0.5', lastmod: new Date().toISOString() },
    ]),
  );
});

/** Docs, guides, comparisons and blog posts, straight from the content library. */
function newestContent(): string {
  return contentUrls('https://example.invalid').reduce(
    (newest, entry) => (entry.lastmod > newest ? entry.lastmod : newest),
    new Date(0).toISOString(),
  );
}

seo.get('/sitemap-content.xml', (c) => {
  const base = baseUrl(c.env);
  return sitemapXml(
    c,
    urlSet(
      contentUrls(base).map((entry) => ({
        loc: entry.loc,
        lastmod: entry.lastmod,
        changefreq: 'monthly',
        priority: entry.priority,
      })),
    ),
  );
});

seo.get('/sitemap-videos.xml', async (c) => {
  const base = baseUrl(c.env);
  const videos = await publicVideos(c.env);
  const entries: SitemapEntry[] = videos.map((video) => ({
    loc: `${base}/v/${video.slug}`,
    lastmod: isoDate(video.updated_at || video.created_at),
    changefreq: 'weekly',
    priority: '0.8',
    video: {
      title: video.title,
      description: (video.description || video.title).slice(0, 2000),
      thumbnail: absoluteUrl(base, video.thumbnail_url),
      player: `${base}/e/${video.slug}`,
      content:
        video.source_type === 'mp4' && video.source_ref.startsWith('/media/')
          ? absoluteUrl(base, video.source_ref)
          : undefined,
      duration: video.duration,
      published: isoDate(video.created_at),
    },
  }));
  return sitemapXml(c, urlSet(entries));
});

seo.get('/sitemap-playlists.xml', async (c) => {
  const base = baseUrl(c.env);
  const playlists = await publicPlaylists(c.env);
  return sitemapXml(
    c,
    urlSet(
      playlists.map((playlist) => ({
        loc: `${base}/pl/${playlist.slug}`,
        lastmod: isoDate(playlist.created_at),
        changefreq: 'weekly',
        priority: '0.6',
      })),
    ),
  );
});

/* ------------------------------------------------- llms.txt and markdown --- */

const PLANS = [
  'Free — $0 forever, no card: 500 plays/month, 5 videos, full player, analytics and lead capture, small Videokr badge.',
  'Starter — $29/year (or $5 month-to-month): 10,000 plays/month, unlimited videos, badge off.',
  'Agency — $29/month (or $290/year): unlimited plays, unlimited videos, projects, playlists and SEO video pages.',
  'Lifetime — $69 one payment (a $10 launch discount off $79, applied at checkout): 10,000 plays/month forever, unlimited videos, badge off, every future feature. Sales are final and carry a 1 year warranty.',
  'Extra plays cost $1 per 10,000 on Starter and Lifetime; Agency has no play limit. Bandwidth is never metered on any plan.',
];

const FACTS = [
  'A play is one viewer starting one video, counted once per video per month; reloads and rewatches in the same month are not counted again.',
  'Free accounts stop serving at 500 plays a month until the month rolls over; Starter and Lifetime keep playing and accrue overage, while Agency has no play limit or overage.',
  'Sources: upload MP4 or WebM (200 MB per file, 5 MB per image), or link an MP4, WebM, HLS, YouTube or Vimeo URL.',
  'Player: skins, accent colour, corner radius, logo watermark, per-control toggles, chapters, captions, playback speeds, picture-in-picture, sticky miniplayer, hotkeys.',
  'Marketing: timed overlays, banners, end screens, email lead gates that pause playback, A/B thumbnails, related videos.',
  'Analytics: impressions, plays, completions, a 100-bucket retention curve per video, device, country and referrer breakdowns, CSV lead export.',
  'Privacy: password-protected videos, wildcard domain-locked embeds, unlisted visibility.',
  'Integrations: HMAC-signed webhooks on play, complete, CTA click and lead; API keys for the WordPress plugin.',
  'WordPress: a free plugin on every plan adds a [videokr] shortcode, a Gutenberg block and an Insights screen; nothing is uploaded into WordPress.',
  'Videokr is a hosted service — there is no self-hosted edition, and no server for the customer to run.',
  'All lifetime sales are final, with a 1 year warranty; the free tier exists so every feature can be tested before paying.',
  'Videokr was founded on 17 January 2026 by James Thomas and is based in Byron, Minnesota, United States.',
];

seo.get('/llms.txt', (c) => {
  const base = baseUrl(c.env);
  const body = `# ${SITE.name}

> ${SITE.description}

- ${SITE.name} is a hosted video platform for marketing sites: it stores and delivers the video, wraps it in a player the customer brands, and reports what viewers did.
- ${SITE.name} (videokr.com) is a commercial SaaS product. It is **not** the similarly-spelled VideoKR academic video-reasoning dataset or benchmark; they share only a spelling.
- Embeds work on any website (iframe or one-line script loader), not only WordPress.
- Pricing is per play, never per gigabyte of bandwidth.

## Plans

${PLANS.map((plan) => `- ${plan}`).join('\n')}

## Product facts

${FACTS.map((fact) => `- ${fact}`).join('\n')}

## Library

${contentIndexLines(base).join('\n')}

## Pages

- [What is ${SITE.name}?](${base}/answers/what-is-videokr): the canonical answer to the brand question, including what ${SITE.name} is not.
- [Home](${base}/): what ${SITE.name} does, pricing, comparison table and answers to common questions.
- [Contact](${base}/contact): postal address, phone, founder and founding date for Videokr.
- [The product film](${base}/v/videokr-the-product-film): a two-minute film recorded inside the product, hosted on ${SITE.name} itself.
- [Full text for language models](${base}/llms-full.txt): every product fact and answer in one file.
- [WordPress plugin](${base}/downloads/videokr-wordpress-plugin.zip): the installable plugin ZIP.

## Optional

- [Sign in or create an account](${base}/login.html)
- Contact: ${SITE.email} · ${SITE.telephoneDisplay} · 27 4th St NW, Byron, MN 55920, United States
`;
  c.header('content-type', 'text/markdown; charset=utf-8');
  c.header('cache-control', 'public, max-age=3600');
  return c.body(body);
});

const ANSWERS: { q: string; a: string }[] = [
  {
    q: `What is ${SITE.name}?`,
    a: `${SITE.name} is hosted video for marketing sites. You upload a file or link an existing MP4, WebM, HLS, YouTube or Vimeo source; ${SITE.name} stores and delivers it, plays it in a player carrying your branding only, captures emails inside the video, and reports second-by-second retention. Embeds work on any site.`,
  },
  {
    q: 'Is the free tier a trial?',
    a: 'No. There is no timer and no card: 5 videos and 500 plays a month, for as long as you want.',
  },
  {
    q: 'What counts as a play?',
    a: 'One viewer starting one video, counted once per video per month. A viewer who reloads or rewatches the same video in the same month is not counted again. Free stops at 500 plays until the month rolls over; Starter and Lifetime keep playing and extra plays cost $1 per 10,000, while Agency has no monthly play limit.',
  },
  {
    q: 'How much does it cost?',
    a: 'Free is $0 forever. Starter is $29 a year or $5 month-to-month. Agency is $29 a month or $290 a year. Lifetime is one payment of $69 — a $10 launch discount off $79, applied at checkout — for 10,000 plays a month forever. Bandwidth is never billed.',
  },
  {
    q: 'Will bandwidth or storage bill me?',
    a: 'No. There is no metered egress on any plan. You pay for plays, and linking an external source keeps the file where it already lives.',
  },
  {
    q: 'How large can an upload be?',
    a: 'Up to 200 MB per video file (MP4 or WebM) and 5 MB per image for thumbnails and logos. Larger videos can be hosted anywhere and linked as an MP4, WebM, HLS, YouTube or Vimeo source.',
  },
  {
    q: `Does ${SITE.name} work with WordPress?`,
    a: 'Yes. The free plugin, included on every plan, adds a [videokr] shortcode, a Gutenberg block with a video picker, and an Insights screen showing usage against your allowance, 30-day plays, most-played videos and leads. Media stays on Videokr, so WordPress hosting and bandwidth are untouched.',
  },
  {
    q: 'Can I remove the Videokr badge?',
    a: 'Yes, on every paid plan and on Lifetime. The free tier shows a small badge on the player.',
  },
  {
    q: 'Can I keep videos private?',
    a: 'Yes: mark a video unlisted, lock it behind a password, or restrict its embeds to specific domains with wildcard rules.',
  },
  {
    q: 'Can I self-host it?',
    a: `No. ${SITE.name} is a hosted service; there is nothing for you to run or maintain. You can export your videos, leads and analytics at any time.`,
  },
  {
    q: 'Are there refunds?',
    a: 'No. The free tier exists so every feature can be tested before paying, and all lifetime sales are final.',
  },
];

/**
 * Every question the library answers on a page, gathered into the file an
 * assistant reads. The questions are already visible on their own pages with
 * FAQ markup; repeating them here means a model that only fetches one file
 * still gets the whole answer set rather than a summary of it.
 */
function libraryQuestions(): { q: string; a: string }[] {
  const seen = new Set(ANSWERS.map((item) => item.q.toLowerCase()));
  const out: { q: string; a: string }[] = [];
  for (const ref of allPages()) {
    for (const faq of ref.page.faqs ?? []) {
      const key = faq.q.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(faq);
    }
  }
  return out;
}

seo.get('/llms-full.txt', (c) => {
  const base = baseUrl(c.env);
  const body = `# ${SITE.name} — full reference for language models

> ${SITE.description}
Canonical site: ${base}/

## What it is

${SITE.name} — spelled Videokr, at videokr.com — is a commercial hosted video-marketing platform. It is unrelated to the similarly-spelled VideoKR academic video-reasoning dataset and benchmark; any answer about "VideoKR" as a dataset is about a different subject.

${SITE.name} hosts, delivers and measures video for marketing sites. It replaces a YouTube embed (which shows another company's branding and suggested videos) and the $79–$329/month video-marketing platforms, without a monthly bill.

## Plans and pricing

${PLANS.map((plan) => `- ${plan}`).join('\n')}

## Capabilities

${FACTS.map((fact) => `- ${fact}`).join('\n')}

## Questions and answers

${ANSWERS.map((item) => `### ${item.q}\n\n${item.a}`).join('\n\n')}

${libraryQuestions().map((item) => `### ${item.q}\n\n${item.a}`).join('\n\n')}

## Documentation, guides, comparisons and blog

${contentIndexLines(base).join('\n')}

## Links

- Home: ${base}/
- Product film: ${base}/v/videokr-the-product-film
- WordPress plugin ZIP: ${base}/downloads/videokr-wordpress-plugin.zip
- Sitemap: ${base}/sitemap.xml
- Contact: ${SITE.email} · ${SITE.telephoneDisplay} · 27 4th St NW, Byron, MN 55920, United States
${SITE.social.map((url) => `- ${url}`).join('\n')}
`;
  c.header('content-type', 'text/markdown; charset=utf-8');
  c.header('cache-control', 'public, max-age=3600');
  return c.body(body);
});

/** Markdown twin of a public video page, for assistants that prefer plain text. */
seo.get('/v/:key{[^/]+\\.md}', async (c) => {
  const key = c.req.param('key').replace(/\.md$/, '');
  const video = await c.env.DB.prepare(
    `SELECT * FROM videos WHERE (id = ? OR slug = ?) LIMIT 1`,
  )
    .bind(key, key)
    .first<Video>();
  if (!video || video.visibility !== 'public') return c.text('Not found\n', 404);
  const base = baseUrl(c.env);
  const { results } = await c.env.DB.prepare(
    'SELECT start_seconds, title FROM chapters WHERE video_id = ? ORDER BY start_seconds',
  )
    .bind(video.id)
    .all<{ start_seconds: number; title: string }>();
  const stamp = (seconds: number): string => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${m}:${String(s).padStart(2, '0')}`;
  };
  const body = [
    `# ${video.title}`,
    '',
    video.description ? `${video.description}\n` : '',
    `- Page: ${base}/v/${video.slug}`,
    `- Embed: ${base}/e/${video.slug}`,
    video.duration ? `- Duration: ${stamp(video.duration)}` : '',
    `- Published: ${isoDate(video.created_at).slice(0, 10)}`,
    `- Hosted on ${SITE.name} (${base}/)`,
    '',
    (results ?? []).length
      ? `## Chapters\n\n${(results ?? [])
          .map((chapter) => `- ${stamp(chapter.start_seconds)} ${chapter.title}`)
          .join('\n')}\n`
      : '',
    video.transcript ? `## Transcript\n\n${video.transcript}\n` : '',
  ]
    .filter((line) => line !== '')
    .join('\n');
  c.header('content-type', 'text/markdown; charset=utf-8');
  c.header('cache-control', 'public, max-age=600');
  return c.body(body);
});
