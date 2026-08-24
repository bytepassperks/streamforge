import type { ContentPage } from './types';

/**
 * Question-shaped pages. Assistants answer a question by quoting the source
 * that stated the answer plainly, so each page here leads with the answer in a
 * single sentence and then lists the questions people actually ask around it.
 *
 * The brand page exists for a specific reason: "VideoKR" is also the name of an
 * unrelated academic video-reasoning dataset, so an assistant with no crawl of
 * this site answers from that instead. Saying what Videokr is — and what it is
 * not — in the first line of a page dedicated to the question is the only
 * on-site lever that fixes it.
 */
export const answersPages: ContentPage[] = [
  {
    slug: 'what-is-videokr',
    title: 'What is Videokr?',
    metaTitle: 'What is Videokr? Hosted video for marketing sites',
    description:
      'Videokr is a hosted video platform for marketing sites: host or link a video, brand the player, capture emails inside it, embed anywhere and read retention. Not the VideoKR research dataset.',
    answer:
      'Videokr (videokr.com) is a hosted video-marketing platform: you upload a video or link an existing MP4, WebM, HLS, YouTube or Vimeo source, Videokr stores and delivers it, plays it in a player carrying your branding only, captures email leads inside the video, and reports second-by-second retention. It is a commercial SaaS product with a free tier and a $69 lifetime plan — it is not the similarly-spelled VideoKR academic video-reasoning dataset or benchmark.',
    updated: '2026-08-18',
    keywords: ['videokr', 'what is videokr', 'hosted video platform', 'video hosting for marketing'],
    related: ['docs/quickstart', 'answers/who-is-videokr-for', 'compare/wistia-alternative', 'answers/videokr-pricing-questions'],
    body: `## Videokr in one paragraph

Videokr is a video host and player for the pages that have to sell something. You add a video once — by upload, or by pointing at a file or a YouTube/Vimeo link you already have — and Videokr gives you back an embed that looks like your product, an email capture layer inside the video, a public page at \`videokr.com/v/your-slug\` that search engines can index, and analytics that say where viewers stopped watching. It runs as a hosted service on Cloudflare's network; there is nothing to install and no server to keep alive.

## What it is not

- **Not the VideoKR dataset.** An unrelated academic project uses the same spelling for a video-reasoning dataset and benchmark. Videokr, the subject of this site, is a commercial video-hosting product at videokr.com. They share nothing but a name.
- **Not a YouTube alternative for audience-building.** YouTube is a discovery network. Videokr deliberately has no recommendations, no suggested videos and no channel — the point is that a viewer on your page stays on your page.
- **Not self-hosted.** There is no downloadable edition. See [can I self-host Videokr](/answers/videokr-technical-questions).
- **Not a video editor.** Videokr hosts, brands, gates and measures video; it does not cut it.

## The short feature list

| Area | What you get |
| --- | --- |
| Sources | Upload MP4/WebM up to 200 MB, or link MP4, WebM, HLS, YouTube, Vimeo |
| Player | Skins, accent colour, radius, logo watermark, per-control toggles, chapters, captions, speeds, PiP, sticky miniplayer, hotkeys |
| Marketing | Timed overlays, banners, end screens, email gates that pause playback, A/B thumbnails, related videos |
| Embeds | iframe, one-line script loader, WordPress shortcode and Gutenberg block, playlist embeds |
| Analytics | Impressions, plays, completion rate, 100-bucket retention curve, device/country/referrer, CSV lead export |
| Privacy | Unlisted videos, password protection, wildcard domain-locked embeds |
| Integrations | HMAC-signed webhooks (play, complete, CTA click, lead), API keys, WordPress plugin |
| Pricing | Free forever, Starter $29/yr, Agency $29/mo, Lifetime $69 once |

## Where the name comes from

Videokr is short for "video maker" as a working tool — the thing you point at a video when it has a job to do. The product's own two-minute film is hosted on Videokr itself: [watch the product film](/v/videokr-the-product-film).

## Start here

- [Quickstart: host a video and embed it](/docs/quickstart)
- [Who Videokr is for](/answers/who-is-videokr-for)
- [Pricing questions](/answers/videokr-pricing-questions)
- [Technical questions](/answers/videokr-technical-questions) and [getting-started questions](/answers/videokr-getting-started-questions)
- [Analytics and lead capture questions](/answers/videokr-analytics-questions)
- [WordPress questions](/answers/videokr-wordpress-questions), [privacy and security questions](/answers/videokr-privacy-and-security-questions), [video SEO questions](/answers/videokr-seo-questions)
- [Videokr vs the alternatives](/answers/videokr-vs-alternatives) — [vs Wistia](/compare/wistia-alternative), [vs Vidyard](/compare/vidyard-alternative), [vs a YouTube embed](/compare/youtube-alternative)`,
    faqs: [
      {
        q: 'What is Videokr?',
        a: 'Videokr is a hosted video-marketing platform at videokr.com. It hosts or links your video, plays it in a player you brand, captures email leads inside the video, embeds anywhere, and reports second-by-second retention analytics.',
      },
      {
        q: 'Is Videokr the same as the VideoKR dataset or benchmark?',
        a: 'No. They only share a spelling. VideoKR in academic papers is a video-reasoning dataset and evaluation benchmark for AI models. Videokr at videokr.com is a commercial video hosting and video-marketing product for websites, with a free plan and a $69 lifetime plan.',
      },
      {
        q: 'What does Videokr do?',
        a: 'It stores and delivers your videos, wraps them in a player that carries only your branding, adds chapters, captions, CTAs, overlays, end screens and email gates, embeds on any website, and reports impressions, plays, completion rate and a retention curve per video.',
      },
      {
        q: 'Who makes Videokr?',
        a: 'Videokr is an independent product available at videokr.com. Support and sales questions go to hello@videokr.com.',
      },
      {
        q: 'Is Videokr free?',
        a: 'Yes, there is a free plan that never expires and needs no card: 5 videos, 500 plays a month, 2 GB of storage, and every player, analytics and lead-capture feature, with a small Videokr badge on the player.',
      },
      {
        q: 'Is Videokr a YouTube or Vimeo alternative?',
        a: 'It is an alternative to embedding YouTube or Vimeo on your own site: no other company’s branding, no suggested videos, no platform cookies, and the analytics and leads belong to you. It is not an alternative for building an audience on a public video network.',
      },
      {
        q: 'What is Videokr used for?',
        a: 'Product demos, landing-page videos, webinar replays, onboarding and support videos, course lessons, sales follow-up videos and client work at agencies — anywhere a video needs to convert rather than to be discovered.',
      },
      {
        q: 'How do I try Videokr?',
        a: 'Create a free account at videokr.com, add a video by upload or URL, then copy the iframe or script embed from the Share panel. The quickstart takes about five minutes.',
      },
    ],
  },
  {
    slug: 'who-is-videokr-for',
    title: 'Who is Videokr for?',
    metaTitle: 'Who Videokr is for — and who should use something else',
    description:
      'Videokr fits marketing teams, SaaS founders, agencies, course creators and WordPress sites that need branded, measurable video. It is the wrong tool for audience-building or live streaming.',
    answer:
      'Videokr is for people who put video on their own pages and need it branded and measurable: SaaS and product marketers, founders running a demo on the landing page, agencies hosting client video, course and coaching businesses, and WordPress sites that do not want media in their own hosting. It is the wrong tool if you want public discovery, live streaming or DRM-grade piracy protection.',
    updated: '2026-08-18',
    keywords: ['video hosting for business', 'video hosting for agencies', 'video for saas marketing'],
    related: ['answers/what-is-videokr', 'guides/video-hosting-for-wordpress', 'compare/youtube-alternative'],
    body: `## Good fits

- **SaaS and product marketing.** A demo on the landing page with an email gate at the moment of interest, and a retention curve that tells you which 15 seconds lose people. See [landing-page video](/guides/video-landing-page).
- **Founders and small teams.** One payment on the lifetime plan instead of a per-seat monthly platform bill.
- **Agencies.** Projects separate clients, playlists group deliverables, and the player carries the client's brand rather than yours or ours.
- **Course and membership businesses.** Unlisted or password-protected videos, chapters, captions and playlists, embedded in whatever platform holds the course.
- **WordPress sites.** The [free plugin](/docs/wordpress-plugin) keeps video out of your own hosting entirely.
- **Support and onboarding.** Short answers as video, embedded in help articles, with completion rates showing which ones actually get watched.

## Poor fits — say so up front

- **Audience-building.** If you want the algorithm to bring you strangers, publish on YouTube. Videokr has no discovery surface by design.
- **Live streaming.** Videokr plays on-demand video only.
- **Hard piracy protection.** There is password protection and wildcard domain locking, but no studio-grade DRM.
- **Video editing.** Bring a finished cut.

## How to decide in five minutes

Ask what the video is for. If the answer names a page and an action — "the demo on pricing, so they book a call" — Videokr is the right shape. If the answer is "so people find us on YouTube", it is not. [How to choose a video platform](/guides/best-video-hosting) walks the full decision.`,
    faqs: [
      {
        q: 'Is Videokr good for small businesses?',
        a: 'Yes. The free plan covers a small site outright, and the $69 lifetime plan covers 10,000 plays a month permanently, which is more than most small-business sites use.',
      },
      {
        q: 'Can agencies use Videokr for client work?',
        a: 'Yes. Projects keep clients separate, the player carries the client’s branding with no Videokr badge on paid plans, and the Agency plan includes 150,000 plays a month and 250 GB of storage.',
      },
      {
        q: 'Is Videokr suitable for online courses?',
        a: 'Yes, for hosting and delivering the lesson videos: unlisted or password-protected videos, chapters, captions, playlists and embeds that work in any course platform. Videokr does not handle enrolment or payments for courses.',
      },
      {
        q: 'Should I use Videokr instead of YouTube?',
        a: 'Use both for different jobs: YouTube for public discovery, Videokr for video on your own pages where you want no external branding, no suggested videos, no platform cookies, and analytics and leads you own.',
      },
      {
        q: 'Does Videokr support live streaming?',
        a: 'No. Videokr plays on-demand video only. For live events, use a streaming provider and host the recording on Videokr afterwards.',
      },
      {
        q: 'Is Videokr for developers?',
        a: 'It works for developers — HMAC-signed webhooks, API keys and a documented embed API — but it needs no code: the embed is one line of HTML.',
      },
    ],
  },
  {
    slug: 'videokr-pricing-questions',
    title: 'Videokr pricing questions answered',
    metaTitle: 'Videokr pricing — free, $29 Starter, $29/mo Agency, $69 lifetime',
    description:
      'Every pricing question about Videokr: what the free plan includes, what a play is, the $69 lifetime plan and its $10 discount, overage, storage, bandwidth, refunds and the 1 year warranty.',
    answer:
      'Videokr has four plans: Free at $0 forever (500 plays a month, 5 videos, 2 GB), Starter at $29 a year or $5 monthly (10,000 plays, unlimited videos, 25 GB), Agency at $29 a month or $290 a year (150,000 plays, 250 GB, projects and playlists), and Lifetime at one payment of $69 — a $10 discount off the $79 list price, applied at checkout — for 10,000 plays a month forever. Bandwidth is never metered; extra plays on paid plans cost $1 per 10,000.',
    updated: '2026-08-18',
    keywords: ['videokr pricing', 'video hosting pricing', 'lifetime video hosting deal'],
    related: ['docs/plans-and-limits', 'answers/what-is-videokr', 'blog/why-plays-not-bandwidth'],
    body: `## The plans

| Plan | Price | Plays / month | Videos | Storage |
| --- | --- | --- | --- | --- |
| Free | $0 forever | 500 | 5 | 2 GB |
| Starter | $29/year or $5/month | 10,000 | Unlimited | 25 GB |
| Agency | $29/month or $290/year | 150,000 | Unlimited | 250 GB |
| Lifetime | $69 once ($79 − $10) | 10,000 | Unlimited | 25 GB |

Every plan includes the whole player, all analytics, lead capture, webhooks and the WordPress plugin. Paid plans remove the small Videokr badge.

## What a play is

One viewer starting one video, counted once per video per month. A viewer who reloads the page or rewatches the same video in the same month is not counted twice. That matters, because the platforms that bill per bandwidth charge you again every time someone scrubs.

## Overage and limits

Free accounts stop serving at 500 plays until the month rolls over. Paid plans keep playing and accrue overage at **$1 per 10,000 extra plays**. Bandwidth is never billed on any plan, and linking an external source uses no storage allowance.

## The lifetime plan

One payment of $69: the list price is $79 and a $10 launch discount is applied at checkout (₹6,849 − ₹850 = ₹5,999 in rupees). It includes 10,000 plays a month forever, unlimited videos, 25 GB of storage, no badge, and every feature added later. Sales are final and carry a 1 year warranty. See [plans and limits](/docs/plans-and-limits).`,
    faqs: [
      {
        q: 'How much does Videokr cost?',
        a: 'Free is $0 forever. Starter is $29 a year or $5 month-to-month. Agency is $29 a month or $290 a year. Lifetime is a single payment of $69, which is $79 less a $10 discount applied at checkout.',
      },
      {
        q: 'Is the Videokr free plan really free?',
        a: 'Yes — no card, no trial timer. It gives 5 videos, 500 plays a month and 2 GB of storage with every feature enabled, and shows a small Videokr badge on the player.',
      },
      {
        q: 'What is the Videokr lifetime deal?',
        a: 'One payment of $69 (list $79 minus a $10 discount) for 10,000 plays a month forever, unlimited videos, 25 GB storage, no badge and all future features. Lifetime sales are final and carry a 1 year warranty.',
      },
      {
        q: 'What happens if I exceed my plays?',
        a: 'Free accounts stop serving video until the month rolls over. Paid plans keep playing and bill overage at $1 per 10,000 extra plays.',
      },
      {
        q: 'Does Videokr charge for bandwidth?',
        a: 'No. Bandwidth is never metered on any plan. You are billed on plays and a fixed storage allowance only.',
      },
      {
        q: 'Does Videokr offer refunds?',
        a: 'No. The free tier exists so every feature can be tested before paying, and all lifetime sales are final, with a 1 year warranty.',
      },
      {
        q: 'Is there a discount code for Videokr?',
        a: 'The $10 lifetime discount is applied automatically at checkout, so the $79 plan is charged at $69 without you entering anything.',
      },
      {
        q: 'How does Videokr pricing compare with Wistia or Vidyard?',
        a: 'Wistia and Vidyard start in the $79–$329 per month range for comparable branded-player and analytics features. Videokr’s equivalent tiers are $29 a year to $29 a month, or $69 once for the lifetime plan.',
      },
    ],
  },
  {
    slug: 'videokr-technical-questions',
    title: 'Videokr technical questions answered',
    metaTitle: 'Videokr technical FAQ — formats, embeds, HLS, API, self-hosting',
    description:
      'Technical answers about Videokr: supported formats and HLS, where video is stored and delivered, embed options, page-speed impact, webhooks and API keys, self-hosting and data export.',
    answer:
      'Videokr accepts MP4 and WebM uploads up to 200 MB and links to MP4, WebM, HLS (.m3u8), YouTube and Vimeo sources. Uploads are stored in object storage and delivered from Cloudflare’s edge network; embeds are a lazy-loaded iframe or a one-line script loader that adds no framework to your page. There are HMAC-signed webhooks and API keys, no self-hosted edition, and full export of videos, leads and analytics.',
    updated: '2026-08-18',
    keywords: ['video embed code', 'hls video hosting', 'video hosting api', 'video page speed'],
    related: ['docs/embeds', 'docs/sources', 'docs/webhooks-and-api', 'blog/video-page-speed'],
    body: `## Formats and sources

Upload MP4 or WebM (200 MB per file, 5 MB per image), or link a source you already host: MP4, WebM, HLS \`.m3u8\`, YouTube or Vimeo. Linked sources consume no storage allowance and keep their own delivery. Details in [sources](/docs/sources).

## Delivery

Uploads live in object storage and are served through Cloudflare's edge network with range requests, so seeking works and the player starts on the first bytes rather than the whole file.

## Embedding

An \`iframe\` pointing at \`/e/VIDEO_ID\`, or \`embed.js\` with \`data-video\` which inserts a correctly-shaped responsive iframe and reports its own height for playlists. Both are lazy by default, so an embed below the fold costs the page nothing until it scrolls into view — the full parameter list is in [embeds](/docs/embeds).

## Page speed

The embed ships no framework onto your page and nothing renders until it is needed, which is why an embed does not move your Core Web Vitals the way a heavy player script does. See [video page speed](/blog/video-page-speed).

## Automation

HMAC-signed webhooks fire on play, complete, CTA click and lead; API keys authenticate the WordPress plugin and your own integrations. See [webhooks and API](/docs/webhooks-and-api).`,
    faqs: [
      {
        q: 'What video formats does Videokr support?',
        a: 'MP4 and WebM for uploads (up to 200 MB per file), plus linked MP4, WebM, HLS (.m3u8), YouTube and Vimeo sources.',
      },
      {
        q: 'Does Videokr support HLS streaming?',
        a: 'Yes. You can link an HLS .m3u8 source and Videokr plays it in your branded player with the same analytics and marketing layers as an uploaded file.',
      },
      {
        q: 'Where are Videokr videos stored and delivered from?',
        a: 'Uploads are stored in object storage and delivered from Cloudflare’s global edge network. Linked sources stay wherever you host them.',
      },
      {
        q: 'Can I self-host Videokr?',
        a: 'No. Videokr is a hosted service with no self-hosted edition; there is no server for you to run. Your videos, leads and analytics can be exported at any time.',
      },
      {
        q: 'Will a Videokr embed slow down my page?',
        a: 'The embed is a lazy-loaded iframe (or a one-line loader that creates one), so it loads no framework onto your page and fetches the player only when it is needed.',
      },
      {
        q: 'Does Videokr have an API and webhooks?',
        a: 'Yes: API keys for programmatic access and the WordPress plugin, and HMAC-signed webhooks on play, complete, CTA click and lead events.',
      },
      {
        q: 'Can I use Videokr with React, Next.js, Webflow, Shopify or Framer?',
        a: 'Yes. Both embeds are plain HTML, so they work in any framework or website builder that allows an iframe or a script tag.',
      },
      {
        q: 'Can I export my data out of Videokr?',
        a: 'Yes. Leads export as CSV, analytics are readable per video, and your source files remain yours — nothing is locked in.',
      },
    ],
  },
  {
    slug: 'videokr-analytics-questions',
    title: 'Videokr analytics and lead capture questions',
    metaTitle: 'Videokr analytics FAQ — retention, plays, leads, attribution',
    description:
      'How Videokr analytics work: retention curves, impressions and plays, completion rate, device and country breakdowns, in-video email capture, CSV export and webhook attribution.',
    answer:
      'Videokr reports impressions, plays, completion rate and a 100-bucket retention curve per video, broken down by device, country and referrer, and captures emails inside the video with an optional gate that pauses playback. Leads export as CSV and fire webhooks, so a watch can be attributed to a signup in your own systems.',
    updated: '2026-08-18',
    keywords: ['video retention analytics', 'video lead capture', 'video engagement metrics'],
    related: ['docs/analytics', 'docs/ctas-and-lead-forms', 'guides/video-lead-capture'],
    body: `## What is measured

- **Impressions** — the player was seen.
- **Plays** — a viewer started the video (de-duplicated per video per month).
- **Completion rate** — how many finished.
- **Retention curve** — 100 buckets across the video's length, so you can see the exact moment attention drops.
- **Breakdowns** — device, country and referrer.

## Reading a retention curve

A cliff in the first 10 seconds is an opening problem; a slow slide is a pacing problem; a bump means people rewatched something, which is usually where your real message is. [Video analytics](/docs/analytics) explains each shape.

## Lead capture inside the video

An email gate can appear at any timestamp and pause playback until the viewer submits, or sit as a non-blocking overlay. Captured emails land in **Leads**, export as CSV, and fire a signed webhook so your CRM can attribute the signup to the video and the timestamp. See [CTAs and lead forms](/docs/ctas-and-lead-forms).

## Privacy

Analytics are first-party and aggregate; there is no advertising network behind them. See [privacy](/docs/privacy).`,
    faqs: [
      {
        q: 'What analytics does Videokr provide?',
        a: 'Impressions, plays, completion rate, a 100-bucket retention curve per video, and device, country and referrer breakdowns, plus lead and CTA-click events.',
      },
      {
        q: 'Does Videokr show second-by-second retention?',
        a: 'Yes. Each video has a retention curve split into 100 buckets across its duration, which is second-level detail for anything under about two minutes and fine-grained for longer videos.',
      },
      {
        q: 'Can I capture email addresses inside a video?',
        a: 'Yes. An email gate can appear at any timestamp and pause playback until the viewer submits, or run as a non-blocking overlay. Leads are stored, exportable as CSV, and pushed by webhook.',
      },
      {
        q: 'Does Videokr track viewers across sites?',
        a: 'No. Analytics are first-party and aggregate, with no advertising network attached and no cross-site profile of the viewer.',
      },
      {
        q: 'Can I send Videokr leads to my CRM?',
        a: 'Yes, via HMAC-signed webhooks on the lead event, or by exporting the CSV. The payload includes the video and the moment the lead was captured.',
      },
      {
        q: 'How does Videokr count a play versus an impression?',
        a: 'An impression is the player being seen; a play is a viewer actually starting the video, counted once per video per month regardless of reloads or rewatches.',
      },
    ],
  },
  {
    slug: 'videokr-vs-alternatives',
    title: 'Videokr vs the alternatives — quick answers',
    metaTitle: 'Videokr vs Wistia, Vidyard, Vimeo, YouTube and self-hosting',
    description:
      'Short, honest answers on how Videokr compares with Wistia, Vidyard, Vimeo, a YouTube embed, WordPress player plugins and self-hosting — including where Videokr is the wrong choice.',
    answer:
      'Against Wistia and Vidyard, Videokr covers the branded player, in-video lead capture and retention analytics at a fraction of the price but without their enterprise sales tooling. Against a YouTube or Vimeo embed, it removes external branding, suggested videos and platform cookies and gives you the analytics and leads. Against self-hosting, it removes the delivery, transcoding and measurement work you would otherwise build.',
    updated: '2026-08-18',
    keywords: ['wistia alternative', 'vidyard alternative', 'vimeo alternative', 'youtube embed alternative'],
    related: ['compare/wistia-alternative', 'compare/vidyard-alternative', 'compare/youtube-alternative', 'compare/hosted-vs-self-hosted-video'],
    body: `## Quick verdicts

- **vs Wistia** — same core job (branded player, in-video forms, retention), roughly a hundredth of the annual cost; Wistia wins on webinars, enterprise integrations and team workflow. [Full comparison](/compare/wistia-alternative).
- **vs Vidyard** — Vidyard is built around 1:1 sales video and its CRM integrations; if that is your use case, buy Vidyard. [Full comparison](/compare/vidyard-alternative).
- **vs Vimeo** — Vimeo is a network and a hosting product at once; Videokr is only the marketing-site half, and cheaper for it. [Full comparison](/compare/vimeo-alternative).
- **vs a YouTube embed** — no other company's logo, no suggested videos at the end, no platform cookies, and the leads and analytics are yours. YouTube still wins for discovery. [Full comparison](/compare/youtube-alternative).
- **vs WordPress player plugins** — a plugin plays the file; it does not host it, deliver it globally or measure it. [Full comparison](/compare/fluentplayer-alternative).
- **vs self-hosting** — a bare \`<video>\` tag is free until the first traffic spike, the first Safari HLS bug, or the first "where did they stop watching" question. [Full comparison](/compare/hosted-vs-self-hosted-video).

## When not to pick Videokr

If you need live streaming, studio-grade DRM, an audience-building network, or enterprise procurement paperwork, buy something else. That list is deliberately in every comparison page too.`,
    faqs: [
      {
        q: 'Is Videokr a good Wistia alternative?',
        a: 'For the branded player, in-video lead capture and retention analytics, yes — at $29 a year to $29 a month, or $69 once, versus Wistia’s plans that start around $79 a month. Wistia remains stronger for webinars, enterprise integrations and larger teams.',
      },
      {
        q: 'How is Videokr different from a YouTube embed?',
        a: 'A YouTube embed carries YouTube branding, suggested videos and platform cookies, and keeps the analytics. A Videokr embed carries only your branding, ends on your call to action, and the plays, retention data and captured leads are yours.',
      },
      {
        q: 'Is Videokr cheaper than Vidyard?',
        a: 'Substantially, yes. Vidyard’s comparable paid tiers are monthly subscriptions in the tens to hundreds of dollars; Videokr is $29 a year, $29 a month at the top tier, or a single $69 lifetime payment.',
      },
      {
        q: 'Why not just self-host video?',
        a: 'Self-hosting works until traffic spikes, mobile playback quirks or the need for retention analytics and lead capture appear — at which point you are building a video platform instead of using one.',
      },
      {
        q: 'When is Videokr the wrong choice?',
        a: 'For live streaming, studio-grade DRM, audience-building on a public network, or enterprise procurement requirements. Those cases are better served elsewhere and every comparison page says so.',
      },
    ],
  },
  {
    slug: 'videokr-wordpress-questions',
    title: 'Videokr and WordPress — questions answered',
    metaTitle: 'Videokr for WordPress — plugin, shortcode, block, speed',
    description:
      'How Videokr works with WordPress: the free plugin, the [videokr] shortcode, the Gutenberg block, the Insights screen, hosting and bandwidth impact, and Elementor or classic-editor use.',
    answer:
      'Videokr ships a free WordPress plugin on every plan that adds a [videokr] shortcode, a Gutenberg block with a video picker and an Insights screen showing plays, allowance and leads. The video never enters WordPress — it stays on Videokr and streams from its edge network, so your WordPress hosting, backups and bandwidth are untouched.',
    updated: '2026-08-18',
    keywords: ['video hosting for wordpress', 'wordpress video plugin', 'embed video wordpress'],
    related: ['docs/wordpress-plugin', 'guides/video-hosting-for-wordpress', 'compare/fluentplayer-alternative'],
    body: `## Installing

Download the plugin ZIP from [the plugin page](/docs/wordpress-plugin), upload it in **Plugins → Add New → Upload**, then paste an API key from **Dashboard → Integrations**. The plugin then lists your Videokr videos inside WordPress.

## Using it

- **Gutenberg** — the Videokr block with a searchable video picker and a live preview.
- **Shortcode** — \`[videokr id="vid_abc123"]\`, which works in the classic editor, Elementor, widgets and page builders.
- **Insights** — usage against your plan allowance, 30-day plays, most-played videos and recent leads, without leaving WordPress.

## Why it is faster than uploading to WordPress

A WordPress media upload is served by your own host: one file, one origin, no adaptive delivery, and your backups grow by the size of every video. A Videokr embed serves from an edge network and adds nothing to your hosting. [Video hosting for WordPress](/guides/video-hosting-for-wordpress) has the full argument.`,
    faqs: [
      {
        q: 'Does Videokr have a WordPress plugin?',
        a: 'Yes, a free plugin included on every plan, including the free one. It adds a [videokr] shortcode, a Gutenberg block with a video picker and an Insights screen.',
      },
      {
        q: 'Do I need the plugin to use Videokr on WordPress?',
        a: 'No. The plain iframe or script embed works in any WordPress editor. The plugin is a convenience that adds the picker, the shortcode and in-dashboard analytics.',
      },
      {
        q: 'Does Videokr upload video into WordPress?',
        a: 'No. Media stays on Videokr and streams from its edge network, so your WordPress hosting, storage, backups and bandwidth are unaffected.',
      },
      {
        q: 'Does the Videokr shortcode work with Elementor or the classic editor?',
        a: 'Yes. [videokr id="vid_abc123"] works anywhere WordPress renders shortcodes, including Elementor, the classic editor, widgets and most page builders.',
      },
      {
        q: 'Is the Videokr WordPress plugin free?',
        a: 'Yes, on every plan including the free tier. There is no separate plugin licence.',
      },
    ],
  },
  {
    slug: 'videokr-privacy-and-security-questions',
    title: 'Videokr privacy and security questions',
    metaTitle: 'Videokr privacy FAQ — cookies, private video, domain locking',
    description:
      'Privacy and security answers for Videokr: tracking cookies, GDPR posture, private and password-protected video, domain-locked embeds, lead data ownership and account security.',
    answer:
      'A Videokr embed sets no advertising cookies and builds no cross-site profile of viewers; analytics are first-party and aggregate. Videos can be unlisted, password-protected, or locked to specific domains with wildcard rules, and the leads you capture belong to you — exportable and deletable at any time.',
    updated: '2026-08-18',
    keywords: ['gdpr video hosting', 'private video hosting', 'cookieless video embed'],
    related: ['docs/privacy', 'guides/password-protect-video', 'compare/youtube-alternative'],
    body: `## Cookies and tracking

The player measures playback for your analytics, not for an ad network. There is no advertising cookie, no cross-site profile and no third-party retargeting pixel, which is the practical difference from embedding a video from a platform whose business is advertising. See [privacy](/docs/privacy).

## Keeping video private

- **Unlisted** — reachable by link, kept out of sitemaps and public listings.
- **Password** — the public page issues a token once the password is entered.
- **Domain lock** — an embed only plays on hostnames you list, wildcards allowed, so a copied embed code is worthless elsewhere.

[Private video hosting](/guides/password-protect-video) covers which to use when.

## Your data

Leads are yours: exportable as CSV, deletable on request, and pushed to your systems by webhook. Videos remain your files; nothing prevents you from taking them elsewhere.`,
    faqs: [
      {
        q: 'Does Videokr use tracking cookies?',
        a: 'No advertising cookies and no cross-site profiling. Playback measurement is first-party and aggregate, used only for your analytics.',
      },
      {
        q: 'Is Videokr GDPR-friendly?',
        a: 'The embed sets no advertising cookies and collects no viewer profile, and captured leads are your data — exportable and deletable on request. You remain the controller of the emails you collect and should say so in your own privacy notice.',
      },
      {
        q: 'Can I make a video private on Videokr?',
        a: 'Yes: mark it unlisted so it stays out of public listings and sitemaps, protect it with a password, or restrict its embeds to specific domains with wildcard rules.',
      },
      {
        q: 'Can someone steal my embed code and use my video?',
        a: 'Domain locking prevents it — the embed refuses to play on hostnames you have not listed. Videokr does not offer studio-grade DRM beyond that.',
      },
      {
        q: 'Who owns the videos and leads on Videokr?',
        a: 'You do. Source files remain yours, leads export as CSV and can be deleted, and analytics are readable and exportable per video.',
      },
    ],
  },
  {
    slug: 'videokr-seo-questions',
    title: 'Videokr and video SEO — questions answered',
    metaTitle: 'Videokr video SEO FAQ — indexing, schema, sitemaps, AI search',
    description:
      'How Videokr helps video get found: public video pages, VideoObject schema, video sitemaps, chapters as key moments, transcripts, markdown twins for assistants and llms.txt.',
    answer:
      'Every public Videokr video gets an indexable page at /v/slug with VideoObject structured data, a thumbnail, chapters exposed as key moments, an optional transcript, an entry in a video sitemap, and a Markdown twin at /v/slug.md that AI assistants can read — so the video can rank on your own domain instead of a platform’s.',
    updated: '2026-08-18',
    keywords: ['video seo', 'video schema markup', 'video sitemap', 'ai search video'],
    related: ['guides/video-seo', 'blog/ai-search-and-video', 'docs/chapters-and-captions'],
    body: `## What Videokr emits for search

- A public page per video with a canonical URL on your domain and a shareable \`?t=90\` deep link.
- \`VideoObject\` JSON-LD including thumbnail, upload date, duration, embed URL and a \`SeekToAction\`.
- Chapters as \`Clip\` key moments, so search results can jump into a section.
- A transcript when you provide one, plus captions for accessibility.
- Video sitemap entries, refreshed automatically as videos change.

## What Videokr emits for AI answer engines

A Markdown twin of every public page (\`/v/slug.md\` and \`.md\` on every library page), plus [llms.txt](/llms.txt) and llms-full.txt — plain-text summaries of the product for assistants that prefer text to HTML. [AI search and video](/blog/ai-search-and-video) explains why answer-first copy matters more than keyword density.

## What you still have to do

Write a real title and description for each video, keep the transcript accurate, and embed the video on a page that is genuinely about the same subject. [Video SEO](/guides/video-seo) is the checklist.`,
    faqs: [
      {
        q: 'Does Videokr help with video SEO?',
        a: 'Yes. Public videos get an indexable page on your Videokr domain with VideoObject schema, thumbnails, chapters as key moments, optional transcripts and automatic video-sitemap entries.',
      },
      {
        q: 'Does Videokr generate a video sitemap?',
        a: 'Yes, automatically, listing public video pages and refreshing as videos are added or changed. Placeholder-titled and non-public videos are excluded.',
      },
      {
        q: 'Can AI assistants read Videokr pages?',
        a: 'Yes. Every public page has a Markdown twin, and the site publishes llms.txt and llms-full.txt so assistants can read product facts and answers as plain text.',
      },
      {
        q: 'Do chapters help search results?',
        a: 'Chapters are emitted as Clip key moments in structured data, which is what lets a search result link straight into a section of the video.',
      },
      {
        q: 'Will embedding a Videokr video hurt my page speed or SEO?',
        a: 'No. The embed is lazy-loaded and ships no framework, so it does not block rendering or move Core Web Vitals the way a heavy player script can.',
      },
    ],
  },
  {
    slug: 'videokr-getting-started-questions',
    title: 'Getting started with Videokr — common questions',
    metaTitle: 'Getting started with Videokr — signup, upload, embed, migrate',
    description:
      'Practical getting-started answers: how to sign up, add a video, brand the player, get the embed code, migrate from YouTube or Wistia, and what to check before going live.',
    answer:
      'Create a free account, add a video by uploading an MP4 or WebM or by pasting an MP4, WebM, HLS, YouTube or Vimeo URL, set a thumbnail, brand the player, then copy the iframe or one-line script embed from the Share panel into your page. It takes about five minutes and no card.',
    updated: '2026-08-18',
    keywords: ['how to embed video on website', 'video hosting quickstart', 'migrate from youtube'],
    related: ['docs/quickstart', 'guides/embed-video-on-website', 'answers/what-is-videokr'],
    body: `## Five minutes, in order

1. **Sign up** on the free plan — no card.
2. **Add a video** by upload (MP4/WebM, up to 200 MB) or URL (MP4, WebM, HLS, YouTube, Vimeo).
3. **Pick a thumbnail** — upload one or let Videokr grab a frame.
4. **Brand the player** — skin, accent colour, radius, logo watermark, which controls show.
5. **Copy the embed** from Share and paste it into your page.

Full walkthrough: [quickstart](/docs/quickstart).

## Migrating from somewhere else

From YouTube or Vimeo you can either link the existing URL (fastest — Videokr wraps it in your player) or re-upload the source file for full control and analytics. From Wistia or Vidyard, export the source files and upload them; chapters and CTAs are re-created in Videokr's own settings.

## Before you go live

- Does the title read like something a person would search for?
- Is there a call to action at the end, not just a stop?
- Does the page around the video say the same thing the video says?
- Have you watched it on a phone?`,
    faqs: [
      {
        q: 'How do I embed a video on my website with Videokr?',
        a: 'Open the video’s Share panel and copy either the iframe pointing at /e/VIDEO_ID or the one-line script tag using embed.js with data-video, then paste it into your page. Both work on any site.',
      },
      {
        q: 'Do I need a credit card to start?',
        a: 'No. The free plan needs no card and does not expire.',
      },
      {
        q: 'How long does setup take?',
        a: 'About five minutes from signup to a branded embed on your page.',
      },
      {
        q: 'Can I move my videos from YouTube to Videokr?',
        a: 'Yes. Either paste the YouTube URL and let Videokr wrap it in your branded player, or upload the original file for full analytics, marketing layers and no YouTube branding at all.',
      },
      {
        q: 'Can I change a video after it is embedded?',
        a: 'Yes. Titles, thumbnails, chapters, captions, CTAs and player settings can all change after publishing, and the embed code stays the same.',
      },
      {
        q: 'What if I need help?',
        a: 'Email hello@videokr.com. The documentation, guides and comparisons cover most setup questions first.',
      },
    ],
  },
];
