import { Hono } from 'hono';
import type { Env } from '../lib/types';
import { escapeHtml } from '../lib/util';
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
  organizationLd,
  webSiteLd,
} from '../lib/seo';

export const content = new Hono<{ Bindings: Env }>();

const SECTION_IDS = SECTIONS.map((entry) => entry.id).join('|');

const FONTS = `<link rel="preload" href="/fonts/figtree-400-800-latin.woff2" as="font" type="font/woff2" crossorigin>
<link rel="stylesheet" href="/fonts/fonts.css">
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
  ).join('')}<a href="/v/videokr-the-product-film">Product film</a><a href="/downloads/videokr-wordpress-plugin.zip">WordPress plugin</a></nav>
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
<meta name="twitter:title" content="${escapeHtml(meta.title)}">
<meta name="twitter:description" content="${escapeHtml(meta.description)}">
${meta.published ? `<meta property="article:published_time" content="${meta.published}">` : ''}
${meta.updated ? `<meta property="article:modified_time" content="${meta.updated}">` : ''}
<link rel="stylesheet" href="/styles.css">
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

/* ------------------------------------------------------------------ hubs ---- */

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
    <p>500 plays a month, 5 videos, 2 GB of storage, every player and analytics feature — $0, no card, no timer.</p>
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
