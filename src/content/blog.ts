import type { ContentPage } from './types';

/**
 * The blog carries opinion and method. Hard rule: no invented statistics, no
 * borrowed "industry average" figures we cannot stand behind, and no invented
 * customers. Where a number appears it is either our own pricing or arithmetic
 * the reader can redo.
 */
export const blogPages: ContentPage[] = [
  {
    slug: 'video-seo-checklist',
    title: 'A video SEO checklist you can finish this afternoon',
    metaTitle: 'Video SEO checklist — 18 things that matter',
    description:
      'Eighteen concrete checks for video pages: indexable page per video, VideoObject data, crawlable thumbnail, transcript, chapters, sitemap, and the traps.',
    answer:
      'Work through it in order: one indexable page per video, VideoObject structured data matching the visible page, a crawlable thumbnail, a transcript, chapters as Clip key moments, a video sitemap containing public pages only, and an embed that does not wreck your Core Web Vitals. Most video pages fail on the thumbnail or the sitemap, not on anything exotic.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['video seo', 'video seo optimization', 'video sitemap', 'videoobject'],
    related: ['guides/video-seo', 'guides/video-chapters', 'blog/ai-search-and-video'],
    body: `## Structure

1. Each video has its own page at a stable URL.
2. That page is indexable — no stray \`noindex\`, no login wall.
3. The video is the main content of the page, not a decoration in a sidebar.
4. There is real text: a summary, a transcript, and links to related content.
5. The page has one \`<h1>\`, and headings that describe the content rather than the layout.

## Structured data

6. A \`VideoObject\` with \`name\`, \`description\`, \`thumbnailUrl\`, \`uploadDate\`, \`duration\`, \`embedUrl\` and/or \`contentUrl\`.
7. \`name\` and \`description\` match the visible page. Markup that describes a different video is a violation, not a shortcut.
8. Chapters emitted as \`hasPart\` \`Clip\` entries with start and end offsets.
9. A \`SeekToAction\` so a result can deep-link a moment.
10. A \`BreadcrumbList\` so the result shows where the page sits.

## Assets

11. The thumbnail is publicly fetchable — not behind auth, not blocked in robots. A blocked thumbnail disqualifies the video.
12. The thumbnail is a real 16:9 image, sized for a card, and legible small.
13. Captions exist as WebVTT, and the transcript is in the HTML rather than injected after a click.

## Discovery

14. A video sitemap lists every public video page with \`video:thumbnail_loc\`, \`video:title\`, \`video:description\`, \`video:player_loc\` and \`video:publication_date\`.
15. Unlisted and password-protected pages appear in no sitemap. This is the most common leak.
16. \`robots.txt\` allows the media and thumbnail paths the video needs.

## Performance

17. The embed is lazy and has a reserved shape (\`aspect-ratio\`, or width/height), so it costs no layout shift.
18. The page does not autoplay with sound, and does not load a heavyweight third-party player above the fold.

## The traps

- **Ten videos on one page.** Search engines pick one to feature; the rest are decoration. If each video deserves visibility, each deserves a page.
- **Duplicating a YouTube description as the page text.** Thin, and it competes with the YouTube page that will usually win.
- **Chapter titles as section numbers.** "Part 3" is not a query anyone types.
- **Markup that lies.** A duration or upload date that does not match the file is worse than no markup.

Videokr does numbers 1, 2, 6–10, 14, 15 and 17 automatically on every public video page — see [video SEO](/guides/video-seo) for the reasoning and [chapters](/guides/video-chapters) for the key-moment part.`,
    faqs: [
      {
        q: 'How long until video structured data shows up in search?',
        a: 'It varies and it is never guaranteed. Structured data makes a page eligible for video treatment; whether and when it appears is a ranking decision, not a switch you flip.',
      },
    ],
  },
  {
    slug: 'video-conversion-benchmarks',
    title: 'Why video "benchmarks" mislead — and what to measure instead',
    metaTitle: 'Video benchmarks are misleading — measure this instead',
    description:
      'Published average watch times and conversion lifts are measured on other people’s content and audiences. Here is the internal baseline to build instead.',
    answer:
      'Published video benchmarks compare your video to an unknown mix of content lengths, audiences and traffic sources, so they cannot tell you whether your video is good. Build an internal baseline instead: play rate, retention at 50%, completion and CTA click-through per video, compared against your own median and against the previous cut of the same video.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['video engagement', 'video analytics', 'video conversion rate', 'video watch time'],
    related: ['guides/video-analytics', 'docs/analytics', 'guides/video-landing-page'],
    body: `## The problem with the published number

You have seen the format: "the average marketing video retains X% of viewers". Ask three questions of any such figure and it usually collapses.

- **Which videos?** A ten-second loop and a forty-minute webinar in one average is not a benchmark, it is a coin flip.
- **Which traffic?** Retention on an autoplaying hero and on a video someone deliberately clicked from a newsletter are different phenomena.
- **Which definition?** A "view" can be three seconds, or an impression, or a de-duplicated play. Vendors do not agree, and the difference can be several fold.

Even when the number is honest, it is an average of strangers. It cannot tell you whether to re-cut your demo.

## The baseline worth having

For each video, four numbers, tracked over time:

| Number | Question it answers |
| --- | --- |
| Play rate | Is the thumbnail and placement earning a start? |
| Retention at 50% | Does the middle hold? |
| Completion | Is the length honest? |
| CTA click-through | Did the watch turn into intent? |

Then two comparisons, and only these two:

1. **This video against your own median** for the same kind of video.
2. **This cut against the previous cut** of the same video, on comparable traffic.

## Why the second comparison is the valuable one

It controls for everything a benchmark cannot: your audience, your traffic source, your product's complexity. Cut the intro, publish, wait for a similar number of plays, compare the curve. That is a real experiment, and it takes a week.

## Sample size, briefly

Do not re-cut a video on thirty plays. Wait until the two curves you are comparing are built from a similar and non-trivial number of plays — a few hundred is enough to see a cliff move; a dozen is noise. And compare like traffic with like: a spike from one newsletter is a different audience.

## The number nobody publishes

The one that decides budgets: leads per hundred plays. It combines everything above and is specific to you. With [per-video plays, retention and lead attribution](/docs/analytics) it takes one glance, and it is the only "benchmark" that should change what you do next.`,
    faqs: [
      {
        q: 'Is there a good average completion rate for video?',
        a: 'Not one that transfers. Completion depends mostly on length and traffic source; compare a video against your own others and against its previous cut.',
      },
    ],
  },
  {
    slug: 'anatomy-of-a-product-demo',
    title: 'The anatomy of a product demo video that gets watched',
    metaTitle: 'Product demo video structure',
    description:
      'The first five seconds, the one-thing rule, where to show price, how long to run, and the end screen — the structure that survives contact with real retention curves.',
    answer:
      'Open on the outcome in the first five seconds, show one workflow end to end rather than a feature tour, keep it under two minutes for a cold audience, chapter it if it must run longer, and end on a single action. Demos die from a slow open and from trying to cover everything.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['product demo video', 'video landing page', 'saas demo video'],
    related: ['guides/video-landing-page', 'guides/video-chapters', 'blog/how-we-filmed-our-product-film'],
    body: `## Second zero to five

No logo animation. No "hi, I'm…". Show the finished result — the thing the viewer wants — and say what it is. Retention curves are brutal about this: the cliff in the first ten percent is almost always an intro nobody needed.

## The one-thing rule

A demo should show one workflow all the way through, not nine features for twenty seconds each. A viewer who understands one complete thing believes the product works. A viewer shown nine fragments remembers none of them.

Choose the workflow that is both quick and commercially decisive. For a video platform that is upload → brand → embed → see the retention curve, not the settings screen.

## Real data, always

Empty states and \`Lorem ipsum\` read as vapour. Populate the account with plausible content before recording. If the numbers on screen are real, say so; if they are seeded for the demo, do not pretend otherwise on screen.

## Length

Under two minutes for a cold audience. If it must run longer, [chapter it](/guides/video-chapters) so a viewer can jump, and expect the retention curve to show which chapter was optional.

## Sound and captions

Narration beats on-screen text for pace, but the majority of first-touch views happen with sound off — so caption everything. Cue lines short, two lines maximum, so a wrapped caption never covers the interface you are demonstrating.

## Annotations

Callouts should point at the thing being talked about, at the moment it is talked about, and then leave. Two rules learned the hard way while making our own film: keep them clear of the control bar, and keep them clear of the caption line — otherwise they collide exactly where the viewer is reading.

## The end

One action. Not three. If the video earned the click, the end screen should be the shortest possible path to it, and the [in-player CTA](/docs/ctas-and-lead-forms) should appear right after the payoff for the majority who will never reach the end.

## Then read the curve

Publish, wait, and open the [retention curve](/docs/analytics). Every structural claim above is testable on your own footage in a week, which is the only reason to believe any of it.

Ours is public if you want to see the structure applied: [the Videokr product film](/v/videokr-the-product-film).`,
    faqs: [
      {
        q: 'How long should a SaaS demo video be?',
        a: 'Under two minutes for a page-level demo aimed at a cold audience. Longer, chaptered versions belong in onboarding or documentation.',
      },
    ],
  },
  {
    slug: 'why-plays-not-bandwidth',
    title: 'Why we meter plays, not bandwidth',
    metaTitle: 'Why Videokr meters plays instead of bandwidth',
    description:
      'Bandwidth pricing punishes success and cannot be predicted by a customer. Per-play pricing can be reasoned about before you publish. Here is the arithmetic.',
    answer:
      'Bandwidth billing means a customer cannot know what a video will cost until after it succeeds, and a page that goes viral produces an invoice instead of a celebration. Videokr meters plays instead — de-duplicated once per video per month — so the cost of publishing is knowable in advance, and bandwidth is never billed on any plan.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['video hosting bandwidth', 'video hosting pricing', 'video hosting cost'],
    related: ['docs/plans-and-limits', 'guides/best-video-hosting', 'compare/hosted-vs-self-hosted-video'],
    body: `## What bandwidth pricing asks of you

To predict your bill on a per-gigabyte plan you need: the file's bitrate, the average share of the video watched, the mix of renditions served, and how many people will watch — before publishing. Nobody has those four numbers in advance. So the honest description of egress pricing is: an unknown multiplied by your success.

It also creates a perverse incentive. The better your video does, the more it costs, so a marketing team learns to keep videos short and low quality for reasons that have nothing to do with the audience.

## What per-play pricing asks

One number: how many people will start the video. Marketers estimate that every day, because it is the same estimate as page views.

## The de-duplication rule matters more than the price

A "play" only means something if the definition is tight. Ours: one viewer starting one video, counted **once per video per calendar month**. Consequences:

- Your own testing does not eat the allowance.
- A visitor who reloads five times is one play.
- A viewer who returns weekly for a month is one play.
- Impressions — the player loading, nobody pressing play — are reported and never billed.

Watch for the opposite pattern when comparing vendors: a "view" defined as three seconds of playback, counted every time, on a page with autoplay, inflates a number you are billed on.

## The arithmetic

At $1 per 10,000 extra plays, a page that unexpectedly does ten times its usual traffic — 100,000 plays in a month instead of 10,000 — costs $9 more. On an egress plan, 100,000 plays of a 50 MB video is measured in terabytes, and the invoice is a conversation with your finance team.

## What we give up

Being fair about it: per-play pricing subsidises long, high-bitrate video and slightly penalises very short clips. A customer with one 20-second loop watched 10,000 times pays the same as one with a ten-minute lesson watched 10,000 times, although the second costs us far more to deliver. We accept that because predictability is worth more to a customer than perfect cost attribution.

See [plans and limits](/docs/plans-and-limits) for the exact numbers, and [how to choose a platform](/guides/best-video-hosting) for the questions to ask anyone else.`,
    faqs: [
      {
        q: 'Does Videokr charge for bandwidth?',
        a: 'No — no plan meters bandwidth. Starter and Lifetime charge only for de-duplicated plays above their allowance, while Agency has no play limit.',
      },
      {
        q: 'How is a play counted?',
        a: 'One viewer starting one video, counted once per video per calendar month. Reloads and rewatches within the month are not counted again.',
      },
    ],
  },
  {
    slug: 'how-we-filmed-our-product-film',
    title: 'How we filmed our product film inside our own product',
    metaTitle: 'How we made the Videokr product film',
    description:
      'Two minutes, eight chapters, real footage of the real product, hosted on the platform it demonstrates — the script, the annotation rules and what we got wrong.',
    answer:
      'We recorded the real product rather than a mock-up, scripted it shot by shot before recording, cut it to about two minutes with eight chapters, added captions and orange annotations, and published it on Videokr itself so the landing page demo is also a live example of the player, the chapters and the CTA.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['product film', 'saas demo video', 'product video production'],
    related: ['blog/anatomy-of-a-product-demo', 'guides/video-landing-page', 'docs/chapters-and-captions'],
    body: `## The constraint we set

No placeholder footage, no stock, no mock-ups. Every frame is the shipped product, with a populated account behind it — real uploads, real plays, real leads — because an empty dashboard is the least convincing thing a software video can show.

## Script before capture

The film was written shot by shot first: what is on screen, what the narration says, what the annotation points at. Writing it that way exposed two features that took too long to explain and were cut before a single frame was recorded — cheaper than discovering it in the edit.

## Structure

About two minutes, eight [chapters](/docs/chapters-and-captions). The first twelve seconds carry the whole pitch, because most viewers only give you that. The chapters exist so the minority who want the analytics section can jump to it and skip the upload flow.

## Annotations, and two rules we learned by breaking them

Orange callouts point at the thing being narrated. Both problems we hit were collisions:

1. Pills drifted over the player's own control bar, so the demo looked like it had unclickable buttons.
2. Pills sat where the caption line renders, so at exactly the moment a sound-off viewer was reading, the text was covered.

Fixes: keep annotations in the upper two thirds, and treat the caption band as reserved space. The same applies to an end-screen CTA — ours had to be inset so it did not cover the CC and picture-in-picture buttons.

## Captions

Written, not auto-generated and left alone: product names are exactly what automatic transcription gets wrong, and they are the words that matter most in a product film.

## Hosted on the thing it demonstrates

The film plays on the landing page through Videokr, with its own [public page](/v/videokr-the-product-film), chapters, captions, CTA and email form. That is partly self-respect and partly the most useful test we have: every player defect we have shipped since was found on our own film first.

## What we would do differently

Record the analytics section last. It needs a populated account, and populating an account convincingly takes longer than filming everything else combined.`,
    faqs: [
      {
        q: 'Where can I watch the Videokr product film?',
        a: 'On the home page, or on its own public page at /v/videokr-the-product-film — hosted on Videokr, with chapters, captions and a CTA.',
      },
    ],
  },
  {
    slug: 'five-embed-mistakes',
    title: 'Five video embed mistakes that cost you conversions',
    metaTitle: 'Five video embed mistakes to fix today',
    description:
      'Fixed-height iframes, eager loading, autoplay with sound, no captions and a dead end screen — each with the two-line fix.',
    answer:
      'The five that appear on almost every audit: a fixed-height iframe that causes layout shift, an eagerly loaded player above other content, autoplay with sound that browsers block, no captions for the sound-off majority, and an end screen that does nothing. All five are minutes of work to fix.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['video embed code', 'embed video on website', 'core web vitals video'],
    related: ['guides/embed-video-on-website', 'docs/embeds', 'blog/video-seo-checklist'],
    body: `## 1. Fixed height, no reserved shape

\`width="560" height="315"\` on a responsive page produces either a letterboxed player or a shifting layout. The fix:

\`\`\`html
<iframe src="…" style="width:100%;aspect-ratio:16/9;border:0" loading="lazy"></iframe>
\`\`\`

Layout shift is a ranking signal and, more importantly, it makes people mis-click.

## 2. Eager loading

An embed without \`loading="lazy"\` competes with your hero image and your fonts for the same bytes. A player below the fold should cost nothing until it is scrolled to. Add the attribute; it is supported everywhere that matters.

## 3. Autoplay with sound

Browsers block it. Your visitor either hears nothing (so your "autoplay" is a still frame with no play affordance) or, worse, hears it on a page where they did not expect audio. Muted autoplay plus a visible unmute, or a click to start.

## 4. No captions

Most social and mobile viewing happens with sound off. A video without captions is a silent film to a large share of its audience, and its words are invisible to search engines and assistants. Upload a WebVTT track — see [chapters and captions](/docs/chapters-and-captions).

## 5. An end screen that does nothing

The frame freezes, or — on a third-party embed — fills with other people's videos. The most engaged moment of your page, spent. Put one action there: [end screens and CTAs](/docs/ctas-and-lead-forms).

## Bonus: no title on the iframe

\`<iframe title="Product tour">\`. Without it, screen readers announce "iframe" and the frame is a dead end.

## A five-minute audit

1. Load the page on a phone. Does anything jump?
2. Scroll fast past the video. Did the page stall?
3. Turn the sound off. Is it comprehensible?
4. Let it finish. Does anything happen?
5. Tab into the player. Can you operate it from the keyboard?

Any "no" is a fix worth more than a redesign.`,
    faqs: [
      {
        q: 'Does a video embed hurt Core Web Vitals?',
        a: 'Only if it is eager or has no reserved shape. A lazy iframe with an aspect-ratio box costs almost nothing until the viewer engages with it.',
      },
    ],
  },
  {
    slug: 'ai-search-and-video',
    title: 'AI search and video: what actually makes a page quotable',
    metaTitle: 'AI search, GEO and AEO for video pages',
    description:
      'Answer engines quote text, fetch cheaply and prefer stable URLs. What that means for video pages — and what nobody can promise you.',
    answer:
      'Assistants quote text, so a video page becomes citable through its transcript, an answer-first opening paragraph, question-shaped headings and structured data — plus being fetchable: a plain-text alternate, permissive robots rules for the crawlers you want, and a stable URL. No technique guarantees a citation, and any vendor promising one is guessing.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['ai seo', 'answer engine optimization', 'generative engine optimization', 'video seo'],
    related: ['guides/video-seo', 'blog/video-seo-checklist', 'docs/chapters-and-captions'],
    body: `## The mechanic, stated plainly

An answer engine needs text it can lift, attributed to a URL it can cite. A video is opaque to that process unless the page around it carries the same information in words. Everything below follows from that single fact.

## What helps

- **A transcript in the HTML.** The highest-value thing on a video page for this purpose. Not behind a tab that renders empty, not lazily fetched.
- **An answer-first paragraph.** The first paragraph should answer the page's question completely, in two or three sentences, without requiring the rest of the page. It is also better for humans.
- **Question-shaped headings.** \`## How is a play counted?\` is quotable; \`## Metering\` is not.
- **Specific, checkable claims.** "500 plays a month on the free plan" survives being quoted. "Powerful analytics" does not.
- **Structured data** that matches the visible text — \`VideoObject\`, \`FAQPage\` only where the FAQ is actually on the page, \`BreadcrumbList\`.
- **A plain-text alternate.** Videokr serves \`/llms.txt\`, \`/llms-full.txt\` and a \`.md\` twin of every public video page, linked with \`rel="alternate"\`.
- **Fetchability.** Explicit robots rules for the assistant crawlers you want, and a thumbnail and media path that are not blocked.
- **Stability.** A cited URL that later 404s is worse than never being cited.

## What does not help

- Keyword-stuffed pages. Reads badly to a person and adds nothing to a model's summary.
- Cloaking — serving crawlers different text. This is a policy violation with an ordinary penalty attached.
- Mass-produced near-duplicate pages. Both search engines and assistants deduplicate.
- Marking up an FAQ that is not visible on the page.

## Measuring it

Ordinary rankings and assistant citations are different signals, and they need separate measurement:

- Referrals from assistant hosts in your analytics (they arrive as ordinary referrers).
- Ask the assistants your own questions periodically and record whether you are cited. Tedious, but it is real evidence.
- Server logs for the AI crawler user agents — being fetched is a precondition for being cited.

## The honest limit

Nobody controls what a model says. You can be accurate, quotable, fetchable and stable — which is exactly what a good ordinary page is. Anyone selling guaranteed AI visibility is selling the same thing guaranteed-ranking vendors sold a decade ago.

See [video SEO](/guides/video-seo) for the search side, and [the checklist](/blog/video-seo-checklist) for the page-level version.`,
    faqs: [
      {
        q: 'Can you guarantee my page gets cited by ChatGPT or Perplexity?',
        a: 'No, and neither can anyone else. You can make a page accurate, quotable, fetchable and stable, which are the preconditions for being cited.',
      },
      {
        q: 'Does a transcript really matter for AI search?',
        a: 'It is the single biggest factor on a video page, because it is the only place the video’s own words exist as text.',
      },
    ],
  },
  {
    slug: 'thumbnail-testing',
    title: 'Test the thumbnail before you re-cut the video',
    metaTitle: 'Video thumbnail A/B testing',
    description:
      'Play rate is decided by the poster frame, and it is the cheapest experiment on the page. How to run the test and what to test.',
    answer:
      'If a video underperforms, test the thumbnail first: play rate is plays divided by impressions, and the poster frame decides it before anyone has seen a second of your edit. Two variants, one meaningful difference, run until each has a few hundred impressions, keep the winner.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['video thumbnail', 'video play rate', 'thumbnail ab test'],
    related: ['guides/video-analytics', 'guides/video-landing-page', 'docs/player'],
    body: `## Why the thumbnail first

Re-cutting a video is a day. Swapping a thumbnail is a minute. And the two metrics are cleanly separated:

- **Play rate** — a thumbnail, placement and headline problem.
- **Retention** — an edit problem.

If nobody presses play, nothing about your edit matters yet.

## What to test

One meaningful difference per test, not a redesign:

- **Product doing the thing** versus a person's face.
- **Text on the thumbnail** versus none — and if text, three or four words, legible at 320px.
- **The end state** (the finished result) versus the starting state.
- **A high-contrast frame** versus a dark or busy one.

## How to run it

1. Two variants, split by impressions on the same placement.
2. Wait until each variant has a few hundred impressions. Ten plays is not a result.
3. Compare play rate, not plays — traffic is never split perfectly evenly.
4. Keep the winner, and note *why* you think it won; the pattern usually transfers to your next video.

Videokr supports A/B thumbnails per video and reports play rate per variant alongside the rest of the [analytics](/docs/analytics).

## Frames that reliably lose

- A random mid-sentence frame of a talking head, mouth half open.
- A slide of bullet points.
- A logo.
- Anything unreadable as a small card in a dark-mode page.

## When the thumbnail is not the problem

If play rate is healthy and retention falls off a cliff in the first ten percent, the thumbnail is writing a cheque the video does not honour. That is the one case where a great thumbnail is a warning rather than a win — and the fix is the opening of the video, not the image.`,
    faqs: [
      {
        q: 'How many impressions do I need to call a thumbnail test?',
        a: 'Enough that a few percent difference is not noise — a few hundred impressions per variant is a practical floor for a marketing page.',
      },
    ],
  },
  {
    slug: 'video-for-agencies',
    title: 'Running client video without hosting it yourself',
    metaTitle: 'Video hosting for agencies and client sites',
    description:
      'A workflow for agencies: one platform account, domain-locked embeds per client site, per-video reporting to show, and no video bytes on client hosting.',
    answer:
      'Keep the video in one platform account you control, embed it into each client site with domain-locked embeds, and report from per-video retention and lead numbers. Client hosting then serves no video bytes, a client site redesign cannot break the player, and handover is a matter of moving one account rather than migrating files.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['video hosting for agencies', 'client video', 'white label video'],
    related: ['docs/privacy', 'docs/wordpress-plugin', 'docs/plans-and-limits'],
    body: `## The problem with per-client hosting

Video uploaded into each client's WordPress means: their bandwidth, their upload limits, their backups, and a separate blind spot per site. You cannot answer "which video works" across a portfolio, and every new site starts from zero.

## The workflow that scales

1. **One account, projects per client.** Videos grouped by client, so a handover is a scoped export rather than an archaeology exercise.
2. **[Domain-locked embeds](/docs/privacy)** per client site, wildcards for staging (\`*.staging.example.com\`). A leaked embed code plays nowhere else.
3. **Unbranded player** on paid plans, styled to each client's accent colour and radius — the player reads as theirs, not as a vendor widget or yours.
4. **The [WordPress plugin](/docs/wordpress-plugin) per site**, with one API key each so you can revoke a single site without touching the others.
5. **Reporting from per-video analytics** — plays, retention, CTA click-through and leads — which is the artefact clients actually value at the monthly call.

## What this costs

Agency is $29/month or $290/year for unlimited plays and unlimited videos, with no overage and no bandwidth meter. For most agency portfolios that is a rounding error against a single client's monthly retainer, and it is a simple number you can quote in a proposal.

## Handover

Decide the story before you sign: either the client gets their own account and you rebuild the embeds there, or the videos stay with you as a service. Both are legitimate; the failure mode is not deciding, and discovering the question at the end of the engagement.

## What to promise clients

- No video bytes on their hosting.
- Consistent playback on any platform they later migrate to — the embed is plain HTML.
- Retention and lead numbers per video, monthly.
- No promises about search or AI visibility. See [AI search and video](/blog/ai-search-and-video) for why guarantees in this area are not honest.`,
    faqs: [
      {
        q: 'Can one account serve several client sites?',
        a: 'Yes. Group videos per client, domain-lock each embed to that client’s hostnames, and use a separate API key per WordPress site so any one site can be revoked alone.',
      },
    ],
  },
  {
    slug: 'course-video-hosting',
    title: 'Hosting course video without a course platform',
    metaTitle: 'Course video hosting — lessons, access and analytics',
    description:
      'How to host paid lesson video on your own site: playlists per module, password or domain-locked embeds, and retention curves that show which lesson loses people.',
    answer:
      'Host each lesson as its own video, group modules as playlists, and protect them with a password or a domain-locked embed inside your members’ area — then use per-lesson retention curves to find the lesson that loses students. You do not need a course platform to deliver video; you need controlled embeds and per-video analytics.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['course video hosting', 'private video sharing', 'membership video'],
    related: ['guides/password-protect-video', 'docs/playlists', 'docs/privacy'],
    body: `## Structure

- **One video per lesson.** Not one file per module: per-lesson retention is the whole point.
- **A [playlist](/docs/playlists) per module**, embedded once on the module page with the queue beside the player.
- **Chapters within long lessons** so a returning student can find the part they need.

## Access

Two mechanisms, usually together:

1. **Domain-locked embeds** — the lesson plays only on your members' hostnames, so a copied embed code is worthless.
2. **Password or token** for anything shared as a link rather than embedded.

Say the honest thing to yourself: this stops casual sharing, not screen recording. Price and support your course as though a determined student can copy it, because they can. See [private video](/docs/privacy).

## What analytics tell you about a course

More than a completion certificate does:

- The lesson with a cliff in its first minute has a bad opening, not bad students.
- The lesson people rewind (a bump upward in the [retention curve](/docs/analytics)) went too fast — usually a screen with commands or code on it.
- The lesson people never start is either misnamed or in the wrong place in the module.

## Delivery mechanics

- Long lessons: host the master where it already lives and [link it as HLS](/docs/sources) so mobile students get adaptive quality.
- Captions on every lesson. Non-native speakers rely on them more than anyone.
- No autoplay between lessons; students hate losing their place.
- Fixed 200 MB per upload — a real limit for hour-long lessons, and the reason linking is the usual pattern for a full course.

## Cost shape

Per-play metering suits courses well: a cohort of two hundred students working through twelve lessons in a month is at most 2,400 plays, well inside a 10,000-play plan — and a student re-watching lesson three all month adds nothing, because plays are de-duplicated per video per month. See [plans and limits](/docs/plans-and-limits).`,
    faqs: [
      {
        q: 'Can I stop students sharing course videos?',
        a: 'You can make it pointless to share links or embeds — domain locking and passwords — but no hosted player prevents screen recording. Plan for that rather than paying for the illusion.',
      },
      {
        q: 'How many plays does a course use?',
        a: 'One per lesson per student per month, because plays are de-duplicated per video per calendar month. Re-watching within the month adds nothing.',
      },
    ],
  },
  {
    slug: 'video-page-speed',
    title: 'Keeping video off your critical path',
    metaTitle: 'Video and page speed — practical fixes',
    description:
      'How to have video on a fast page: lazy embeds, a reserved box, a poster instead of a player until click, and what to preload (almost nothing).',
    answer:
      'Do not mount a player until it is needed: render a poster image in a correctly-shaped box, load the player on intersection or click, keep the iframe lazy, and preload nothing beyond metadata. A video page can score as well as a text page — the cost comes from eager players and unreserved space, not from the video itself.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['video page speed', 'core web vitals video', 'lazy load video'],
    related: ['blog/five-embed-mistakes', 'guides/embed-video-on-website', 'docs/embeds'],
    body: `## The three costs

1. **Layout shift** when the player appears in space that was not reserved.
2. **Bytes** for a player nobody used.
3. **Main-thread time** for scripts a visitor who never pressed play did not need.

All three are avoidable without giving up the video.

## Reserve the box

\`\`\`html
<div style="aspect-ratio:16/9;width:100%">…</div>
\`\`\`

Do this at the outermost element, not on the iframe alone, so the space exists during the very first paint. This is the single highest-leverage fix, and it is one line.

## Poster first, player later

For an above-the-fold hero, render an \`<img>\` poster inside that box with a real button over it, and mount the player on click or on intersection. Details that matter:

- The poster is a modern format (WebP/AVIF) with \`width\` and \`height\` set.
- Above-the-fold posters are the one thing worth prioritising — a lazy hero image is a slow hero image.
- The button is a real \`<button>\`, so keyboard users and screen readers can start the video.

## Keep the embed lazy

\`loading="lazy"\` on every iframe below the fold. And do not \`preload\` video: \`preload="metadata"\` on a native element is the ceiling, \`auto\` on a page with several videos downloads megabytes speculatively.

## Third-party weight

A social-platform embed brings its own framework, its own cookies and its own domains, and you cannot trim it. A first-party player you configure is smaller by construction, which is one of the less-discussed reasons to move money-page video off a public platform.

## Fonts, motion, and the rest of the page

While you are here: self-host fonts with metric-matched fallbacks so the text does not reflow, and honour \`prefers-reduced-motion\` in any player animation. Both are small and both show up in the same audit as the video.

## Verify, do not assume

Run the page in a lab tool before and after, on mobile emulation, and check the layout-shift number specifically — that is the one video breaks. Then load it on a real phone and scroll fast past the video: if the page stalls, something is still eager.`,
    faqs: [
      {
        q: 'Does embedding video slow down a page?',
        a: 'Only if the player is eager or the box is unreserved. A poster image plus a player mounted on click costs almost nothing until the visitor engages.',
      },
    ],
  },
  {
    slug: 'video-hosting-glossary',
    title: 'Video hosting glossary: the terms vendors use differently',
    metaTitle: 'Video hosting glossary — plays, views, egress, HLS',
    description:
      'Plain definitions of play, view, impression, egress, HLS, transcoding, retention curve, domain lock and badge — and where vendors disagree.',
    answer:
      'The words that cost money are the ones vendors define differently: a "view" can mean three seconds of playback or an impression, "bandwidth" can be metered or included, and "unlimited" is usually bounded by fair-use terms. This glossary gives plain definitions and flags where to read the fine print.',
    updated: '2026-08-18',
    published: '2026-08-18',
    keywords: ['video hosting terms', 'video streaming glossary', 'what is a video play'],
    related: ['docs/plans-and-limits', 'guides/best-video-hosting', 'blog/why-plays-not-bandwidth'],
    body: `## Play

A viewer starting a video. **Read the de-duplication rule**: Videokr counts one play per video per viewer per calendar month, so reloads and rewatches do not add up. Some vendors count every start.

## View

The word to be most careful with. It can mean a play, a play of at least N seconds, or an impression. If a plan is priced on views, ask for the definition in writing.

## Impression

The player loaded on a page, whether or not anyone pressed play. Useful as the denominator of play rate. Videokr reports impressions and never bills them.

## Play rate

Plays ÷ impressions. A thumbnail-and-placement metric. See [thumbnail testing](/blog/thumbnail-testing).

## Retention curve

The share of viewers still watching at each point in the runtime — Videokr uses a hundred buckets per video. An average watch time is a summary of this curve, and it hides the shape.

## Egress / bandwidth

Bytes delivered to viewers. Metered by most CDNs and some video platforms; not metered by Videokr on any plan. This is the line item that scales with success. See [why we meter plays](/blog/why-plays-not-bandwidth).

## Transcoding

Converting a master into several renditions so playback can adapt to a viewer's connection. Free with a hosted platform; a pipeline you build and pay for when self-hosting.

## HLS / DASH

Adaptive streaming formats: the video is split into segments at several bitrates, described by a manifest (\`.m3u8\` for HLS). Safari plays HLS natively; other browsers need a JavaScript player. Videokr accepts an HLS URL as a [source](/docs/sources).

## Domain lock

A rule limiting which hostnames may embed a video, so a copied embed code plays nowhere else. See [private video](/docs/privacy).

## Unlisted

A page that is reachable by link but carries \`noindex\` and appears in no sitemap. Not the same as private.

## Badge / branding

The vendor's mark on the player. Free tiers usually show one; check exactly which paid tier removes it — Videokr removes it on every paid plan and on Lifetime.

## Unlimited

Almost never literally unlimited. Look for the fair-use clause and the per-file size cap. Videokr states the specific upload limits: 200 MB per file and 5 MB per image.`,
    faqs: [
      {
        q: 'What is the difference between a play and a view?',
        a: 'A play is a viewer starting the video. "View" has no standard definition — it may include a minimum watch duration or count every start — so check how any vendor defines the unit it bills.',
      },
      {
        q: 'What is egress?',
        a: 'The bytes delivered to viewers. Most CDNs meter it; Videokr does not meter bandwidth on any plan.',
      },
    ],
  },
];
