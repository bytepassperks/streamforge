import type { ContentPage } from './types';

/** Task-shaped guides: the question someone types, answered in the first
 *  paragraph, then the method. Product mentions stay subordinate to the task. */
export const guidesPages: ContentPage[] = [
  {
    slug: 'video-hosting-for-wordpress',
    title: 'Video hosting for WordPress: the practical guide',
    metaTitle: 'Video hosting for WordPress — options compared',
    description:
      'Why uploading video to the WordPress media library breaks, and the three real options: a hosted platform, a player plugin over your own storage, or YouTube.',
    answer:
      'Do not upload video to the WordPress media library: your host serves every byte, there is no adaptive quality, and a popular page can slow or exceed your hosting plan. Host the file on a platform built for delivery and embed it — with Videokr that means a free plugin, an API key, and a [videokr] shortcode, while the media itself is delivered from an edge network rather than your server.',
    updated: '2026-08-18',
    keywords: ['video hosting for wordpress', 'wordpress video player plugin', 'wordpress video'],
    related: ['docs/wordpress-plugin', 'compare/fluentplayer-alternative', 'guides/embed-video-on-website'],
    body: `## Why the media library is the wrong home for video

WordPress will happily accept a 300 MB MP4 and then serve it with \`<video src>\` from your hosting. Three things follow:

1. **Your host pays for the bytes.** Every play is a full-file transfer from your origin. Shared hosting throttles it; a viral page can trip a bandwidth cap.
2. **There is no adaptive quality.** One file for everyone: a phone on a weak connection buffers through the same bitrate a desktop gets.
3. **You learn nothing.** No plays, no retention, no idea whether the video is worth the space it takes.

Add the smaller irritations — upload limits at the PHP level, backups bloated by media, no thumbnail control — and the case for keeping video out of WordPress is straightforward.

## The three real options

| Option | Delivery | Analytics | Works off WordPress |
| --- | --- | --- | --- |
| Hosted video platform + embed | Platform's edge | Per-video, retention | Yes |
| Player plugin over your own storage | Your host or your bucket | Usually per-site only | No |
| YouTube embed | YouTube | YouTube's, plus their branding | Yes |

A **player plugin** is a good-looking player wrapped around files you still have to host and deliver yourself. If you already pay for a CDN or a storage bucket, that is a fine architecture — but the plugin is not the hosting, and analytics stop at that one site.

**YouTube** is free and fast, and it ends your video by offering the viewer somebody else's. On a pricing or landing page that is a real conversion cost, and you inherit their branding and cookies. Keep YouTube for discovery; keep your money pages on a player you control. See [Videokr vs YouTube](/compare/youtube-alternative).

A **hosted platform** puts the file on delivery infrastructure, gives you one dashboard across every site you embed on, and leaves WordPress to serve HTML.

## Doing it with Videokr

1. Create a [free account](/login.html?mode=signup) — 5 videos, 500 plays a month, no card.
2. Upload the MP4 (up to 200 MB) or paste the URL of a file you already host.
3. Install the [WordPress plugin](/docs/wordpress-plugin), paste an API key, and insert the block or \`[videokr id="vid_..."]\`.

Your WordPress database holds one shortcode. The video is delivered from the edge, plays in your branded player, and reports retention in a dashboard that covers every site you embed on — a plugin's analytics can only ever cover the site it is installed on.

## Checklist before you publish

- Set a real thumbnail rather than a random frame; play rate moves more with the poster than with anything else on the page.
- Keep the embed lazy so a below-the-fold video does not compete with your page's own load.
- Add [chapters](/guides/video-chapters) on anything over two minutes.
- Add captions — most social traffic arrives with sound off.
- If the video matters commercially, put a [CTA or email gate](/guides/video-lead-capture) after its payoff.`,
    faqs: [
      {
        q: 'Can I just upload video to WordPress?',
        a: 'You can, and it works until the page gets traffic. Your host then serves every byte with no adaptive quality and no analytics — which is why hosting the file elsewhere and embedding is the standard approach.',
      },
      {
        q: 'Does Videokr’s WordPress plugin cost extra?',
        a: 'No. It is free on every plan, including the free plan.',
      },
      {
        q: 'Will embedded video slow my site?',
        a: 'Not if the embed is lazy: no video bytes are fetched until the player is scrolled into view, and the media never touches your hosting.',
      },
    ],
  },
  {
    slug: 'embed-video-on-website',
    title: 'How to embed a video on a website',
    metaTitle: 'How to embed a video on your website (properly)',
    description:
      'The embed code that actually works: responsive sizing, lazy loading, autoplay rules, and how to avoid the layout shift most video embeds cause.',
    answer:
      'Paste an iframe pointing at your video host and give it a width of 100% with an aspect-ratio rather than a fixed height, keep loading="lazy", and set an allow list for autoplay, fullscreen and picture-in-picture. Autoplay only works when the video is muted — that is a browser rule. A hosted platform gives you this embed code already correct.',
    updated: '2026-08-18',
    keywords: ['embed video on website', 'video embed code', 'html5 video embed'],
    related: [
      'docs/embeds',
      'blog/five-embed-mistakes',
      'blog/video-page-speed',
      'guides/video-landing-page',
    ],
    body: `## The minimum correct embed

\`\`\`html
<iframe src="https://videokr.com/e/vid_abc123" title="Product tour"
        style="width:100%;aspect-ratio:16/9;border:0"
        allow="autoplay; fullscreen; picture-in-picture; encrypted-media"
        loading="lazy"></iframe>
\`\`\`

Four details do the work:

- **\`width:100%\` + \`aspect-ratio\`** — the box is reserved before anything loads, so the page does not jump. Fixed \`height\` attributes are the single most common cause of a video embed wrecking Cumulative Layout Shift.
- **\`loading="lazy"\`** — nothing is fetched until the embed nears the viewport.
- **\`allow=\`** — without it, fullscreen and picture-in-picture are blocked inside the iframe.
- **\`title\`** — screen readers announce the frame; an untitled iframe is announced as "iframe".

## Or a script loader

\`\`\`html
<script src="https://videokr.com/embed.js" data-video="vid_abc123" async></script>
\`\`\`

The loader writes that iframe for you, keeps it responsive, and — for a playlist — grows the box to fit the queue. Use the plain iframe where your CMS strips scripts.

## Autoplay, honestly

Browsers block autoplay with sound. Muted autoplay is allowed and is the right pattern for a hero loop; anything else needs a click. Trying to defeat this produces a player that appears broken on iOS. Set \`muted\` alongside \`autoplay\` and give the viewer a visible unmute.

## Self-hosting the file yourself

You can serve your own file:

\`\`\`html
<video controls preload="metadata" poster="/poster.webp" style="width:100%;aspect-ratio:16/9">
  <source src="/media/tour.mp4" type="video/mp4">
</video>
\`\`\`

That works, and you then own delivery, adaptive quality, thumbnails and measurement — see [self-hosted vs hosted video](/guides/self-hosted-vs-hosted-video). \`preload="metadata"\` rather than \`auto\` stops a page with several videos from downloading megabytes nobody asked for.

## Placement and framing

- One video per screenful. Two players competing on the same fold halves both.
- Put the video where the question it answers is asked, not at the top because it looks good there.
- Give it a caption line in text. Search engines and skimmers both read it.
- Keep the embed inside your content width; a full-bleed 16:9 video on a phone is a wall.

## Checks after you paste it

1. Load the page on a phone: does anything shift as the player appears?
2. Fullscreen and picture-in-picture both work?
3. Sound-off comprehension: are there captions?
4. Does the page still score well? A lazy iframe should cost you almost nothing until it is used.`,
    faqs: [
      {
        q: 'Why does my video embed cause layout shift?',
        a: 'Because the box has no reserved shape. Give the iframe width:100% and aspect-ratio (or an explicit width and height pair) so the space exists before the player loads.',
      },
      {
        q: 'Why does autoplay not work?',
        a: 'Browsers only allow autoplay when the video is muted. Add muted alongside autoplay and offer a visible unmute control.',
      },
    ],
  },
  {
    slug: 'video-seo',
    title: 'Video SEO: getting your video pages found',
    metaTitle: 'Video SEO — how video pages actually rank',
    description:
      'What genuinely affects video visibility: an indexable page per video, VideoObject structured data, chapters as key moments, transcripts, a video sitemap and a crawlable thumbnail.',
    answer:
      'A video ranks through the page it lives on. Give each video its own indexable page with real text around it, VideoObject structured data (thumbnail, upload date, duration, embed URL), chapters as Clip key moments, a transcript, and a video sitemap listing the page, player and thumbnail. Embedded video inside a page that is already about the topic helps that page; it does not create visibility on its own.',
    updated: '2026-08-18',
    keywords: ['video seo', 'video seo optimization', 'videoobject schema', 'video sitemap'],
    related: ['guides/video-chapters', 'docs/chapters-and-captions', 'blog/video-seo-checklist'],
    body: `## The one structural decision

Search engines index pages, not files. So the question is whether each video has a page of its own that is allowed to be indexed, or whether all your video lives inside a single \`/features\` page.

A page per video, with a title, a description, the transcript and links to related content, is the whole foundation. Videokr creates one automatically at \`/v/slug\` for every public video, with metadata and structured data already in place, plus a Markdown twin at \`/v/slug.md\` for assistants.

## Structured data that matters

A \`VideoObject\` with:

- \`name\`, \`description\` — matching the visible page, not stuffed
- \`thumbnailUrl\` — publicly fetchable, not behind a login
- \`uploadDate\`, \`duration\`
- \`contentUrl\` and/or \`embedUrl\`
- \`hasPart\` \`Clip\` entries for chapters, and a \`SeekToAction\`

Two rules people get wrong: the thumbnail must be crawlable (a blocked image disqualifies the video), and the markup must describe the video that is actually prominent on the page.

## Chapters as key moments

Each chapter becomes a \`Clip\` with a start and end offset. That is how a result can show jump-to links. Write chapter titles as the thing a searcher wants ("Set up domain locking"), not as section numbers. See [how to add video chapters](/guides/video-chapters).

## Transcripts

A transcript is the only way the words spoken in your video become text on the page. It helps ordinary ranking, it is what an AI answer engine can actually quote, and it makes the page useful to someone who would rather read. Paste it under the player; do not hide it behind a tab that renders empty to a crawler.

## Sitemaps and thumbnails

List every public video page in a video sitemap with \`video:thumbnail_loc\`, \`video:title\`, \`video:description\`, \`video:player_loc\` and \`video:publication_date\`. Exclude anything unlisted or password-protected — a sitemap entry for a page you did not want indexed is a leak, not an optimisation. Videokr generates \`sitemap-videos.xml\` from public videos only.

## Where video actually lifts a page

- A page about the exact topic, with the video near the top and text that stands on its own.
- A support answer where the video is the answer and the text summarises it.
- A landing page where the video is the demo, and the copy repeats the promise in text.

Video does not rescue a thin page. It makes a good page harder to beat.

## And for AI answer engines

Assistants quote text. So: an answer-first paragraph near the top, a transcript, headings phrased as questions, plain-text alternates, and a stable URL. Videokr publishes \`/llms.txt\` and per-video \`.md\` twins for exactly this reason. Nobody can guarantee a citation — what you can do is be quotable and be fetchable.`,
    faqs: [
      {
        q: 'Do I need a separate page per video?',
        a: 'For search visibility of the video itself, yes. A page per video with real text, structured data and a transcript is what search engines can rank.',
      },
      {
        q: 'Does embedding a YouTube video help my SEO?',
        a: 'It can help the page’s engagement, but the video result generally credits YouTube’s page. Hosting the video on your own domain keeps that credit on your site.',
      },
      {
        q: 'Is a video sitemap required?',
        a: 'No, but it is the cheapest way to make sure every public video page, its player URL and its thumbnail are discovered.',
      },
    ],
  },
  {
    slug: 'video-landing-page',
    title: 'How to build a video landing page that converts',
    metaTitle: 'Video landing page — structure that converts',
    description:
      'Where the video goes, how long it should be, what the thumbnail must say, and where to put the CTA — using the retention curve to decide instead of guessing.',
    answer:
      'Put one video above the fold with a thumbnail that states the outcome, keep it under two minutes for a cold audience, repeat the promise in text beside it for the majority who never press play, and place the CTA at the moment the retention curve says the video has proved its point — usually right after the demo, not at the end.',
    updated: '2026-08-18',
    keywords: ['video landing page', 'video landing page example', 'video funnel'],
    related: ['guides/video-lead-capture', 'docs/ctas-and-lead-forms', 'blog/video-conversion-benchmarks'],
    body: `## The structure

1. **Headline** — the outcome, in words. Not "Watch our video".
2. **One video** — the demo or the proof, not the brand film.
3. **Text beside or under it** — the same promise, readable without playing anything. Most visitors will not press play; the page must still work for them.
4. **A single CTA**, repeated: once beside the video, once at the end of the copy, once inside the player.
5. **Proof** — numbers, logos you are actually entitled to use, or a named customer story.

## Length

For a cold audience, under two minutes. Every extra minute of a marketing video is paid for in drop-off, and the retention curve makes that visible: look at the share still watching at 50% and multiply by your conversion rate before defending a five-minute cut.

For an audience already in a trial, longer is fine — they came for detail. Split it with [chapters](/guides/video-chapters) so they can skip.

## The thumbnail does more work than the video

Play rate is plays ÷ impressions, and it moves more with the poster frame than with anything else on the page. A thumbnail should show the product doing the thing, with three or four words of text. A random mid-video frame of a slide is the default and it is always beaten. A/B two thumbnails and let the numbers decide.

## Where the CTA goes

Read the retention curve, then place the in-player CTA immediately after the payoff moment and before the ordinary drop-off. Practically:

- **Overlay at the payoff** — "Start free" the second after the result is shown.
- **End screen** — for the minority who finish, the strongest offer.
- **Email gate** — only on a video people are already finishing, and only if the rest is worth an address.

## The mistakes worth naming

- Autoplaying with sound. Browsers block it; visitors who do hear it leave.
- A YouTube embed on the money page: it ends by offering the visitor a competitor's video.
- Two videos on one fold.
- No captions, so the sound-off majority sees a mime.
- A video that opens with a fifteen-second logo animation. The first five seconds decide the rest.

## Measuring it properly

Track the chain, not just the page: impressions → play rate → retention at 50% → CTA click → lead. A page that "converts badly" is usually failing at exactly one of those steps, and each has a different fix. [Video analytics](/guides/video-analytics) walks through reading it.`,
    faqs: [
      {
        q: 'How long should a landing page video be?',
        a: 'Under two minutes for a cold audience. Use chapters if it must run longer, and check retention at the halfway point before defending the length.',
      },
      {
        q: 'Should the video autoplay?',
        a: 'Muted autoplay for a short hero loop is fine. Autoplay with sound is blocked by browsers and annoys the visitors it reaches.',
      },
    ],
  },
  {
    slug: 'video-lead-capture',
    title: 'How to capture leads inside a video',
    metaTitle: 'In-video lead capture — email gates and CTAs',
    description:
      'Where to place an email gate, when a gate costs more than it earns, and how to get the captured address into your CRM the moment it arrives.',
    answer:
      'Add an email form inside the player rather than beside it, and place it after the moment the video has proved something — a gate at 0:05 loses both the watch and the email. Route submissions straight to your CRM with a signed webhook, and keep the field count at one: an address.',
    updated: '2026-08-18',
    keywords: ['video lead capture', 'email video marketing', 'video cta', 'video form'],
    related: ['docs/ctas-and-lead-forms', 'guides/video-landing-page', 'docs/webhooks-and-api'],
    body: `## Why in-player beats beside-player

A form inside the video keeps the viewer in the moment they were persuaded. Sending them to a separate form loses the ones who were mid-thought, and a form below the fold is invisible to a viewer who is watching.

## Placement: use the curve, not taste

Open the video's retention curve and find the payoff — the second where the thing being demonstrated visibly works. Put the gate just after it, and before the ordinary drop-off. Three patterns worth trying in order:

1. **Skippable prompt after the payoff.** Lowest cost, decent yield.
2. **Required gate at the same point.** Higher yield per viewer, fewer viewers.
3. **End screen only.** Safest, smallest.

If a required gate drops retention hard and does not raise lead count, it was placed too early — move it later, do not remove the form.

## Ask for one thing

Email only. Every extra field costs submissions, and you can enrich later. If you genuinely need a name for the follow-up, two fields is the ceiling.

## Say what happens next

"Get the setup guide" earns more addresses than "Sign up". The exchange has to be visible: one line saying what arrives and that it is not a newsletter subscription in disguise.

## Wiring it into your stack

With Videokr each submission is stored against the video and the second it happened, and is available three ways: in **Leads** with CSV export, as an email notification, and as a signed \`lead\` [webhook](/docs/webhooks-and-api) your CRM or automation tool can consume immediately. Verify the HMAC signature on the raw body before creating the contact.

The timestamp is more useful than it sounds: leads captured mid-video behave differently from leads captured on an end screen, and knowing which video and which moment produced a customer tells you which video to make next.

## Compliance, briefly

Say what you will send, keep the consent record, and honour unsubscribes — the same rules as any other form. An in-video form is not a loophole around consent, and pretending otherwise gets your sending domain burned.`,
    faqs: [
      {
        q: 'Does gating a video hurt watch time?',
        a: 'A required gate always costs some viewers. Placed after the payoff it usually earns more leads than it loses watches; placed in the first seconds it loses both.',
      },
      {
        q: 'Can leads go straight to my CRM?',
        a: 'Yes. Subscribe a webhook to lead events and create the contact on arrival, or export CSV from the Leads screen.',
      },
    ],
  },
  {
    slug: 'video-chapters',
    title: 'How to add video chapters (and why)',
    metaTitle: 'How to add video chapters — YouTube and your own site',
    description:
      'Chapter timestamps done right: how many, how to title them, how they appear in the player, and how they become key moments in search results.',
    answer:
      'Chapters are titled timestamps starting at 0:00. On YouTube you add them as timestamped lines in the description; on your own site you add them in your player and emit them as Clip entries in the page’s VideoObject structured data so search engines can show jump-to key moments. Three to eight outcome-shaped titles beat twenty numbered sections.',
    updated: '2026-08-18',
    keywords: ['video chapters', 'youtube video chapters', 'how to add video chapters', 'key moments'],
    related: ['docs/chapters-and-captions', 'guides/video-seo', 'blog/anatomy-of-a-product-demo'],
    body: `## The rules that apply everywhere

- Start the first chapter at \`0:00\`.
- Keep them in ascending order.
- Give each one enough runtime to be worth jumping to (ten seconds is not a chapter).
- Title them by outcome: "Lock the embed to your domain", not "Section 3".
- Three to eight is the useful range.

## On YouTube

Put timestamped lines in the video description, starting with \`0:00\`:

\`\`\`text
0:00 What this does
0:38 Uploading the file
1:24 Branding the player
2:05 Reading the retention curve
\`\`\`

YouTube generates the chapter bar from that when it accepts the format — at least three chapters, first at zero.

## On your own site

Two things have to happen. The player needs to show chapter markers and a menu, and the page needs to say so in machine-readable form:

\`\`\`json
{
  "@type": "VideoObject",
  "hasPart": [
    { "@type": "Clip", "name": "Uploading the file", "startOffset": 38, "endOffset": 84,
      "url": "https://videokr.com/v/tour?t=38" }
  ],
  "potentialAction": {
    "@type": "SeekToAction",
    "target": "https://videokr.com/v/tour?t={seek_to_second_number}",
    "startOffset-input": "required name=seek_to_second_number"
  }
}
\`\`\`

In Videokr you add chapters in the video's Chapters tab and both halves are produced for you: markers and a menu in the player, a clickable list on the public page, and \`Clip\` plus \`SeekToAction\` in the page's structured data. See [chapters and captions](/docs/chapters-and-captions).

## What chapters actually buy you

- **Viewers stay.** Someone who came for one thing can reach it instead of leaving.
- **Retention curves become readable.** A drop at a chapter boundary tells you which section to cut.
- **Eligibility for key moments** in search results — not a promise, but impossible without the data.

## When to skip them

Under ninety seconds, chapters are noise. Use them on demos, walkthroughs, webinar replays and course lessons.`,
    faqs: [
      {
        q: 'How many chapters should a video have?',
        a: 'Three to eight for most marketing and demo videos. Fewer is not worth a menu; more is a table of contents nobody uses.',
      },
      {
        q: 'Do chapters need to start at 0:00?',
        a: 'Yes. Both YouTube’s chapter bar and Clip structured data expect the first chapter to start at zero.',
      },
    ],
  },
  {
    slug: 'password-protect-video',
    title: 'How to password protect and privately share a video',
    metaTitle: 'How to password protect a video',
    description:
      'Unlisted links, passwords, domain-locked embeds and signed tokens — which one to use for client reviews, paid lessons and internal recordings.',
    answer:
      'Use an unlisted link for a client review, a password for anything you would mind a stranger watching, and a domain lock so a copied embed code cannot play anywhere but your own site. All three are settings on the video, not separate uploads. None of them is DRM: a viewer who can watch can record.',
    updated: '2026-08-18',
    keywords: ['password protect video', 'private video sharing', 'share video privately'],
    related: [
      'docs/privacy',
      'compare/vimeo-alternative',
      'blog/course-video-hosting',
      'guides/self-hosted-vs-hosted-video',
    ],
    body: `## Pick the level that matches the risk

| Situation | Use |
| --- | --- |
| Draft for a client to approve | Unlisted link |
| Paid course lesson | Password, plus a domain-locked embed on the members' area |
| Internal all-hands recording | Password plus domain lock |
| Marketing video on your own site | Public, domain-locked to your hostnames |

## Unlisted

The page exists, carries \`noindex\`, and appears in no sitemap or public listing. Anyone with the link can watch. Right for reviews and one-off shares; wrong for anything that would be embarrassing if forwarded.

## Password

The page asks for a password before it plays, and a correct entry issues a short-lived token for that viewer. Practical notes: one password per audience rather than per person, rotate it when a cohort ends, and never put the password in the same email as the link if the email might be forwarded.

## Domain-locked embeds

List the hostnames allowed to embed the video, wildcards included (\`*.example.com\`), and the player refuses everywhere else. This is the setting that makes stealing your embed code pointless, and the one most people forget. In Videokr it lives beside visibility — see [private video](/docs/privacy).

## What none of this does

It is not DRM. Screen recording exists. Access control raises the effort from "copy the URL" to "deliberately re-record", which is the right target for course content and client work. If your business genuinely requires hard protection, you need an encrypted-media pipeline and a vendor who sells exactly that.

## The self-hosting version

Doing this yourself means signed URLs with short expiries, a referrer or Origin check at the CDN, and a token issuer of your own — plus the discipline to keep them working. Fine if you already run that infrastructure; see [self-hosted vs hosted video](/guides/self-hosted-vs-hosted-video) for the honest trade.`,
    faqs: [
      {
        q: 'Can a password-protected video still be embedded?',
        a: 'Yes — the embed accepts an access token issued after the password is entered, so a members’ area can play it without asking twice.',
      },
      {
        q: 'Is unlisted the same as private?',
        a: 'No. Unlisted means unindexed and unlisted, but anyone holding the link can watch. Use a password when the link itself is not enough.',
      },
    ],
  },
  {
    slug: 'html5-video-player',
    title: 'HTML5 video player: what you get free and what you have to build',
    metaTitle: 'HTML5 video player — native vs hosted player',
    description:
      'What the native <video> element gives you, what it does not (chapters, captions UI, HLS, analytics, branding), and when to stop building your own.',
    answer:
      'The native HTML5 <video> element plays MP4 and WebM, gives you the browser’s own controls, and costs nothing. What it does not give you is a consistent look across browsers, a chapter menu, adaptive HLS playback in every browser, retention analytics, lead capture or branding — those are the reasons people replace it with a player library or a hosted player.',
    updated: '2026-08-18',
    keywords: ['html5 video player', 'custom video player', 'video player for website'],
    related: ['guides/custom-video-player', 'docs/player', 'guides/embed-video-on-website'],
    body: `## The native element, done properly

\`\`\`html
<video controls playsinline preload="metadata" poster="/poster.webp"
       style="width:100%;aspect-ratio:16/9">
  <source src="/media/tour.mp4" type="video/mp4">
  <track kind="captions" src="/media/tour.en.vtt" srclang="en" label="English" default>
</video>
\`\`\`

- \`playsinline\` stops iOS taking over the screen.
- \`preload="metadata"\` fetches enough to show duration without pulling the file.
- \`poster\` is a still, not a decoration: it decides your play rate.
- \`<track>\` gives you captions with no JavaScript at all.

For a documentation clip, that markup is genuinely enough. Stop here if it is.

## What you do not get

| Need | Native \`<video>\` |
| --- | --- |
| Identical controls across browsers | No — each browser draws its own |
| Chapter markers and menu | No |
| Adaptive streaming (HLS) | Safari yes, others need a JS player |
| Retention curve, play counts | No |
| In-video CTA or email form | No |
| Branding, watermark, accent colour | Only by rebuilding the control bar |
| Sticky miniplayer, PIP UI | PIP via the browser only |

## Three routes from here

1. **Style the native element.** Cheapest. Custom controls over a hidden native bar is a weekend of work and then a long tail of edge cases (fullscreen on iOS, keyboard focus, captions styling).
2. **A player library.** Video.js, Plyr, Vidstack and friends handle the control bar and plugins. You still own hosting, transcoding, thumbnails, analytics and CTAs.
3. **A hosted player.** The file, the delivery, the player, the analytics and the marketing layer arrive together, embedded with one line. You give up direct control of the internals.

## The honest decision rule

If the video is incidental to the page, use the native element. If the video is the page's job — a demo, a sales asset, a course — the measurement and the CTA layer are the point, and building them is a project, not a task. That is what [Videokr's player](/docs/player) is: a branded player over hosted delivery, with the retention curve and lead capture already wired in.`,
    faqs: [
      {
        q: 'Can the native HTML5 player play HLS?',
        a: 'Safari can play .m3u8 natively; Chrome and Firefox need a JavaScript player such as hls.js or a hosted player that includes it.',
      },
      {
        q: 'Is a player library enough?',
        a: 'For look and controls, yes. It does not host, transcode, deliver or measure the video — those remain yours.',
      },
    ],
  },
  {
    slug: 'custom-video-player',
    title: 'Custom video player branding without building one',
    metaTitle: 'Custom video player branding',
    description:
      'How to make an embedded player look like part of your product: accent colour, radius, logo, control set, poster and end screen.',
    answer:
      'A player reads as "yours" when four things match your site: the accent colour, the corner radius, the control set (hide what the viewer does not need) and the end state. Add your logo as a watermark and remove the vendor badge, and an embed stops looking like a third-party widget without writing any player code.',
    updated: '2026-08-18',
    keywords: ['custom video player', 'branded video player', 'white label video player'],
    related: ['docs/player', 'guides/html5-video-player', 'compare/wistia-alternative'],
    body: `## The four things that matter

1. **Accent colour.** Match the progress bar and buttons to your primary action colour. A blue scrubber on an orange site is the giveaway.
2. **Corner radius.** Match your cards and buttons. Square player, rounded page reads as pasted in.
3. **Control set.** Hide what the video does not need. A five-second hero loop needs no volume slider, no speed menu, no share button.
4. **The end state.** Default players end on a grey freeze frame. Yours should end on your [CTA or end screen](/docs/ctas-and-lead-forms).

## Watermark, not badge

A logo watermark in a corner, optionally linking to your site, is worth having on video that gets shared or downloaded. The vendor badge is a different thing: on Videokr the free plan shows one small badge, and every paid plan removes it entirely — no suggested videos, no channel link, nothing that names the platform.

## Poster frames

The poster is the highest-leverage image on the page. Rules that hold up: show the product doing the thing, three or four words of text maximum, readable at 320px wide, and never a random mid-sentence frame. Where you can, A/B two posters on the same video and keep the one with the better play rate.

## Consistency across a site

Keep a house style: one accent, one radius, one control set per context (hero, docs, testimonial). Duplicating a configured video is faster than reconfiguring one, and it stops a site drifting into five different players.

## When you do need to build

If you need a control the platform does not have — a bespoke interactive overlay, a synchronised transcript pane, quiz gating inside the frame — you are building a player, and the [native element or a player library](/guides/html5-video-player) is the honest starting point. For the ordinary marketing case, configuration gets you there in minutes.`,
    faqs: [
      {
        q: 'Can I remove the platform’s branding from a video player?',
        a: 'On Videokr, yes on every paid plan and Lifetime; the free plan shows one small badge. Check any vendor’s free tier for this specifically — it is a common upsell.',
      },
    ],
  },
  {
    slug: 'self-hosted-vs-hosted-video',
    title: 'Self-hosted video vs a hosted platform',
    metaTitle: 'Self-hosted video vs hosted video hosting',
    description:
      'An honest comparison: what self-hosting costs in bandwidth, transcoding and maintenance, and what you give up by using a platform.',
    answer:
      'Self-hosting is cheapest at low traffic and gives you complete control, but you own transcoding, adaptive streaming, thumbnails, access control, analytics and every bandwidth bill. A hosted platform trades that control for delivery, a player and measurement you do not maintain. The deciding question is whether video is infrastructure you want to run or a marketing tool you want results from.',
    updated: '2026-08-18',
    keywords: ['self hosted video', 'self hosted video streaming', 'video hosting alternative'],
    related: ['guides/best-video-hosting', 'guides/video-hosting-for-wordpress', 'docs/plans-and-limits'],
    body: `## What self-hosting actually involves

An MP4 in a bucket behind a CDN plays. Getting from there to production means:

- **Transcoding** to at least three renditions, and an HLS or DASH manifest, or mobile viewers buffer.
- **Poster generation** and storage.
- **Captions** — the transcription step is yours.
- **Access control** — signed URLs with expiries, Origin checks, token issuing.
- **Analytics** — an event pipeline, storage, and something that computes a retention curve.
- **Bandwidth** — metered by every serious CDN. This is the line item that surprises people: video egress scales with success.

Each is solvable. Together they are a small platform, and it never stops needing attention.

## What a platform takes away — and takes

You stop owning delivery, transcoding, the player and the analytics pipeline. In exchange you accept someone else's roadmap, their pricing model, and a dependency in your critical path. Ask any vendor two questions before committing: can I export my videos, leads and analytics, and what exactly is metered?

## The cost shape

- **Self-hosted**: near-zero fixed cost, cost rises with every view (egress), engineering time up front and forever.
- **Per-seat platforms**: predictable, expensive, priced on team size rather than usage.
- **Per-play pricing**: cost tracks audience, no egress surprises. Videokr meters de-duplicated plays and never bills bandwidth — 500 plays a month free, 10,000 for $69 once, $1 per extra 10,000 on paid plans.

## A reasonable middle

You do not have to choose globally:

- Keep archive and internal footage in your own bucket.
- [Link that file](/docs/sources) into a hosted player when it needs a page, a CTA and measurement.
- Host marketing video on the platform outright.

That keeps storage costs where they are cheapest and puts the marketing layer where it is worth paying for.

## Decide with three questions

1. Does anyone lose money if a video buffers or breaks? If yes, you want delivery to be someone's job.
2. Do you need to know where viewers drop off? Building that is the expensive part.
3. Is there an engineer who will own this in a year's time? If not, self-hosting is a plan with no owner.`,
    faqs: [
      {
        q: 'Is self-hosting video cheaper?',
        a: 'At low traffic, usually. Costs scale with egress, and the engineering time for transcoding, access control and analytics is the real expense.',
      },
      {
        q: 'Can I keep my files and still use a hosted player?',
        a: 'Yes — link an MP4, WebM or HLS URL you already host and the platform wraps it in the player, CTAs and analytics without storing it.',
      },
    ],
  },
  {
    slug: 'video-analytics',
    title: 'How to read video analytics and act on them',
    metaTitle: 'Video analytics — metrics that change decisions',
    description:
      'Play rate, retention curve, completion and CTA click-through: which metric each problem lives in, and what to change when it moves.',
    answer:
      'Four numbers cover almost every decision: play rate (thumbnail and placement), the retention curve (the edit), completion rate (length and payoff order) and CTA click-through (offer and timing). Read them in that order — a video nobody starts cannot be fixed by re-cutting the middle.',
    updated: '2026-08-18',
    keywords: ['video analytics', 'video watch time', 'video engagement', 'video retention'],
    related: ['docs/analytics', 'guides/video-landing-page', 'blog/video-conversion-benchmarks'],
    body: `## The chain

\`\`\`text
impressions → plays → watch time → completion → CTA click → lead
\`\`\`

Find the weakest link before changing anything. Each link has one honest owner:

| Symptom | Metric | Fix |
| --- | --- | --- |
| Nobody starts it | Play rate | Poster frame, position on the page, the headline above it |
| Cliff in the first 10% | Retention | Cut the intro; open on the payoff |
| Step down mid-video | Retention | Watch that exact second and cut it |
| Long slow decline, low completion | Completion | The video is too long, or the best part is last |
| Watched but no clicks | CTA CTR | Wrong offer, wrong moment, or no CTA at all |
| Clicks but no leads | Form | Too many fields, or the promise is unclear |

## Retention curves, read properly

The curve is the share of viewers still watching at each 1% of runtime. Compare a video against itself over time and against your own other videos — not against a published industry average, which is measured on different content for a different audience.

Two readings people get wrong:

- **A cliff at the very start is normal** to a point: some of it is accidental plays. What matters is where it flattens.
- **An upward bump is information**: viewers are rewinding. Something went past too fast — usually a screen with text on it.

## Play rate is a page problem

Play rate is plays ÷ impressions. It is decided by the poster, the surrounding copy and where on the page the player sits — not by the video's content, which nobody has seen yet. Test the thumbnail first; it is the cheapest experiment you have.

## Beware of averages

"Average watch time" hides the shape. Two videos with identical averages can be a steady decline and a cliff at 0:20, and they need opposite fixes. Use the curve; use the average only for reporting.

## Turning it into a decision

A workable loop: pick the weakest link, make one change, wait for a comparable number of plays, compare like with like. With per-video plays, completions, curves, referrers and CTA click-through in [Videokr's analytics](/docs/analytics), that loop takes a week rather than a quarter.`,
    faqs: [
      {
        q: 'What is a good video completion rate?',
        a: 'It depends far more on length and audience than on quality — compare a video against your own others rather than an industry average, and watch the retention curve for where it loses people.',
      },
      {
        q: 'Which metric should I fix first?',
        a: 'Play rate. A video nobody starts cannot be improved by editing it.',
      },
    ],
  },
  {
    slug: 'webinar-replay',
    title: 'How to publish a webinar replay that people watch',
    metaTitle: 'Webinar replay — how to publish and gate it',
    description:
      'Cut it, chapter it, decide whether to gate it, and give it a page that can be found — the four steps that separate a used replay from a dead recording.',
    answer:
      'Trim the waiting-room and the housekeeping, cut the hour into chapters titled by question, publish it on its own page with a transcript so it can be found and skimmed, and gate it after the first real answer rather than before the video starts. A raw sixty-minute recording behind a form is the version nobody watches.',
    updated: '2026-08-18',
    keywords: ['webinar replay', 'webinar recording', 'gated video'],
    related: ['docs/playlists', 'guides/video-lead-capture', 'guides/video-chapters'],
    body: `## 1. Cut it

Remove the pre-roll silence, the "can everyone hear me", the poll waiting time and any question that was really a support ticket. A sixty-minute session is usually thirty-five useful minutes.

## 2. Chapter it by question

Every question asked live is a chapter title, phrased as the audience asked it. That gives the replay two jobs: it becomes navigable, and each chapter title is a phrase people search for. See [how to add chapters](/guides/video-chapters).

## 3. Decide the gate honestly

- **Ungated with an in-video CTA.** Best reach; the replay can rank and be shared.
- **Gate after the first real answer.** The compromise that usually wins: the viewer sees value, then trades an address to continue.
- **Gate before playback.** Highest form fill per viewer, lowest total. Defensible for a genuinely high-value session, not for a product overview.

Whatever you choose, [route submissions to your CRM](/docs/webhooks-and-api) with the video and timestamp attached — a lead from chapter four is a different conversation from a lead at the door.

## 4. Give it a real page

Its own URL, a summary in text, the chapter list, a transcript, and links to the related content you mentioned live. That page is what search engines and assistants can read; the video file alone is not. See [video SEO](/guides/video-seo).

## 5. Split long sessions

If the session covered three topics, publish it as a [playlist](/docs/playlists) of three: one topic each, each with its own page and its own retention curve. You will discover that one topic carried the entire session, which tells you what the next webinar should be.

## What the numbers tell you afterwards

Retention at each chapter boundary shows which answers held the room. Completion tells you if the cut is still too long. CTA click-through tells you whether the offer at the end matched the audience the content attracted.`,
    faqs: [
      {
        q: 'Should a webinar replay be gated?',
        a: 'Gate it after the first substantive answer rather than before playback: you keep most of the reach and still capture the viewers who are genuinely interested.',
      },
      {
        q: 'How long should a replay be?',
        a: 'As long as its useful content, and no longer. Most hour-long sessions cut to thirty to forty minutes, and split into topic-sized videos they perform better still.',
      },
    ],
  },
  {
    slug: 'video-email-marketing',
    title: 'Video in email marketing: what actually works',
    metaTitle: 'Video email marketing — how to do it properly',
    description:
      'Email clients do not play video reliably. The pattern that works: an animated thumbnail linking to a page whose video autoplays, with the click and the play both measured.',
    answer:
      'Do not embed a video player in an email — most clients strip it. Use a still or short animated GIF thumbnail with a visible play button, link it to a landing page where the video starts immediately, and measure the click in your email tool and the play, retention and CTA on the page.',
    updated: '2026-08-18',
    keywords: ['video email marketing', 'email video marketing', 'video in email'],
    related: ['guides/video-landing-page', 'guides/video-lead-capture', 'docs/embeds'],
    body: `## Why not embed the player

HTML5 video in email works in a minority of clients and fails silently in the rest — often leaving a blank rectangle. Outlook is the reliable spoiler. The cost of "it might work for some" is a broken email for everyone else.

## The pattern that works

1. **A thumbnail image** in the email: a real frame, a clear play button, a caption stating the outcome.
2. **Linked to a page** built around that video, with \`?autoplay=1&muted=1\` so playback starts on arrival — see [embed parameters](/docs/embeds).
3. **One CTA** on that page, the same one the email promised.

A short animated GIF (two to three seconds, under about 1 MB) lifts clicks over a static still. Keep the first frame legible, because that is what a client with images off shows.

## Measurement across the seam

Your email tool reports the click; the landing page reports the play, retention and conversion. Keep them joinable: a campaign-specific landing page, or UTM parameters preserved to the page so referrer data in [video analytics](/docs/analytics) shows the campaign. Then you can answer the real question — did the video earn the reply, or just the click?

## Practical rules

- Personalised subject line, generic video: fine. Personalised video: expensive, and rarely worth it below enterprise deal sizes.
- Keep the video under ninety seconds for a cold list.
- Captions matter more here than anywhere else: a lot of email is read on a phone in a queue.
- Do not autoplay with sound on the landing page. Muted and captioned.

## Sending, briefly

Video does not change deliverability, but the landing page does need to exist on a domain you control and are authenticated for (SPF, DKIM, DMARC). A video link pointing at an unfamiliar third-party domain will hurt more than the video helps.`,
    faqs: [
      {
        q: 'Can you embed a playable video in an email?',
        a: 'Not reliably. Most clients strip HTML5 video. Use a thumbnail that links to a landing page where the video plays.',
      },
      {
        q: 'GIF or static thumbnail?',
        a: 'A short, small GIF usually earns more clicks, but its first frame must stand alone for clients that block images.',
      },
    ],
  },
  {
    slug: 'best-video-hosting',
    title: 'How to choose a video hosting platform',
    metaTitle: 'Best video hosting platform — how to choose',
    description:
      'The seven questions that separate video hosting platforms: pricing model, branding, embeds, analytics depth, access control, integrations and exit.',
    answer:
      'Compare video hosting on what actually bites later: whether pricing is metered on bandwidth, plays or seats; whether the player can be fully unbranded; whether embeds work outside one CMS; whether analytics include a per-video retention curve; how access control works; what integrations exist; and how you get your videos, leads and analytics out.',
    updated: '2026-08-18',
    keywords: ['best video hosting', 'best video hosting platform', 'video hosting service', 'video hosting sites'],
    related: [
      'compare/wistia-alternative',
      'blog/video-hosting-glossary',
      'compare/vimeo-alternative',
      'guides/self-hosted-vs-hosted-video',
    ],
    body: `## 1. What is metered

The single biggest source of surprise invoices. Three models exist:

- **Bandwidth / egress** — cost scales with success, and a viral page is a bill.
- **Plays or views** — cost tracks audience, usually with a de-duplication rule worth reading closely.
- **Seats** — priced on your team, unrelated to your traffic. Fine for large teams, brutal for a one-person marketing function.

Videokr meters de-duplicated plays (once per video per month) and never bills bandwidth: 500 plays free, 10,000 a month for a one-off $69, $1 per extra 10,000 on paid plans. See [plans and limits](/docs/plans-and-limits).

## 2. Branding

Can every trace of the vendor be removed — badge, end-screen suggestions, share menu? Check this on the tier you intend to buy, not the top one.

## 3. Embeds

Does the embed work on any site, or only inside one CMS? A plugin-only solution ties your video to that platform forever. Ask for both an iframe and a script embed.

## 4. Analytics depth

Play counts are table stakes. What changes decisions is a per-video retention curve, plus referrer and device splits, and CTA/lead attribution. Ask whether the curve is per video or an account average.

## 5. Access control

Unlisted, password, domain-locked embeds, expiring links. And ask the honest version of the question: is this access control, or DRM? Almost always the former — plan accordingly.

## 6. Integrations

Webhooks with a verifiable signature beat a fixed list of native integrations, because they cover the tool you will use next year. Check for an API key model with revocation, and a CMS plugin if you live in WordPress.

## 7. Exit

Can you export videos, leads and analytics? Do embed URLs survive a plan change? A platform that makes leaving hard is telling you something about its confidence.

## A short scoring exercise

Write down your worst realistic month — plays and number of sites — and price every candidate against that, not against today. Then check the one feature you would miss most if the free tier hid it: for most people that is either unbranding or the retention curve.

Comparisons: [vs Wistia](/compare/wistia-alternative), [vs Vimeo](/compare/vimeo-alternative), [vs Vidyard](/compare/vidyard-alternative), [vs YouTube](/compare/youtube-alternative).`,
    faqs: [
      {
        q: 'What is the cheapest way to host marketing video?',
        a: 'A per-play or one-time plan on a platform that does not meter bandwidth, or self-hosting if you already run a CDN and can absorb the engineering time.',
      },
      {
        q: 'Does free video hosting exist?',
        a: 'Yes, with limits worth reading: play or bandwidth caps, and usually the vendor’s badge on the player. Videokr’s free plan allows 500 plays a month and 5 videos, with one small badge.',
      },
    ],
  },
];
