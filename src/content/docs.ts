import type { ContentPage } from './types';

/**
 * Product documentation. Every claim here has to match what the product
 * actually does, because the same text is served to assistants as Markdown and
 * quoted back to prospective customers.
 */
export const docsPages: ContentPage[] = [
  {
    slug: 'quickstart',
    title: 'Quickstart: host a video and embed it',
    metaTitle: 'Videokr quickstart — upload, brand, embed',
    description:
      'Create a free Videokr account, add a video by upload or URL, brand the player and paste the embed on any website. Five minutes, no card.',
    answer:
      'Sign up, add a video (upload an MP4 or WebM up to 200 MB, or paste an MP4, WebM, HLS, YouTube or Vimeo URL), choose a thumbnail, then copy either the iframe or the one-line script embed from the video’s Share panel and paste it into your page. The video is hosted and delivered by Videokr, so nothing is stored on your own server.',
    updated: '2026-08-18',
    keywords: ['video hosting', 'embed video on website', 'hosted video player'],
    related: ['docs/embeds', 'docs/sources', 'guides/embed-video-on-website'],
    body: `## 1. Create an account

The [free plan](/#pricing) is $0 forever and needs no card: 5 videos, 500 plays a month, 2 GB of storage, and every player, analytics and lead-capture feature switched on. The only difference from a paid plan is a small Videokr badge on the player.

## 2. Add a video

In **Library → New video** you can either:

- **Upload** an MP4 or WebM up to 200 MB per file. It is stored by Videokr and delivered from its edge network.
- **Link a URL** — an MP4, WebM or HLS (\`.m3u8\`) file you already host, or a YouTube or Vimeo link. Linked sources use none of your storage allowance.

Then pick a thumbnail. Upload an image (up to 5 MB) or let Videokr grab a frame from the video automatically.

## 3. Brand the player

**Player** settings control the skin, accent colour, corner radius, logo watermark and which controls appear. Nothing on the player advertises Videokr on a paid plan — see [player and branding](/docs/player).

## 4. Add the marketing layer

Optional, and all of it is per video:

- [Chapters and captions](/docs/chapters-and-captions) so viewers can skip to what they came for.
- [CTAs, overlays and email gates](/docs/ctas-and-lead-forms) to turn a watch into a lead.
- [Related videos](/docs/playlists) or a playlist to keep attention on your own site.

## 5. Embed it

Open **Share** on the video and copy one of:

\`\`\`html
<iframe src="https://videokr.com/e/vid_abc123" title="Product tour"
        style="width:100%;aspect-ratio:16/9;border:0"
        allow="autoplay; fullscreen; picture-in-picture" loading="lazy"></iframe>
\`\`\`

\`\`\`html
<script src="https://videokr.com/embed.js" data-video="vid_abc123" async></script>
\`\`\`

Both work on any website — a static page, Webflow, Shopify, Framer, a React app, an email landing page. On WordPress, install the [free plugin](/docs/wordpress-plugin) instead and use \`[videokr id="vid_abc123"]\`.

Every video also gets a public page at \`videokr.com/v/your-slug\` you can link or share directly, with its own metadata and structured data for search.

## 6. Watch what happens

Within a minute of the first viewer, the video's **Analytics** tab shows impressions, plays, completion rate and a retention curve, plus device, country and referrer breakdowns. Any email captured in the player lands in **Leads**, exportable as CSV.`,
    faqs: [
      {
        q: 'Do I need a card to start?',
        a: 'No. The free plan is $0 forever with no card and no trial timer: 5 videos, 500 plays a month, 2 GB of storage.',
      },
      {
        q: 'Where is the video stored?',
        a: 'Uploads are stored and delivered by Videokr. If you link an external MP4, WebM, HLS, YouTube or Vimeo URL, the file stays where it is and Videokr wraps it in your player.',
      },
    ],
  },
  {
    slug: 'embeds',
    title: 'Embed codes: iframe, script loader and parameters',
    metaTitle: 'Video embed code reference — iframe and script',
    description:
      'Every way to embed a Videokr video or playlist: iframe, one-line script loader, aspect ratio, autoplay, muted, start time and access tokens.',
    answer:
      'Videokr gives you two embed codes for the same video. An iframe pointing at /e/VIDEO_ID works anywhere HTML is allowed, and a one-line script loader (embed.js with data-video) inserts a responsive iframe for you and reports its own height for playlists. Both accept autoplay, muted, start and token parameters.',
    updated: '2026-08-18',
    keywords: ['video embed code', 'embed video on website', 'iframe video embed'],
    related: ['docs/quickstart', 'docs/playlists', 'guides/embed-video-on-website'],
    body: `## Iframe embed

\`\`\`html
<iframe src="https://videokr.com/e/vid_abc123" title="Product tour"
        style="width:100%;aspect-ratio:16/9;border:0"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        loading="lazy"></iframe>
\`\`\`

Use the iframe when the host page restricts scripts (many CMS and email-builder contexts do). Keep \`aspect-ratio\` on the iframe rather than a fixed height so it stays responsive, and keep \`loading="lazy"\` so an embed below the fold costs the page nothing until it is scrolled into view.

## Script loader

\`\`\`html
<script src="https://videokr.com/embed.js" data-video="vid_abc123" async></script>
\`\`\`

The loader replaces itself with a correctly-shaped, responsive box, sets the iframe \`allow\` list and \`loading="lazy"\` for you, and — for a playlist — listens for the player's own height message so the queue is never clipped.

Attributes:

| Attribute | Purpose |
| --- | --- |
| \`data-video\` | Video id or slug. |
| \`data-playlist\` | Playlist id or slug (instead of \`data-video\`). |
| \`data-target\` | CSS selector to mount into, instead of in place. |
| \`data-width\` | Any CSS width; defaults to \`100%\`. |
| \`data-ratio\` | \`16/9\` for a video, \`16/11\` default for a playlist. |
| \`data-autoplay\` | Start playback when allowed by the browser. |
| \`data-muted\` | Required alongside autoplay in most browsers. |
| \`data-start\` | Start at N seconds. |
| \`data-token\` | Access token for a password-protected video. |

## URL parameters

The same options work on the iframe URL: \`/e/vid_abc123?autoplay=1&muted=1&start=30\`. A playlist embed uses \`/ep/PLAYLIST\`.

Autoplay only starts without a click when the video is muted — that is a browser rule, not a Videokr one. An autoplaying muted loop with a visible unmute control converts better than a forced-sound autoplay that the browser blocks anyway.

## Multiple embeds on one page

Both forms are safe to repeat. Each embed is a separate player in its own iframe, so styles cannot leak between your page and the player either way.

## Deep links and public pages

Every video also has a shareable public page at \`/v/slug\` with \`?t=90\` deep linking into a moment, and a Markdown twin at \`/v/slug.md\` for assistants. See [SEO video pages](/guides/video-seo).

## Access-controlled embeds

A [domain-locked](/docs/privacy) video only plays on the hostnames you list — wildcards allowed — and refuses anywhere else, so a copied embed code is worthless on someone else's site. A password-protected video needs a token, which the public page issues after the password is entered.`,
    faqs: [
      {
        q: 'Which embed should I use?',
        a: 'The script loader, unless your CMS strips scripts — it handles sizing and lazy loading for you. Use the plain iframe where scripts are not allowed.',
      },
      {
        q: 'Does the embed work outside WordPress?',
        a: 'Yes. Both embeds are plain HTML and work on any site or framework. The WordPress plugin is a convenience, not a requirement.',
      },
    ],
  },
  {
    slug: 'sources',
    title: 'Sources: MP4, WebM, HLS, YouTube and Vimeo',
    metaTitle: 'Video sources — MP4, WebM, HLS, YouTube, Vimeo',
    description:
      'What you can put in a Videokr video: uploaded MP4 or WebM up to 200 MB, or a linked MP4, WebM, HLS stream, YouTube or Vimeo URL.',
    answer:
      'A Videokr video is either an upload (MP4 or WebM, up to 200 MB per file, stored and delivered by Videokr) or a link to a source you already have: an MP4 or WebM file, an HLS .m3u8 playlist, a YouTube URL or a Vimeo URL. Linked sources use no storage allowance and are still wrapped in your branded player with your chapters, CTAs and analytics.',
    updated: '2026-08-18',
    keywords: ['hls player', 'mp4 hosting', 'youtube embed alternative'],
    related: ['docs/quickstart', 'docs/plans-and-limits', 'compare/youtube-alternative'],
    body: `## Uploads

MP4 (H.264/AAC) is the safest format for the widest device range; WebM is accepted too. The limit is 200 MB per file, which comfortably covers the kind of video that belongs on a marketing page — a demo, a tour, a testimonial, a course lesson. Storage counts against your plan: 2 GB free, 25 GB on Starter and Lifetime, 250 GB on Agency.

## Linked files

Paste a direct \`https://\` URL to an MP4 or WebM and Videokr plays it in your player without copying it. Useful when the master already lives in S3, R2, Bunny or a company file store, or when the file is larger than the upload limit.

## HLS

Paste an \`.m3u8\` URL for adaptive streaming: the player switches rendition by bandwidth, which matters for long or high-bitrate video on mobile networks. Videokr plays HLS natively where the browser supports it and via a JavaScript fallback elsewhere.

## YouTube and Vimeo

Paste a normal YouTube or Vimeo link and Videokr plays it inside your player chrome, with your chapters, CTAs and lead forms layered on top, and reports plays in your own analytics.

The honest caveat: YouTube's and Vimeo's own terms and player behaviour still apply to the underlying stream, so treat this as a way to reuse footage you have not moved yet, not as a way to strip their platform rules. For a page whose job is conversion, host the file with Videokr — no third-party recommendations, no branding, no cookie surprises. See [Videokr vs YouTube](/compare/youtube-alternative).

## Which to choose

| Situation | Best source |
| --- | --- |
| Marketing page hero, demo, testimonial | Upload |
| Master file over 200 MB | Link the MP4 |
| Hour-long lesson or webinar replay | HLS |
| Footage still living on a channel | YouTube or Vimeo link |

## Replacing a source

You can change a video's source without changing its id, slug, embed code or analytics history — so a re-cut film keeps its URL, its play count and its retention baseline.`,
    faqs: [
      {
        q: 'Can I host video larger than 200 MB?',
        a: 'Yes, by linking it: host the master anywhere and paste its MP4, WebM or HLS URL. Videokr wraps it in your player without storing it.',
      },
      {
        q: 'Does linking a YouTube video count plays?',
        a: 'Yes. Plays, completions and retention are recorded in your Videokr analytics regardless of where the file itself lives.',
      },
    ],
  },
  {
    slug: 'player',
    title: 'Player, skins and branding',
    metaTitle: 'Custom video player — skins, branding, controls',
    description:
      'Skins, accent colour, corner radius, logo watermark, control toggles, playback speed, picture-in-picture and the sticky miniplayer.',
    answer:
      'Videokr’s player is configured per video: pick a skin, set the accent colour and corner radius, add your own logo watermark, and toggle individual controls. Paid plans show no Videokr branding at all, so the player reads as part of your site rather than as an embedded third-party product.',
    updated: '2026-08-18',
    keywords: ['custom video player', 'html5 video player', 'hosted video player', 'video player for website'],
    related: ['docs/embeds', 'guides/html5-video-player', 'guides/custom-video-player'],
    body: `## What you can change

- **Skin** — several presets, from a minimal bar to a fuller control set.
- **Accent colour** — the progress bar, hover states and buttons follow it.
- **Corner radius** — square through fully rounded, to match your buttons and cards.
- **Logo watermark** — your own image, positioned in a corner, optionally linking to a URL.
- **Controls** — show or hide play, progress, volume, speed, captions, picture-in-picture, share and fullscreen individually.
- **Poster** — an uploaded thumbnail or an automatically grabbed frame; A/B two thumbnails to see which earns more plays.

## Viewer-facing behaviour

Playback speeds, keyboard shortcuts (space, arrows, \`m\`, \`f\`), picture-in-picture, and a sticky miniplayer that keeps a video playing in the corner when the viewer scrolls past it. Captions can be toggled from the bar when a video has a caption track.

## Branding and the badge

The free plan puts a small Videokr badge on the player. Starter, Agency and Lifetime remove it. Nothing else in the player — no watermark, no suggested videos, no channel link, no end-of-video grid of other people's content — ever appears.

That absence is the point. A YouTube embed on a pricing page ends by offering your visitor somebody else's video; a Videokr player ends with your [end screen and CTA](/docs/ctas-and-lead-forms).

## Accessibility and performance

The player ships keyboard-operable controls with visible focus, honours \`prefers-reduced-motion\`, and respects the browser's autoplay rules rather than fighting them. Embeds are lazy by default, so a player below the fold does not compete with your page's own loading.

## Consistency across a site

Player settings are per video, so a landing-page hero can be chromeless and autoplaying-muted while a documentation clip keeps its full control bar. Duplicating an existing video copies its player configuration.`,
    faqs: [
      {
        q: 'Can I remove all Videokr branding?',
        a: 'Yes, on Starter, Agency and Lifetime. The free plan shows one small badge on the player and nothing else.',
      },
      {
        q: 'Can I use my own logo in the player?',
        a: 'Yes — upload an image up to 5 MB, choose a corner, and optionally make it link to a page of yours.',
      },
    ],
  },
  {
    slug: 'chapters-and-captions',
    title: 'Chapters and captions',
    metaTitle: 'Video chapters and captions — how to add them',
    description:
      'Add chapters so viewers jump straight to the part they want, and captions so the video works with the sound off and can be read by search engines.',
    answer:
      'Chapters are titled timestamps you add per video; they appear in the player, on the public page as a clickable list, and in the page’s structured data as Clip key moments. Captions are a WebVTT track you upload or paste, toggled from the control bar, and they make the video usable in a sound-off feed.',
    updated: '2026-08-18',
    keywords: ['video chapters', 'video captions', 'webvtt', 'youtube video chapters'],
    related: ['guides/video-chapters', 'guides/video-seo', 'docs/player'],
    body: `## Adding chapters

In a video's **Chapters** tab, add a start time and a title per chapter. Rules that make them useful:

- The first chapter starts at \`0:00\`.
- Titles describe what the viewer gets, not the section number — "Set up the embed" beats "Part 2".
- Three to eight chapters is the range where a viewer actually uses them; twenty is a table of contents nobody reads.

Chapters appear as markers in the progress bar, as a menu in the player, and as a clickable list under the video on its public page.

## Chapters and search

On a public video page, each chapter becomes a \`Clip\` in the page's \`VideoObject\` structured data with a start and end offset, and the page advertises a \`SeekToAction\`. That is the mechanism Google uses to show key moments beside a video result. Nothing guarantees they appear, but a video without chapter data cannot be eligible at all.

## Captions

Upload or paste a WebVTT (\`.vtt\`) track. Once a track exists, the player shows a **CC** button and remembers the viewer's choice.

Captions are worth the effort for three separate reasons: most social-referred viewers watch with sound off, captions are an accessibility requirement in many contexts, and caption text is real text on the page for search and assistants to read.

A practical workflow: transcribe with whatever tool you already use, fix the product names by hand, then paste the VTT. Keep cue lines short — two lines of about forty characters each — so a wrapped caption never covers half the frame.

## Transcripts

A video can also carry a full transcript, shown under the player with in-page search and included in the page's structured data and its \`.md\` twin. See [video SEO](/guides/video-seo) for why that matters more than any tag.`,
    faqs: [
      {
        q: 'What caption format does Videokr accept?',
        a: 'WebVTT. You can upload a .vtt file or paste its contents.',
      },
      {
        q: 'Do chapters help SEO?',
        a: 'They make a page eligible for key-moment treatment by emitting Clip data and a SeekToAction. Eligibility is not a guarantee, but a page without that data cannot qualify.',
      },
    ],
  },
  {
    slug: 'ctas-and-lead-forms',
    title: 'CTAs, overlays, end screens and email gates',
    metaTitle: 'Video CTAs and in-video lead capture',
    description:
      'Timed overlays, banners, end screens and email gates that pause playback — how to turn a watched video into a click or a lead.',
    answer:
      'Videokr can show a timed overlay or banner at any second, an end screen when the video finishes, and an email gate that pauses playback until the viewer submits an address. Clicks and submissions are recorded per video, and leads are exportable as CSV or pushed to a webhook the moment they arrive.',
    updated: '2026-08-18',
    keywords: ['video cta', 'video lead capture', 'email video marketing', 'video funnel'],
    related: [
      'guides/video-lead-capture',
      'guides/video-landing-page',
      'guides/video-email-marketing',
      'docs/analytics',
    ],
    body: `## The three shapes

- **Overlay / banner** — appears at a set time for a set duration, with text and a button. Good for "book a demo" at the moment the demo makes sense.
- **End screen** — shown when the video ends, with up to a couple of actions. This is the slot a YouTube embed spends on other people's videos.
- **Email gate** — pauses playback and asks for an email. Optionally required to continue, or skippable.

## Where to place them

Read the [retention curve](/docs/analytics) before choosing a timestamp. The moment worth interrupting is right after the point where the video has proved something — a result, a before/after, a price — and just before the ordinary drop-off, not at \`0:05\` where the viewer has been given no reason yet.

A gate placed too early costs you the watch and the email. A gate placed after the payoff, on a video people are already finishing, converts.

## Lead handling

Every submission is stored against the video with its timestamp, and is available:

- In **Leads**, filterable per video, exportable as CSV.
- By email notification when it arrives.
- Over a [webhook](/docs/webhooks-and-api) — \`lead\` events are signed with HMAC-SHA256, so your CRM or automation tool can create the contact immediately.

## Measuring the layer

CTA impressions and clicks are counted per CTA, so an overlay can be judged on click-through rather than on taste. Combined with the retention curve, that is enough to tell whether a mid-roll CTA is earning clicks or costing you the second half of the video.

## What it does not do

Videokr does not run a drip campaign or score your leads — it captures the address, tells you which video and which second produced it, and hands it to your existing stack. That is deliberate: the point of the in-video form is that the viewer never leaves the page.`,
    faqs: [
      {
        q: 'Can the email form be required?',
        a: 'Yes. A gate can either require an address before playback continues or offer a skip, per video.',
      },
      {
        q: 'Where do captured emails go?',
        a: 'To your Leads list (CSV export), to an email notification, and to any webhook subscribed to lead events.',
      },
    ],
  },
  {
    slug: 'playlists',
    title: 'Playlists and related videos',
    metaTitle: 'Video playlists and related videos',
    description:
      'Group videos into an ordered playlist with its own public page and embed, or attach related videos to keep attention on your own site.',
    answer:
      'A playlist is an ordered set of your videos with its own public page at /pl/slug and its own embed at /ep/slug, showing a queue beside the player. Related videos attach suggestions to a single video. Both keep the "what next" slot pointing at your content instead of a third-party recommendation engine.',
    updated: '2026-08-18',
    keywords: ['video playlist embed', 'related videos', 'video series'],
    related: ['docs/embeds', 'guides/webinar-replay', 'docs/analytics'],
    body: `## Creating a playlist

Create the playlist, add videos, drag them into order. It gets a slug, a public page, and an embed:

\`\`\`html
<script src="https://videokr.com/embed.js" data-playlist="onboarding" async></script>
\`\`\`

The playlist embed reports its own height to the loader, so the queue is never cut off regardless of how many items it holds. With a plain iframe, point it at \`/ep/onboarding\` and give it a taller ratio (\`16/11\` is the default the loader uses).

## When a playlist is the right shape

- A multi-part course or onboarding sequence.
- A webinar split into its useful halves.
- A customer-story series on one page.

When you only want one video with a couple of follow-ups, use **related videos** on the video instead — they appear at the end without turning the page into a channel.

## Visibility

A playlist is public or unlisted like a video, and an unlisted playlist can be shared by a tokenised link. A public playlist page appears in your \`sitemap-playlists.xml\`; an unlisted one never does.

## Analytics

Each video in a playlist keeps its own plays, completions and retention curve, so you can see exactly which episode loses the audience — usually the one right after the introduction.`,
    faqs: [
      {
        q: 'Is a playlist play counted per video?',
        a: 'Yes. Each video started in a playlist counts as a play of that video, once per video per month.',
      },
    ],
  },
  {
    slug: 'analytics',
    title: 'Analytics: plays, completions and the retention curve',
    metaTitle: 'Video analytics — retention, completions, sources',
    description:
      'What Videokr measures: impressions, plays, completion rate, a 100-bucket retention curve per video, and device, country and referrer breakdowns.',
    answer:
      'For every video Videokr records impressions, plays, completions and a hundred-bucket retention curve — the share of viewers still watching at each one percent of the runtime — plus device, country and referrer breakdowns and every CTA click and lead. The curve is the number worth acting on: it tells you the second where attention is lost.',
    updated: '2026-08-18',
    keywords: ['video analytics', 'video watch time', 'video retention', 'video engagement'],
    related: ['guides/video-analytics', 'docs/ctas-and-lead-forms', 'docs/plans-and-limits'],
    body: `## The numbers

| Metric | What it means |
| --- | --- |
| Impressions | The player was loaded on a page. |
| Plays | A viewer started the video (counted once per video per month for billing). |
| Play rate | Plays ÷ impressions — a thumbnail and placement problem. |
| Completions | Viewers who reached the end. |
| Retention curve | Share of viewers still watching at each 1% of the runtime. |
| Devices, countries, referrers | Where the audience comes from and what they watch on. |
| CTA clicks, leads | The marketing layer's own results. |

## Reading the retention curve

Three shapes and what they mean:

- **A cliff in the first ten percent.** The opening is not the video the thumbnail promised. Cut the intro, start on the payoff.
- **A steady slope with no cliff.** Normal. Compare the level at 50% between videos rather than staring at one.
- **A step down at one timestamp.** Something specific is at fault — a long screen recording with no narration, a logo animation, a tangent. Go and watch that second.

A small bump upward is real too: it means viewers are rewinding, usually because something went by too fast to read.

## Plays versus views

Videokr bills on plays, de-duplicated once per video per month, so your usage number is not inflated by a colleague reloading the page fifteen times. Analytics show the raw activity; [metering](/docs/plans-and-limits) shows the de-duplicated count.

## Exports and events

Leads export as CSV. Playback events can be pushed live to your own systems over [webhooks](/docs/webhooks-and-api) — \`play\`, \`complete\`, \`cta_click\` and \`lead\` — so a warehouse or CRM can hold the same data.

## What is deliberately absent

No third-party advertising or tracking scripts ride along with the player, and analytics are reported in aggregate per video rather than as a per-visitor dossier. That keeps a Videokr embed a much smaller decision for a privacy review than a social-platform embed.`,
    faqs: [
      {
        q: 'What exactly is a retention curve?',
        a: 'The share of viewers still watching at each one percent of the video’s runtime — a hundred buckets per video, so the drop-off can be traced to a specific moment.',
      },
      {
        q: 'Can I get the raw events?',
        a: 'Yes — subscribe a webhook to play, complete, cta_click and lead events, or export leads as CSV.',
      },
    ],
  },
  {
    slug: 'privacy',
    title: 'Private video: passwords, domain locking and unlisted',
    metaTitle: 'Private video sharing — password and domain lock',
    description:
      'Three levels of access control: unlisted videos that stay out of search, password-protected videos, and embeds locked to the domains you name.',
    answer:
      'A Videokr video can be public, unlisted (reachable only by its link and excluded from sitemaps and indexing), or password-protected. Independently of that, its embed can be locked to a list of hostnames with wildcards, so a copied embed code will not play on anybody else’s site.',
    updated: '2026-08-18',
    keywords: ['private video sharing', 'password protect video', 'domain locked video'],
    related: ['guides/password-protect-video', 'docs/embeds', 'compare/vimeo-alternative'],
    body: `## Visibility

- **Public** — has an indexable page at \`/v/slug\`, appears in your sitemap, and can be found in search.
- **Unlisted** — the page carries \`noindex\`, never enters a sitemap, and is not listed anywhere public. Anyone with the link can watch.
- **Password** — the page asks for a password before it will play. A correct password issues a short-lived token for that viewer.

## Domain locking

Add the hostnames allowed to embed a video, wildcards included (\`*.example.com\`). The player refuses to run anywhere else, so lifting your embed code onto another site achieves nothing. Leave the list empty for an open embed.

## Choosing the right combination

| Need | Setting |
| --- | --- |
| Client review before launch | Unlisted, link shared privately |
| Paid course lesson | Password, or unlisted plus domain-locked embed |
| Internal all-hands recording | Password plus domain lock |
| Marketing page video | Public, domain-locked to your own site |

## Honest limits

Access control makes casual redistribution pointless; it is not DRM. A determined viewer who can watch a video can record it. If your business depends on hard content protection, you need an encrypted-media pipeline, and Videokr does not pretend to be one.

## Privacy of viewer data

Videokr records aggregate playback data per video and the leads you deliberately collect. No advertising network is loaded by the player, and there is no cross-site profile of your viewers.`,
    faqs: [
      {
        q: 'Do unlisted videos appear in Google?',
        a: 'No. Unlisted pages send a noindex directive and are excluded from every sitemap.',
      },
      {
        q: 'Can I stop someone stealing my embed code?',
        a: 'Yes — domain-lock the video. The player only runs on the hostnames you list, wildcards included.',
      },
    ],
  },
  {
    slug: 'webhooks-and-api',
    title: 'Webhooks and API keys',
    metaTitle: 'Video webhooks and API keys',
    description:
      'Subscribe an endpoint to play, complete, CTA-click and lead events with HMAC-SHA256 signatures, and create API keys for the WordPress plugin and your own tools.',
    answer:
      'Webhooks deliver play, complete, cta_click and lead events to any HTTPS endpoint as JSON, signed with HMAC-SHA256 in an x-videokr-signature header so you can verify the payload. API keys authenticate read access to your account, library and insights — that is how the WordPress plugin connects.',
    updated: '2026-08-18',
    keywords: ['video webhooks', 'video api', 'api key'],
    related: ['docs/wordpress-plugin', 'docs/analytics', 'docs/ctas-and-lead-forms'],
    body: `## Webhooks

Add an endpoint under **Integrations**, choose which events it receives, and Videokr POSTs JSON to it. A test delivery button proves the endpoint before a real lead depends on it, and the last status and error are shown so a silently broken endpoint does not stay broken.

Events:

- \`play\` — a viewer started a video.
- \`complete\` — a viewer reached the end.
- \`cta_click\` — an overlay, banner or end-screen action was clicked.
- \`lead\` — an email was submitted in the player.

## Verifying a delivery

Each request carries \`x-videokr-signature\`: the hex HMAC-SHA256 of the exact request body, keyed with the endpoint's secret. Compare it against your own computation on the raw body before trusting the payload.

\`\`\`js
const expected = crypto.createHmac('sha256', secret).update(rawBody).digest('hex');
if (!crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(header))) return res.sendStatus(401);
\`\`\`

Verify the raw body, not a re-serialised object — re-encoding JSON changes the bytes and breaks the signature.

## API keys

Create a key under **Integrations**. Send it as \`Authorization: Bearer vk_...\` to the \`/api/v1\` endpoints, which return your account and plan usage, your video and playlist library, insights and leads. Keys are read-only, shown once, and revocable — revoking a key cuts off whatever was using it immediately, including a WordPress site.

Keep keys server-side. A key pasted into front-end JavaScript is a public key.

## Rate and scope

One key per integration is the sane pattern: it means you can revoke the WordPress site without breaking your internal dashboard. Keys are scoped to your account and cannot read another account's data.`,
    faqs: [
      {
        q: 'How do I verify a webhook is really from Videokr?',
        a: 'Recompute HMAC-SHA256 of the raw request body with the endpoint secret and compare it to the x-videokr-signature header using a timing-safe comparison.',
      },
      {
        q: 'Are API keys read-only?',
        a: 'Yes. They authenticate reads of your account, library, insights and leads — they cannot change or delete anything.',
      },
    ],
  },
  {
    slug: 'wordpress-plugin',
    title: 'WordPress plugin: install, connect, embed',
    metaTitle: 'Videokr WordPress plugin — setup guide',
    description:
      'Install the free Videokr plugin, connect it with an API key, and embed hosted video with the [videokr] shortcode, the Gutenberg block or the Insights screen.',
    answer:
      'The Videokr WordPress plugin is free on every plan. Install the ZIP, paste an API key created in Videokr → Integrations, and you can embed any video with [videokr id="vid_..."] or the Gutenberg block with a visual picker. Media stays hosted on Videokr, so your WordPress host serves no video bytes.',
    updated: '2026-08-18',
    keywords: ['video hosting for wordpress', 'wordpress video player plugin', 'wordpress video plugin'],
    related: ['guides/video-hosting-for-wordpress', 'compare/fluentplayer-alternative', 'docs/embeds'],
    body: `## Install

1. Download [the plugin ZIP](/downloads/videokr-wordpress-plugin.zip).
2. In WordPress, **Plugins → Add New → Upload Plugin**, choose the ZIP, install, activate.
3. Open **Videokr → Settings**.

## Connect

In Videokr, go to **Dashboard → Integrations**, create an API key, copy it once, and paste it into the plugin's settings. The plugin then shows your account email, your plan, and your plays this month against your allowance.

Revoking the key in Videokr disconnects WordPress immediately. Use a separate key per site.

## Embed

Shortcode:

\`\`\`text
[videokr id="vid_abc123"]
[videokr id="vid_abc123" width="640" autoplay="true" muted="true" start="30"]
[videokr playlist="onboarding" ratio="16/9"]
\`\`\`

Or add the **Videokr** block in the editor and pick a video from your library, thumbnails and all. The block writes the same embed the shortcode does — an iframe pointing at your Videokr player, sized responsively and lazily loaded.

## Insights

**Videokr → Insights** reads your account through the same key and shows usage against your plan allowance, all-time totals, a 30-day plays chart, your most-played videos and your recent leads — without leaving WordPress.

## What stays in Videokr

Uploads, player configuration, chapters, CTAs, retention curves and billing live in the Videokr dashboard. The plugin is deliberately a thin client: embedding, library browsing and reporting. That is what keeps it safe to install on a client site.

## Why not a self-hosted player plugin

A WordPress player plugin plays files from your own hosting: your server pays for every byte of video, a traffic spike is your problem, and analytics stop at the boundary of that one site. With Videokr the same video is delivered from an edge network, embeds work on any site, and one dashboard reports all of it. See [Videokr vs FluentPlayer](/compare/fluentplayer-alternative) and [video hosting for WordPress](/guides/video-hosting-for-wordpress).`,
    faqs: [
      {
        q: 'Does the plugin cost anything?',
        a: 'No. It is free on every plan, including the free plan.',
      },
      {
        q: 'Does the plugin upload video into WordPress?',
        a: 'No. Media stays on Videokr and is delivered from its edge; WordPress only holds the embed.',
      },
      {
        q: 'Is a Videokr account required?',
        a: 'Yes. The plugin authenticates with an API key from your Videokr account, and revoking that key disconnects the site.',
      },
    ],
  },
  {
    slug: 'plans-and-limits',
    title: 'Plans, plays and limits',
    metaTitle: 'Plans and limits — how plays are counted',
    description:
      'What a play is, how it is de-duplicated, what each plan includes, and exactly what happens when you reach your allowance.',
    answer:
      'A play is one viewer starting one video, counted once per video per calendar month — reloads and rewatches in the same month do not count again. Free stops serving at 500 plays until the month rolls over; paid plans keep playing and extra plays cost $1 per 10,000. Bandwidth is never metered on any plan.',
    updated: '2026-08-18',
    keywords: ['video hosting pricing', 'video hosting bandwidth', 'video hosting plans'],
    related: [
      'docs/analytics',
      'guides/best-video-hosting',
      'compare/wistia-alternative',
      'blog/video-for-agencies',
    ],
    body: `## The plans

| Plan | Price | Plays / month | Videos | Storage |
| --- | --- | --- | --- | --- |
| Free | $0 forever | 500 | 5 | 2 GB |
| Starter | $29/year or $5/month | 10,000 | Unlimited | 25 GB |
| Agency | $29/month or $290/year | 150,000 | Unlimited | 250 GB |
| Lifetime | $69 once | 10,000 forever | Unlimited | 25 GB |

Every plan includes the full player, chapters, captions, CTAs, email capture, retention analytics, webhooks, API keys and the WordPress plugin. Paid plans and Lifetime remove the badge.

## What counts as a play

One viewer starting one video, de-duplicated per video per month. The consequences are worth spelling out:

- Your own testing does not silently eat the allowance.
- A viewer who returns three times in a month is one play.
- A page with five embeds costs at most five plays for one visitor who starts all five.

Impressions — the player loading without anyone pressing play — are reported in analytics and never billed.

## Reaching the allowance

- **Free**: playback stops until the month rolls over. Nothing is deleted, and upgrading restores it immediately.
- **Paid**: playback continues and the extra plays accrue at $1 per 10,000, so a traffic spike costs cents, not an outage.

## Bandwidth and storage

There is no metered egress on any plan — a video that goes unexpectedly viral does not produce a bandwidth invoice. Storage is the fixed allowance in the table, and [linking an external source](/docs/sources) uses none of it.

## Limits worth knowing

- 200 MB per uploaded video file; larger masters can be linked.
- 5 MB per image (thumbnails, logos).
- Free is capped at 5 videos; every paid plan is unlimited.

## Refunds

There are none, which is why the free plan is not a trial: test every feature on it, indefinitely, before paying anything.`,
    faqs: [
      {
        q: 'Will I get a surprise bandwidth bill?',
        a: 'No. Bandwidth is not metered on any plan. Paid plans only accrue overage on plays, at $1 per 10,000.',
      },
      {
        q: 'What happens when a free account hits 500 plays?',
        a: 'Playback pauses until the next month begins. Nothing is deleted and upgrading restores playback immediately.',
      },
      {
        q: 'Is the free plan a trial?',
        a: 'No. The free plan has no timer and needs no card: 500 plays a month, 5 videos and 2 GB of storage, for as long as you use it.',
      },
    ],
  },
];
