import { Hono } from 'hono';
import type { Env } from '../lib/types';
import { escapeHtml } from '../lib/util';
import { stamp } from '../lib/assets';
import { plainText, renderMarkdown } from '../lib/markdown';
import {
  SECTIONS,
  allPages,
  page as findPage,
  relatedFor,
  section as findSection,
  type ContentPage,
  type ContentRef,
  type Section,
} from '../content';
import {
  SITE,
  baseUrl,
  breadcrumbLd,
  graphLd,
  localBusinessLd,
  organizationLd,
  webSiteLd,
} from '../lib/seo';

export const content = new Hono<{ Bindings: Env }>();

const SECTION_IDS = SECTIONS.map((entry) => entry.id).join('|');

const FONTS = `<link rel="preload" href="/fonts/figtree-400-800-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="${stamp('/fonts/fonts.css')}">
<link rel="icon" href="/brand/mark-32.png" sizes="32x32">
<link rel="apple-touch-icon" href="/brand/mark-180.png">
<meta name="theme-color" content="#fdfbfc">`;

/** One navigation for the whole library, so every page is two clicks from every other. */
function head(): string {
  const links = SECTIONS.map(
    (entry) => `<a href="/${entry.id}">${escapeHtml(entry.title)}</a>`,
  ).join('');
  return `<header class="sf-page-head sf-lib-head">
  <a class="sf-brand" href="/"><img src="/brand/logo-ink-330.webp" alt="Videokr" width="102" height="28"></a>
  <nav class="sf-lib-nav" aria-label="Library">${links}<a href="/#pricing">Pricing</a></nav>
  <a class="btn btn-sm" href="/login.html?mode=signup">Start free</a>
</header>`;
}

const FOOT = `<footer class="sf-page-foot sf-lib-foot">
  <p><a href="/">Videokr</a> — hosted video for marketing sites: brand the player, capture emails inside the video,
     embed it anywhere, and read second-by-second retention. <a href="/#pricing">Plans from $0</a>.</p>
  <nav aria-label="Library sections">${SECTIONS.map(
    (entry) => `<a href="/${entry.id}">${entry.title}</a>`,
  ).join('')}<a href="/v/videokr-the-product-film">Product film</a><a href="/downloads/videokr-wordpress-plugin.zip">WordPress plugin</a><a href="/contact">Contact</a><a href="/terms">Terms</a></nav>
</footer>`;

interface Meta {
  title: string;
  description: string;
  canonical: string;
  markdown?: string;
  ld: string;
  published?: string;
  updated?: string;
}

