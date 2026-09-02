import { describe, expect, it } from 'vitest';
import { SECTIONS, allPages, page, relatedFor, section } from '../src/content';
import { plainText, renderMarkdown } from '../src/lib/markdown';

const pages = allPages();

describe('content library', () => {
  it('has every section populated', () => {
    for (const entry of SECTIONS) {
      expect(entry.pages.length, entry.id).toBeGreaterThan(3);
    }
  });

  it('uses unique slugs within a section', () => {
    for (const entry of SECTIONS) {
      const slugs = entry.pages.map((item) => item.slug);
      expect(new Set(slugs).size, entry.id).toBe(slugs.length);
    }
  });

  it('uses url-safe slugs', () => {
    for (const ref of pages) expect(ref.page.slug).toMatch(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);
  });

  it('gives every page a unique title and description of sane length', () => {
    const titles = new Set<string>();
    const descriptions = new Set<string>();
    for (const ref of pages) {
      const title = ref.page.metaTitle ?? ref.page.title;
      expect(titles.has(title), title).toBe(false);
      titles.add(title);
      expect(descriptions.has(ref.page.description), ref.page.slug).toBe(false);
      descriptions.add(ref.page.description);
      expect(title.length, title).toBeLessThanOrEqual(65);
      expect(ref.page.description.length, ref.page.slug).toBeGreaterThan(60);
      expect(ref.page.description.length, ref.page.slug).toBeLessThanOrEqual(200);
    }
  });

  it('answers the question up front on every page', () => {
    for (const ref of pages) {
      expect(ref.page.answer.length, ref.page.slug).toBeGreaterThan(120);
      expect(ref.page.keywords.length, ref.page.slug).toBeGreaterThan(0);
    }
  });

  it('dates every page in ISO form', () => {
    for (const ref of pages) {
      expect(ref.page.updated, ref.page.slug).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      if (ref.page.published) expect(ref.page.published).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    }
  });

  it('resolves every declared related reference', () => {
    for (const ref of pages) {
      for (const related of ref.page.related ?? []) {
        const [sectionId, slug] = related.split('/');
        expect(page(sectionId, slug), `${ref.page.slug} -> ${related}`).toBeTruthy();
      }
    }
  });

  it('resolves every internal link in every body', () => {
    for (const ref of pages) {
      const links = ref.page.body.matchAll(/\]\((\/[^)\s]*)\)/g);
      for (const [, href] of links) {
        const path = href.split('#')[0].split('?')[0].replace(/\/$/, '');
        if (!path) continue;
        const parts = path.slice(1).split('/');
        if (section(parts[0]) && parts.length === 2) {
          expect(page(parts[0], parts[1]), `${ref.page.slug} -> ${href}`).toBeTruthy();
        } else {
          /* Product routes are allowed, but only the ones that exist. */
          expect(
            [
              '/',
              '/app',
              '/login.html',
              '/downloads/videokr-wordpress-plugin.zip',
              '/v/videokr-the-product-film',
              '/llms.txt',
              '/llms-full.txt',
              ...SECTIONS.map((entry) => `/${entry.id}`),
            ],
            `${ref.page.slug} -> ${href}`,
          ).toContain(path);
        }
      }
    }
  });

  it('gives every page somewhere to go next', () => {
    for (const ref of pages) {
      const related = relatedFor(ref);
      expect(related.length, ref.page.slug).toBeGreaterThan(1);
      for (const item of related) {
        expect(`${item.section.id}/${item.page.slug}`).not.toBe(`${ref.section.id}/${ref.page.slug}`);
      }
    }
  });

  it('is linked to from at least one other page', () => {
    const inbound = new Map<string, number>();
    for (const ref of pages) {
      const hrefs = [...ref.page.body.matchAll(/\]\((\/[^)\s]*)\)/g)].map((match) => match[1]);
      for (const href of [...hrefs, ...(ref.page.related ?? []).map((item) => `/${item}`)]) {
        const key = href.split('#')[0].replace(/^\//, '');
        inbound.set(key, (inbound.get(key) ?? 0) + 1);
      }
    }
    for (const ref of pages) {
      const key = `${ref.section.id}/${ref.page.slug}`;
      expect(inbound.get(key) ?? 0, `orphan: ${key}`).toBeGreaterThan(0);
    }
  });

  it('keeps pricing claims consistent with the plans', () => {
    const facts = [/\$69/, /500 plays/, /10,000/, /unlimited plays/];
    const corpus = pages.map((ref) => `${ref.page.answer}\n${ref.page.body}`).join('\n');
    for (const fact of facts) expect(corpus).toMatch(fact);
    /* Old workers.dev links and any stale price shape must never reappear. */
    expect(corpus).not.toMatch(/workers\.dev/);
    expect(corpus).not.toMatch(/\$99|\$49\b/);
  });

  it('does not fabricate reviews or guarantees', () => {
    const corpus = pages.map((ref) => `${ref.page.answer}\n${ref.page.body}`).join('\n').toLowerCase();
    for (const phrase of ['guaranteed ranking', 'guaranteed first page', '5-star', 'testimonial from']) {
      expect(corpus).not.toContain(phrase);
    }
  });

  it('renders every body without leaving raw markdown behind', () => {
    for (const ref of pages) {
      const rendered = renderMarkdown(ref.page.body);
      expect(rendered.html.length, ref.page.slug).toBeGreaterThan(400);
      expect(rendered.headings.length, ref.page.slug).toBeGreaterThan(1);
      const withoutCode = rendered.html.replace(/<pre>[\s\S]*?<\/pre>/g, '');
      expect(withoutCode, ref.page.slug).not.toMatch(/\]\(\//);
      expect(withoutCode, ref.page.slug).not.toMatch(/\*\*/);
      expect(rendered.html, ref.page.slug).not.toContain('\uE000');
      for (const heading of rendered.headings) expect(heading.id).toMatch(/^[a-z0-9-]+$/);
    }
  });

  it('keeps FAQ answers self-contained', () => {
    for (const ref of pages) {
      for (const faq of ref.page.faqs ?? []) {
        expect(faq.q.endsWith('?'), `${ref.page.slug}: ${faq.q}`).toBe(true);
        expect(faq.a.length, `${ref.page.slug}: ${faq.q}`).toBeGreaterThan(40);
      }
    }
  });
});

describe('markdown renderer', () => {
  it('escapes html in authored text', () => {
    expect(renderMarkdown('<script>alert(1)</script>').html).not.toContain('<script>');
  });

  it('renders links, code and tables', () => {
    const out = renderMarkdown('## Hi\n\nA [link](/docs/embeds) and `code`.\n\n| a | b |\n| --- | --- |\n| 1 | 2 |');
    expect(out.html).toContain('<h2 id="hi">Hi</h2>');
    expect(out.html).toContain('<a href="/docs/embeds">link</a>');
    expect(out.html).toContain('<code>code</code>');
    expect(out.html).toContain('class="sf-table"');
    expect(out.headings[0]).toEqual({ id: 'hi', text: 'Hi' });
  });

  it('keeps markup inside code spans literal', () => {
    expect(renderMarkdown('Use `[videokr id="x"]` here.').html).toContain('[videokr id=&quot;x&quot;]');
  });

  it('summarises to plain text within a limit', () => {
    const summary = plainText('## Head\n\nSome **bold** text and a [link](/docs/embeds).', 40);
    expect(summary.length).toBeLessThanOrEqual(41);
    expect(summary).not.toContain('**');
    expect(summary).not.toContain('](');
  });
});
