import type { ContentPage } from './types';

/**
 * Comparison pages. Rule for every one of these: our own numbers are stated
 * exactly, and anything about another product is limited to what is structurally
 * true and publicly documented, with the reader told to check current pricing at
 * the source. No invented figures, no invented quotes, no fake verdicts.
 */
const FAIRNESS = `## How to read this page

Videokr's own numbers here are exact. Everything about the other product is limited to how it is structured — what it hosts, where it plays, what it prices on — because feature lists and prices change without notice and we will not print a number for someone else's product that might be stale by the time you read it. Check their current pricing page before you decide, and try both free tiers: that is a better comparison than any table written by a vendor.`;

export const comparePages: ContentPage[] = [
  {
    slug: 'wistia-alternative',
    title: 'Videokr as a Wistia alternative',
    metaTitle: 'Wistia alternative — Videokr compared',
    description:
      'A cheaper hosted video platform with the parts that matter: branded player, in-video email capture, per-video retention curves and embeds that work anywhere.',
    answer:
      'People look for a Wistia alternative when they need the same three things — a branded hosted player, in-video lead capture and per-video retention analytics — without a monthly platform bill sized for a marketing team. Videokr provides those on a free plan, a $69 one-time Lifetime plan, or metered plans, and meters de-duplicated plays rather than bandwidth or seats.',
    updated: '2026-08-18',
    keywords: ['wistia alternative', 'wistia competitor', 'video marketing platform'],
    related: ['guides/best-video-hosting', 'compare/vidyard-alternative', 'docs/plans-and-limits'],
    body: `## Why people look

Wistia is a well-established video marketing platform and it is genuinely good at what it does. The searches that lead here are almost always about cost shape and scope: a small team wants the branded player, the in-video form and the retention curve, and does not want a platform subscription priced for a department.

## What Videokr gives you

- **A player with no vendor branding** on every paid plan and on Lifetime — no badge, no suggested videos, no share-to-platform menu. Skin, accent colour, radius, logo watermark and per-control toggles. See [player and branding](/docs/player).
- **In-video email capture** — timed overlays, end screens and gates that pause playback, with leads exported as CSV or pushed to a signed [webhook](/docs/webhooks-and-api) on arrival.
- **Per-video retention curves** — a hundred buckets per video, plus device, country and referrer splits and CTA click-through. See [analytics](/docs/analytics).
- **Embeds anywhere** — iframe or a one-line script, plus a free [WordPress plugin](/docs/wordpress-plugin) and an SEO-ready public page per video.
- **Access control** — unlisted, password, and domain-locked embeds with wildcards.

## Pricing shape

Videokr is metered on plays, de-duplicated once per video per month, and never on bandwidth:

| Plan | Price | Plays / month | Videos |
| --- | --- | --- | --- |
| Free | $0 forever | 500 | 5 |
| Starter | $29/year or $5/month | 10,000 | Unlimited |
| Agency | $29/month or $290/year | unlimited | Unlimited |
| Lifetime | $69 once | 10,000 forever | Unlimited |

Extra plays on Starter and Lifetime are $1 per 10,000; Agency has no play limit. There is no egress meter, so a page that unexpectedly does well does not produce a bandwidth invoice.

## Where Videokr is the wrong choice

Be honest about this before you migrate:

- You need a large-team workflow — approvals, granular roles, SSO, shared workspaces per client with separate billing.
- You depend on deep native integrations with a specific marketing-automation suite beyond what a signed webhook can drive.
- You want a video SEO/hosting vendor with a decade-long enterprise track record and procurement paperwork to match.
- You need live streaming or webinar hosting: Videokr hosts and measures recorded video, it does not run the live event.

## Migrating, practically

1. Export or download your masters.
2. Upload to Videokr (200 MB per file) or [link the file](/docs/sources) where it already lives — including HLS.
3. Rebuild chapters, CTAs and gates. This is the manual part; budget an hour for a dozen videos.
4. Swap the embed codes, then keep both live for a week and compare play counts before removing anything.

${FAIRNESS}`,
    faqs: [
      {
        q: 'Is Videokr cheaper than Wistia?',
        a: 'Videokr’s own pricing is $0 free, $29/year Starter, $29/month Agency or $69 once for Lifetime, metered on plays and never on bandwidth. Compare that with Wistia’s current published pricing for the tier you actually need.',
      },
      {
        q: 'Does Videokr have in-video forms and retention curves?',
        a: 'Yes — email gates, overlays and end screens, plus a hundred-bucket retention curve per video with device, country and referrer breakdowns.',
      },
    ],
  },
  {
    slug: 'vidyard-alternative',
    title: 'Videokr as a Vidyard alternative',
    metaTitle: 'Vidyard alternative — Videokr compared',
    description:
      'For marketing video on your own pages: hosted delivery, a branded player, in-video CTAs and retention analytics, priced per play instead of per seat.',
    answer:
      'Vidyard is built around sales video — personal recordings sent to prospects, with CRM integration. Videokr is built around marketing video that lives on your pages: hosted delivery, a branded player, in-video CTAs and email capture, per-video retention, embeddable anywhere, priced on plays rather than seats.',
    updated: '2026-08-18',
    keywords: ['vidyard alternative', 'vidyard competitor', 'video for marketing pages'],
    related: ['compare/wistia-alternative', 'guides/video-landing-page', 'docs/analytics'],
    body: `## Different jobs

The distinction is worth getting right before you compare features:

- **Sales video** — a rep records something for one prospect, sends it, and wants a notification when it is watched and a record on the deal.
- **Marketing video** — one video on a page, watched by thousands, judged on play rate, retention and leads.

Vidyard's centre of gravity is the first. Videokr does the second: [public video pages](/guides/video-seo), embeds on any site, [in-video lead capture](/docs/ctas-and-lead-forms), and a retention curve per video.

## What you get with Videokr

- Hosted delivery of an upload or a linked MP4/WebM/HLS/YouTube/Vimeo [source](/docs/sources).
- A [player](/docs/player) with no vendor branding on paid plans and Lifetime.
- Overlays, end screens and email gates; leads to CSV, email and signed webhooks.
- A hundred-bucket [retention curve](/docs/analytics) per video, with referrer, device and country splits.
- Free [WordPress plugin](/docs/wordpress-plugin), iframe and script embeds, playlists, chapters, captions.
- Access control: unlisted, password, domain-locked embeds.

## Pricing shape

Per play, de-duplicated once per video per month, with no bandwidth meter: free at 500 plays, $29/year for 10,000, $29/month with unlimited plays for Agency, or $69 once for 10,000 a month forever. Extra plays cost $1 per 10,000 on Starter and Lifetime.

Seat-based pricing is the thing to compare against your own reality: if two people manage video for a company of two hundred, per-seat pricing is usually irrelevant and per-play is cheaper; if two hundred reps each send personal videos, the opposite is true.

## Where Videokr is the wrong choice

- You want per-rep recording, screen capture and sending built in, with a per-prospect view feed.
- You need native CRM objects updated by the vendor (rather than a webhook your side consumes).
- You need enterprise procurement, SSO and role hierarchies.

## Migrating

Download masters, upload or link them in Videokr, rebuild CTAs and chapters, swap embeds, run both for a week and compare plays before you switch anything off.

${FAIRNESS}`,
    faqs: [
      {
        q: 'Can Videokr replace Vidyard for sales videos?',
        a: 'Only partly. Videokr hosts, brands and measures video and can capture emails in the player, but it does not record per-prospect sales videos or write to CRM objects itself — it delivers signed webhooks your stack can act on.',
      },
    ],
  },
  {
    slug: 'vimeo-alternative',
    title: 'Videokr as a Vimeo alternative',
    metaTitle: 'Vimeo alternative — Videokr compared',
    description:
      'When you want hosted video for a marketing site rather than a video community: branded player, in-video lead capture, retention curves and per-play pricing.',
    answer:
      'Vimeo is a video platform with a community, a showcase and a broad feature surface. Videokr is narrower on purpose: host the file, brand the player, capture emails inside it, embed it anywhere, and report where viewers dropped off — priced on de-duplicated plays with no bandwidth meter.',
    updated: '2026-08-18',
    keywords: ['vimeo alternative', 'vimeo competitor', 'video hosting alternative'],
    related: ['guides/best-video-hosting', 'docs/privacy', 'guides/password-protect-video'],
    body: `## Where the two differ structurally

- **Scope.** Vimeo covers a wide surface — hosting, creation tools, showcases, a public audience. Videokr covers hosted marketing video: player, embeds, CTAs, leads, analytics.
- **What the player is for.** A Videokr player ends on your [end screen or CTA](/docs/ctas-and-lead-forms), not on anything that points elsewhere, and carries no vendor branding on paid plans or Lifetime.
- **What is metered.** Videokr counts de-duplicated plays (once per video per month) and never bandwidth. [Linking an external file](/docs/sources) keeps the file where it already lives.

## Privacy and access control

A frequent reason for the search. Videokr offers unlisted pages (noindex, in no sitemap), password protection with short-lived tokens, and domain-locked embeds with wildcard hostnames, so a copied embed will not play elsewhere. See [private video](/docs/privacy) and the [how-to](/guides/password-protect-video). None of it is DRM, and we say so plainly.

## Marketing features

Timed overlays, banners, end screens, email gates that pause playback, A/B thumbnails, related videos, playlists, chapters, captions, transcripts — plus a hundred-bucket retention curve per video and CTA click-through, so a change to the video can be judged rather than debated.

## Pricing

| Plan | Price | Plays / month | Videos |
| --- | --- | --- | --- |
| Free | $0 forever | 500 | 5 |
| Starter | $29/year or $5/month | 10,000 | Unlimited |
| Agency | $29/month or $290/year | unlimited | Unlimited |
| Lifetime | $69 once | 10,000 forever | Unlimited |

## Where Videokr is the wrong choice

- You want an audience: a public channel, followers, a showcase people browse.
- You need live streaming or events.
- You want creation tooling — editing, stock, templates.
- You need 4K masters and hours of footage: 200 MB per upload is a marketing-video limit, though larger files can be linked.

## Migrating

Download your masters (or keep them where they are and link them), upload or link into Videokr, rebuild chapters and CTAs, swap the embed codes, and keep both live briefly to compare play counts.

${FAIRNESS}`,
    faqs: [
      {
        q: 'Can I password protect a video on Videokr like on Vimeo?',
        a: 'Yes: a password gate on the public page, plus unlisted visibility and domain-locked embeds, which stop a copied embed code from playing on another site.',
      },
      {
        q: 'Is there a bandwidth limit?',
        a: 'No. Videokr never meters bandwidth on any plan; Starter and Lifetime charge only for de-duplicated plays above their allowance, while Agency has no play limit.',
      },
    ],
  },
  {
    slug: 'youtube-alternative',
    title: 'Videokr vs a YouTube embed for business pages',
    metaTitle: 'YouTube alternative for business websites',
    description:
      'Why a YouTube embed costs you on a landing page — branding, recommendations, cookies, no CTA — and what a hosted player does instead.',
    answer:
      'A YouTube embed is free and fast, and it ends by offering your visitor somebody else’s video, carries YouTube’s branding and cookies, and gives you no CTA and no per-video retention curve you own. Use YouTube for discovery; put the video on your money pages in a player you control. Videokr hosts the file, removes all vendor branding on paid plans, ends on your CTA, and reports retention per video.',
    updated: '2026-08-18',
    keywords: ['youtube alternative for business', 'youtube embed alternative', 'video hosting youtube'],
    related: ['guides/video-landing-page', 'guides/video-seo', 'docs/sources'],
    body: `## What a YouTube embed costs on a commercial page

1. **The end state.** The video finishes and the frame fills with other people's content — sometimes a competitor's.
2. **Branding.** The logo, the title bar, the channel link. It reads as a third-party widget, because it is one.
3. **Cookies and privacy review.** An embed that sets third-party cookies is a conversation with whoever owns your privacy policy.
4. **No CTA layer.** No overlay at the payoff, no email gate, no end screen of yours.
5. **Attribution of the ranking.** A video result generally credits the YouTube watch page, not your site.
6. **Weight.** A YouTube iframe is one of the heaviest things most marketing pages load.

## What it is genuinely good at

Distribution. YouTube is a search engine with an audience, its player is excellent, and it costs nothing. Nothing here argues for leaving YouTube — only for not using it as the player on the page where the visitor decides to buy.

## The pattern that works

- **Publish on YouTube** for reach.
- **Host the same cut on your own domain** for the landing page, pricing page and docs — branded player, [chapters](/docs/chapters-and-captions), [CTA](/docs/ctas-and-lead-forms), retention curve, and a [public video page](/guides/video-seo) that credits your site.

If you have not moved the file yet, Videokr can [wrap a YouTube URL](/docs/sources) in your player chrome with your chapters and CTAs while you plan the move — with the honest caveat that YouTube's own terms still govern the underlying stream.

## Cost comparison, honestly

YouTube is free. Videokr's free plan is $0 for 500 plays a month with one small badge; removing the badge and reaching 10,000 plays a month costs $69 once. So the real question is not free-versus-paid, it is whether owning the end screen, the CTA and the retention data on your money pages is worth that.

## What you keep either way

Your masters. Publishing in both places is normal: the same video, one copy for reach, one copy for conversion.

${FAIRNESS}`,
    faqs: [
      {
        q: 'Is it bad for SEO to host video on my own site instead of YouTube?',
        a: 'No — hosting it on your domain is what allows your page to be the video result, provided the page has VideoObject data, a crawlable thumbnail, a transcript and a sitemap entry.',
      },
      {
        q: 'Can I remove suggested videos from a YouTube embed?',
        a: 'Not reliably or permanently; the parameters that once did this have changed over time. A self-hosted player is the only durable way to control what happens when the video ends.',
      },
    ],
  },
  {
    slug: 'fluentplayer-alternative',
    title: 'Videokr vs a WordPress player plugin (FluentPlayer)',
    metaTitle: 'FluentPlayer alternative — hosted vs plugin',
    description:
      'A player plugin styles video your server still delivers. A hosted platform delivers it, works off WordPress too, and reports across every site.',
    answer:
      'FluentPlayer and similar WordPress player plugins give you a good player inside WordPress for media you host yourself — your server or bucket serves every byte, and analytics cover that one site. Videokr hosts and delivers the video, works on any site through an iframe or script embed, reports across all of them in one dashboard, and still gives WordPress a free plugin with a shortcode, block and Insights screen.',
    updated: '2026-08-18',
    keywords: ['fluentplayer alternative', 'wordpress video player plugin', 'video hosting for wordpress'],
    related: ['guides/video-hosting-for-wordpress', 'docs/wordpress-plugin', 'guides/self-hosted-vs-hosted-video'],
    body: `## The structural difference

A WordPress player plugin is code that runs in your site and plays files you provide. That means:

- **Delivery is yours.** Your host or your bucket serves the bytes, and a popular page is your bandwidth problem.
- **Reach is one platform.** The player exists where WordPress exists. A landing page on Webflow or a Shopify product page cannot use it.
- **Analytics are per site.** Whatever the plugin records, it records inside that installation.
- **Updates and conflicts are yours.** A player is JavaScript inside your theme, alongsize everything else.

A hosted platform inverts all four: the file lives on delivery infrastructure, the embed is plain HTML that works anywhere, and the analytics are central.

## What Videokr does for a WordPress site

The [free plugin](/docs/wordpress-plugin) — on every plan, including free — adds:

- \`[videokr id="vid_abc123"]\` shortcode with \`width\`, \`ratio\`, \`autoplay\`, \`muted\` and \`start\` attributes.
- A Gutenberg block with a visual picker over your library, thumbnails included.
- An **Insights** screen: plays this month against your allowance, all-time totals, a 30-day chart, most-played videos and recent leads.
- API-key connection, revocable from Videokr, one key per site.

WordPress stores one shortcode. No media in the library, no video bytes through your host, no backup bloat.

## Where a plugin is the better answer

Say it plainly:

- You want no external service in the stack, for policy or preference.
- You already pay for a CDN and bucket and are happy operating them.
- One-time site-licence pricing suits you better than any subscription, and you never need the video off WordPress.
- You need the player deeply hooked into WordPress internals — the plugin's own forms, CRM or membership integrations inside the same install.

## Where hosting wins

- The same video on WordPress, a Webflow landing page and a client's Shopify store, measured in one place.
- No bandwidth risk when a page does well.
- One [retention curve](/docs/analytics) per video across every site it appears on.
- Access control that survives a copied embed code: [domain-locked embeds](/docs/privacy).

## Running both

Perfectly reasonable: keep the plugin's player for incidental clips inside posts, and host the videos that carry commercial weight — the demo, the pricing-page explainer, the course lessons — on Videokr with CTAs and retention tracking.

${FAIRNESS}`,
    faqs: [
      {
        q: 'Does a WordPress video plugin host my video?',
        a: 'No. A player plugin plays files you host — on your own server or a bucket you pay for. The plugin is the interface, not the delivery.',
      },
      {
        q: 'Do I need the Videokr plugin to use Videokr with WordPress?',
        a: 'No. A plain iframe or script embed works in any block or theme template. The plugin adds the shortcode, the picker and the Insights screen.',
      },
    ],
  },
  {
    slug: 'hosted-vs-self-hosted-video',
    title: 'Hosted video platform vs self-hosting: the decision',
    metaTitle: 'Hosted video vs self-hosted — decision guide',
    description:
      'A decision table for teams weighing a bucket-plus-CDN setup against a hosted video platform, including the hybrid that usually wins.',
    answer:
      'Self-host when video is incidental, you already run a CDN, and nobody needs retention data. Use a hosted platform when the video has a commercial job to do — because transcoding, adaptive streaming, access control, a branded player and a retention pipeline are a small platform to build and maintain, not a task.',
    updated: '2026-08-18',
    keywords: ['self hosted video', 'hosted video platform', 'video cdn'],
    related: ['guides/self-hosted-vs-hosted-video', 'docs/sources', 'docs/plans-and-limits'],
    body: `## The decision table

| Question | Self-host | Hosted platform |
| --- | --- | --- |
| Who pays per view? | You, in egress | Included; Videokr never meters bandwidth |
| Adaptive quality | You build HLS/DASH ladders | Included |
| Player and branding | You build or adopt a library | Configured |
| Retention curve per video | You build the pipeline | Included |
| In-video CTA and email capture | You build it | Included |
| Access control | Signed URLs and Origin checks you maintain | Unlisted, password, domain lock |
| Upfront engineering | Days to weeks | Minutes |
| Ongoing owner needed | Yes, permanently | No |
| Vendor dependency | None | Real — check export before you commit |

## The hybrid that usually wins

Keep masters and archive in your own storage. [Link that file](/docs/sources) — MP4, WebM or HLS — into a hosted player when it needs a page, a CTA and measurement. You pay for cheap storage where it is cheap, and pay for the marketing layer only for the videos that earn something.

## Cost, concretely

Self-hosting costs engineering time plus egress; the egress line is the one that grows with success. Videokr's cost shape is fixed and small: $0 for 500 plays a month, $69 once for 10,000 a month forever, $29/month for unlimited Agency plays, and $1 per extra 10,000 plays on Starter and Lifetime — with no bandwidth meter, so a page that does unexpectedly well costs the same as one that does not.

## Questions to ask any vendor first

1. Can I export my videos, leads and analytics, in bulk, today?
2. What exactly is metered, and how is a "view" or "play" defined?
3. Does the embed survive a downgrade?
4. What happens at the limit — does playback stop, or does it bill?

Videokr's answers: yes; de-duplicated plays, once per video per month, bandwidth never; yes; free stops until the month rolls over, paid keeps playing and accrues $1 per 10,000.

${FAIRNESS}`,
    faqs: [
      {
        q: 'Is a CDN enough to host video?',
        a: 'It handles delivery. Transcoding, adaptive manifests, posters, captions, access control and analytics are still yours to build.',
      },
    ],
  },
];