function shell(meta: Meta, body: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${escapeHtml(meta.title)}</title>
<meta name="description" content="${escapeHtml(meta.description)}">
<link rel="canonical" href="${meta.canonical}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
${meta.markdown ? `<link rel="alternate" type="text/markdown" href="${meta.markdown}" title="This page in Markdown">` : ''}
<meta property="og:type" content="article">
<meta property="og:site_name" content="${SITE.name}">
<meta property="og:locale" content="en_US">
<meta property="og:url" content="${meta.canonical}">
<meta property="og:title" content="${escapeHtml(meta.title)}">
<meta property="og:description" content="${escapeHtml(meta.description)}">
<meta property="og:image" content="${new URL(meta.canonical).origin}/brand/hero-dark.png">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:site" content="@videokrofficial">
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">
${meta.published ? `<meta property="article:published_time" content="${meta.published}">` : ''}
${meta.updated ? `<meta property="article:modified_time" content="${meta.updated}">` : ''}
<link rel="stylesheet" href="${stamp('/styles.css')}">
${FONTS}
${meta.ld}
</head>
<body class="sf-page sf-lib">
<a class="sf-skip" href="#sf-main">Skip to content</a>
${head()}
${body}
${FOOT}
</body>
</html>`;
}

function isoDay(date: string): string {
  return new Date(`${date}T00:00:00Z`).toISOString();
}

function cardsFor(sectionId: string, pages: ContentPage[]): string {
  return `<ul class="sf-card-grid">${pages
    .map(
      (item) => `<li><a href="/${sectionId}/${item.slug}">
      <h3>${escapeHtml(item.title)}</h3>
      <p>${escapeHtml(item.description)}</p>
      <span class="sf-card-more">Read →</span></a></li>`,
    )
    .join('')}</ul>`;
}

function socialLabel(url: string): string {
  const host = new URL(url).hostname.replace(/^www\./, '');
  const token = host.split('.')[0];
  if (token === 'x') return 'X';
  if (token === 'producthunt') return 'Product Hunt';
  if (token === 'youtube') return 'YouTube';
  if (token === 'linkedin') return 'LinkedIn';
  return token.replace(/^./, (letter) => letter.toUpperCase());
}

/* ------------------------------------------------------------------ hubs ---- */

content.get('/contact', (c) => {
  const base = baseUrl(c.env);
  const canonical = `${base}/contact`;
  const ld = graphLd([
    organizationLd(base),
    webSiteLd(base),
    localBusinessLd(base),
    breadcrumbLd(base, [
      { name: 'Videokr', url: '/' },
      { name: 'Contact', url: '/contact' },
    ]),
    {
      '@type': 'ContactPage',
      '@id': `${canonical}#page`,
      name: `Contact ${SITE.name}`,
      url: canonical,
      isPartOf: { '@id': `${base}/#website` },
      about: { '@id': `${base}/#organization` },
    },
  ]);
  const body = `<main class="sf-page-main sf-lib-main" id="sf-main">
  <nav class="sf-crumbs" aria-label="Breadcrumb"><a href="/">Videokr</a> <span aria-hidden="true">/</span> <span>Contact</span></nav>
  <h1>Contact Videokr</h1>
  <p class="sf-answer">Videokr is a hosted video platform for marketing sites, founded on 17 January 2026 by James Thomas and run from Byron, Minnesota. Every way to reach us is below.</p>
  <dl class="sf-nap">
    <dt>Business name</dt><dd>Videokr</dd>
    <dt>Founder</dt><dd>James Thomas</dd>
    <dt>Founded</dt><dd><time datetime="2026-01-17">January 17, 2026</time></dd>
    <dt>Address</dt><dd><address>27 4th St NW<br>Byron, MN 55920<br>United States</address></dd>
    <dt>Phone</dt><dd><a href="tel:+15072022421">(507) 202-2421</a></dd>
    <dt>Support</dt><dd><a href="mailto:support@videokr.com">support@videokr.com</a></dd>
    <dt>General and press</dt><dd><a href="mailto:hello@videokr.com">hello@videokr.com</a></dd>
    <dt>Service area</dt><dd>Worldwide</dd>
  </dl>
  <h2>Which address to use</h2>
  <p>Email <a href="mailto:support@videokr.com">support@videokr.com</a> about an account, a payment or a video that will not play. Use <a href="mailto:hello@videokr.com">hello@videokr.com</a> for press, partnerships, and anything about the company rather than the product.</p>
  <h2>Elsewhere</h2>
  <ul>${SITE.social
    .map((url) => `<li><a href="${escapeHtml(url)}" rel="me">${escapeHtml(socialLabel(url))}</a></li>`)
    .join('')}</ul>
  <aside class="sf-lib-cta">
    <h2>Start free</h2>
    <p>500 plays a month, 5 videos, every player and analytics feature — $0, no card, no timer.</p>
    <p><a class="btn" href="/login.html?mode=signup">Start free</a> <a class="sf-quiet-link" href="/v/videokr-the-product-film">or watch the two-minute film</a></p>
  </aside>
</main>`;
  return c.html(
    shell(
      {
        title: `Contact ${SITE.name} — ${SITE.name}`,
        description:
          'Contact details for Videokr: postal address in Byron, Minnesota, phone number, support and general email. Videokr was founded on January 17, 2026 by James Thomas.',
        canonical,
        ld,
      },
      body,
    ),
  );
});

content.get('/terms', (c) => {
  const base = baseUrl(c.env);
  const canonical = `${base}/terms`;
  const ld = graphLd([
    organizationLd(base),
    webSiteLd(base),
    breadcrumbLd(base, [
      { name: 'Videokr', url: '/' },
      { name: 'Terms', url: '/terms' },
    ]),
    {
      '@type': 'WebPage',
      '@id': `${canonical}#page`,
      name: `Terms of Service ${SITE.name}`,
      url: canonical,
      isPartOf: { '@id': `${base}/#website` },
    },
  ]);
  const body = `<main class="sf-page-main sf-lib-main" id="sf-main">
  <nav class="sf-crumbs" aria-label="Breadcrumb"><a href="/">Videokr</a> <span aria-hidden="true">/</span> <span>Terms</span></nav>
  <h1>Terms of Service and Acceptable Use</h1>
  <p class="sf-answer">Last updated <time datetime="2026-10-03">3 October 2026</time>. Videokr is operated by Videokr, 27 4th St NW, Byron, MN 55920, United States. Questions about these terms go to <a href="mailto:support@videokr.com">support@videokr.com</a>.</p>
  <h2>1. Agreement</h2>
  <p>By creating an account or embedding a Videokr player you agree to these terms. If you sign up on behalf of a company, you confirm you may bind it.</p>
  <h2>2. Accounts</h2>
  <p>You are responsible for your account, the accuracy of your email address and anything done with your credentials. One person or company per account; keep your password safe. You can sign in with email and password or, where offered, a linked Google account. Tell us immediately at <a href="mailto:support@videokr.com">support@videokr.com</a> if you believe someone else is using your account.</p>
  <h2>3. Plans, billing and plays</h2>
  <p>Paid plans are billed through our merchant of record, Dodo Payments, which handles payment, tax invoices and refunds. Current plans: a free plan (500 plays a month, 5 videos), Starter ($29 a year or $5 month to month, 10,000 plays), Agency ($29 a month or $290 a year, unlimited plays and videos) and Lifetime (one payment, 10,000 plays a month). A play is one viewer starting one video, counted once per video per calendar month; rewatches and reloads in the same month do not count again. Bandwidth is never metered on any plan. Overage on Starter and Lifetime is $1 per 10,000 extra plays and accrues visibly in your dashboard. Prices may change; the price shown at checkout is the one that applies to your purchase. Refund requests go to support and are handled per the policy stated at checkout and in your invoice.</p>
  <h2>4. Your content</h2>
  <p>You keep ownership of every video, thumbnail, caption and form submission you upload or capture. You grant Videokr the limited licence needed to host, transcode, cache and deliver that content through the player, and to process play analytics for it. You are responsible for having the rights to everything you publish and for complying with the acceptable use policy below.</p>
  <h2>5. Acceptable use policy</h2>
  <p>Videokr hosts video for business, education and creator use. The following are prohibited on videos, thumbnails, captions, landing pages and form content you serve through the platform:</p>
  <ul>
    <li><strong>Illegal material of any kind</strong> — including any sexual content involving minors, which we report to the authorities without notice.</li>
    <li><strong>Adult or NSFW content</strong> — explicit or suggestive material, whether filmed or AI-generated. Our payment provider prohibits it, so we cannot host it even where it would otherwise be legal.</li>
    <li><strong>Infringing content</strong> — video or artwork you do not have the rights to publish. We respond to valid copyright complaints by removing the material and notifying the uploader.</li>
    <li><strong>Fraud and harm</strong> — malware, phishing, deceptive earnings claims, scams, doxxing, harassment, hateful or violent extremist material.</li>
    <li><strong>Prohibited categories</strong> — anything our payment provider bars, including gambling and unlicensed financial services.</li>
    <li><strong>Platform abuse</strong> — spam, automated play inflation, reselling our delivery as your own CDN, or circumventing plan limits.</li>
  </ul>
  <p>Report a violation to <a href="mailto:support@videokr.com">support@videokr.com</a> with the video link and what is wrong. We investigate every report.</p>
  <h2>6. Enforcement</h2>
  <p>We may warn, suspend playback, or close an account for a breach of these terms. Suspension stops serving your videos; a terminated account loses access after 30 days, during which you can export your data. Illegal content is removed immediately and may be reported to law enforcement.</p>
  <h2>7. Privacy</h2>
  <p>What we collect and why is described in our <a href="/docs/privacy">privacy notice</a>. You can delete your account and its data at any time, and captured leads belong to you.</p>
  <h2>8. Availability and liability</h2>
  <p>We work hard to keep the platform available but provide it as is, without warranties to the extent the law allows. To the maximum extent permitted by law our total liability to you is limited to the fees you paid us in the twelve months before the claim. Nothing here limits liability that cannot be limited by law.</p>
  <h2>9. Changes and governing law</h2>
  <p>We may update these terms; the current version always lives on this page, and material changes are announced by email to account holders. These terms are governed by the laws of the State of Minnesota, United States.</p>
  <aside class="sf-lib-cta">
    <h2>Questions?</h2>
    <p>Write to <a href="mailto:support@videokr.com">support@videokr.com</a> about these terms, your account or a video.</p>
  </aside>
</main>`;
  return c.html(
    shell(
      {
        title: `Terms of Service — ${SITE.name}`,
        description:
          'Videokr terms of service and acceptable use policy: accounts, plans and plays, your content, prohibited content including adult material, enforcement, privacy and governing law.',
        canonical,
        ld,
      },
      body,
    ),
  );
});

content.get(`/:section{(?:${SECTION_IDS})}`, (c) => {
  const entry = findSection(c.req.param('section'));
  if (!entry) return c.notFound();
  const base = baseUrl(c.env);
  const canonical = `${base}/${entry.id}`;
  const ld = graphLd([
    organizationLd(base),
    webSiteLd(base),
    breadcrumbLd(base, [
      { name: 'Videokr', url: '/' },
      { name: entry.title, url: `/${entry.id}` },
    ]),
    {
      '@type': 'CollectionPage',
      '@id': `${canonical}#page`,
      name: `${entry.title} — ${SITE.name}`,
      description: entry.description,
      url: canonical,
      isPartOf: { '@id': `${base}/#website` },
      hasPart: entry.pages.map((item) => ({
        '@type': 'Article',
        headline: item.title,
        description: item.description,
        url: `${base}/${entry.id}/${item.slug}`,
      })),
    },
  ]);
  const others = SECTIONS.filter((other) => other.id !== entry.id);
  const body = `<main class="sf-page-main sf-lib-main" id="sf-main">
  <nav class="sf-crumbs" aria-label="Breadcrumb"><a href="/">Videokr</a> <span aria-hidden="true">/</span> <span>${escapeHtml(
    entry.title,
  )}</span></nav>
  <h1>${escapeHtml(entry.title)}</h1>
  <p class="sf-answer">${escapeHtml(entry.blurb)}</p>
  ${cardsFor(entry.id, entry.pages)}
  <section class="sf-lib-cross">
    <h2>Elsewhere in the library</h2>
    <ul>${others
      .map(
        (other) =>
          `<li><a href="/${other.id}">${escapeHtml(other.title)}</a> — ${escapeHtml(other.blurb)}</li>`,
      )
      .join('')}</ul>
  </section>
  <aside class="sf-lib-cta">
    <h2>Try it on the free plan</h2>
    <p>500 plays a month, 5 videos, every player and analytics feature — $0, no card, no timer.</p>
    <p><a class="btn" href="/login.html?mode=signup">Start free</a> <a class="sf-quiet-link" href="/v/videokr-the-product-film">or watch the two-minute film</a></p>
  </aside>
</main>`;
  return c.html(
    shell(
      {
        title: `${entry.title} — ${SITE.name}`,
        description: entry.description,
        canonical,
        ld,
      },
      body,
    ),
  );
});

/* ------------------------------------------------------------- md twins ---- */

function markdownFor(base: string, ref: ContentRef): string {
  const { section, page } = ref;
  const url = `${base}/${section.id}/${page.slug}`;
  const related = relatedFor(ref)
    .map((item) => `- [${item.page.title}](${base}/${item.section.id}/${item.page.slug})`)
    .join('\n');
  return `# ${page.title}

${page.answer}

- Section: ${section.title} (${base}/${section.id})
- Page: ${url}
- Last updated: ${page.updated}

${page.body}

${page.faqs?.length ? `## FAQ\n\n${page.faqs.map((faq) => `### ${faq.q}\n\n${faq.a}`).join('\n\n')}\n` : ''}
## Related

${related}

---
${SITE.name} — ${SITE.description}
Plans: ${base}/#pricing · Full reference: ${base}/llms-full.txt
`;
}

content.get(`/:section{(?:${SECTION_IDS})}/:slug{[^/]+\\.md}`, (c) => {
  const sectionId = c.req.param('section');
  const slug = c.req.param('slug').replace(/\.md$/, '');
  const entry = findSection(sectionId);
  const item = findPage(sectionId, slug);
  if (!entry || !item) return c.text('Not found\n', 404);
  c.header('content-type', 'text/markdown; charset=utf-8');
  c.header('cache-control', 'public, max-age=3600');
  return c.body(markdownFor(baseUrl(c.env), { section: entry, page: item }));
});

/* ------------------------------------------------------------ documents ---- */

function articleType(section: Section): string {
  if (section.id === 'docs') return 'TechArticle';
  if (section.id === 'blog') return 'BlogPosting';
  return 'Article';
}

function faqSection(page: ContentPage): string {
  if (!page.faqs?.length) return '';
  return `<section class="sf-faq" id="faq">
    <h2 id="faq-heading">Frequently asked questions</h2>
    ${page.faqs
      .map(
        (faq) => `<details><summary>${escapeHtml(faq.q)}</summary><p>${escapeHtml(faq.a)}</p></details>`,
      )
      .join('')}
  </section>`;
}

content.get(`/:section{(?:${SECTION_IDS})}/:slug`, (c) => {
  const sectionId = c.req.param('section');
  const entry = findSection(sectionId);
  const item = findPage(sectionId, c.req.param('slug'));
  if (!entry || !item) return c.notFound();

  const base = baseUrl(c.env);
  const canonical = `${base}/${entry.id}/${item.slug}`;
  const rendered = renderMarkdown(item.body);
  const related = relatedFor({ section: entry, page: item });
  const updated = isoDay(item.updated);
  const published = isoDay(item.published ?? item.updated);

  const nodes: Record<string, unknown>[] = [
    organizationLd(base),
    webSiteLd(base),
    breadcrumbLd(base, [
      { name: 'Videokr', url: '/' },
      { name: entry.title, url: `/${entry.id}` },
      { name: item.title, url: `/${entry.id}/${item.slug}` },
    ]),
    {
      '@type': articleType(entry),
      '@id': `${canonical}#article`,
      headline: item.title,
      description: item.description,
      abstract: item.answer,
      url: canonical,
      mainEntityOfPage: canonical,
      datePublished: published,
      dateModified: updated,
      inLanguage: 'en',
      isPartOf: { '@id': `${base}/#website` },
      author: { '@id': `${base}/#organization` },
      publisher: { '@id': `${base}/#organization` },
      about: item.keywords,
    },
  ];
  /* FAQ markup is only emitted because the same questions and answers are
     rendered on the page — invisible FAQ data is a policy violation. */
  if (item.faqs?.length) {
    nodes.push({
      '@type': 'FAQPage',
      '@id': `${canonical}#faq`,
      mainEntity: item.faqs.map((faq) => ({
        '@type': 'Question',
        name: faq.q,
        acceptedAnswer: { '@type': 'Answer', text: faq.a },
      })),
    });
  }

  const toc = rendered.headings.length
    ? `<nav class="sf-toc" aria-label="On this page"><h2>On this page</h2><ol>${rendered.headings
        .map((heading) => `<li><a href="#${heading.id}">${escapeHtml(heading.text)}</a></li>`)
        .join('')}</ol></nav>`
    : '';

  const relatedBlock = related.length
    ? `<section class="sf-related">
        <h2>Keep reading</h2>
        <ul>${related
          .map(
            (ref) =>
              `<li><a href="/${ref.section.id}/${ref.page.slug}"><strong>${escapeHtml(
                ref.page.title,
              )}</strong><span>${escapeHtml(ref.page.description)}</span></a></li>`,
          )
          .join('')}</ul>
      </section>`
    : '';

  const body = `<main class="sf-page-main sf-lib-main sf-article" id="sf-main">
  <nav class="sf-crumbs" aria-label="Breadcrumb"><a href="/">Videokr</a> <span aria-hidden="true">/</span> <a href="/${
    entry.id
  }">${escapeHtml(entry.title)}</a> <span aria-hidden="true">/</span> <span>${escapeHtml(item.title)}</span></nav>
  <article>
    <h1>${escapeHtml(item.title)}</h1>
    <p class="sf-answer">${escapeHtml(item.answer)}</p>
    <p class="sf-byline">Updated <time datetime="${updated}">${item.updated}</time> · <a href="${canonical}.md">Markdown version</a></p>
    ${toc}
    ${rendered.html}
    ${faqSection(item)}
  </article>
  <aside class="sf-lib-cta">
    <h2>Do this on Videokr</h2>
    <p>Host the video, brand the player, capture emails inside it and read the retention curve. Free plan: 500 plays a month, 5 videos, no card.</p>
    <p><a class="btn" href="/login.html?mode=signup">Start free</a> <a class="sf-quiet-link" href="/#pricing">See plans</a></p>
  </aside>
  ${relatedBlock}
</main>`;

  return c.html(
    shell(
      {
        title: `${item.metaTitle ?? item.title} — ${SITE.name}`,
        description: item.description,
        canonical,
        markdown: `${canonical}.md`,
        ld: graphLd(nodes),
        published,
        updated,
      },
      body,
    ),
  );
});

/** Used by the sitemap and by `llms.txt`, so the library can never be listed stale. */
export function contentUrls(base: string): { loc: string; lastmod: string; priority: string }[] {
  const hubs = SECTIONS.map((entry) => ({
    loc: `${base}/${entry.id}`,
    lastmod: isoDay(
      entry.pages.reduce((newest, item) => (item.updated > newest ? item.updated : newest), '2026-01-01'),
    ),
    priority: '0.7',
  }));
  const pages = allPages().map((ref) => ({
    loc: `${base}/${ref.section.id}/${ref.page.slug}`,
    lastmod: isoDay(ref.page.updated),
    priority: '0.6',
  }));
  return [...hubs, ...pages];
}

/** Short summaries for the assistant-facing text files. */
export function contentIndexLines(base: string): string[] {
  return SECTIONS.flatMap((entry) => [
    `- [${entry.title}](${base}/${entry.id}): ${entry.blurb}`,
    ...entry.pages.map(
      (item) => `  - [${item.title}](${base}/${entry.id}/${item.slug}): ${plainText(item.answer, 180)}`,
    ),
  ]);
}
