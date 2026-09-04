import { describe, expect, it } from 'vitest';
import type { Env } from '../src/lib/types';
import { content } from '../src/routes/content';
import { seo } from '../src/routes/seo';

const env = { PUBLIC_BASE_URL: 'https://videokr.com' } as Env;

async function getContent(path: string): Promise<Response> {
  return content.fetch(new Request(`https://videokr.com${path}`), env);
}

async function getSeo(path: string): Promise<Response> {
  return seo.fetch(new Request(`https://videokr.com${path}`), env);
}

function jsonLdDocuments(html: string): Record<string, unknown>[] {
  const scripts = [...html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)];
  expect(scripts.length).toBeGreaterThan(0);
  return scripts.map((match) => JSON.parse(match[1]) as Record<string, unknown>);
}

describe('contact page', () => {
  it('renders the authoritative NAP details and contact links', async () => {
    const response = await getContent('/contact');
    const html = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get('content-type')).toContain('text/html');
    expect(html).toContain('27 4th St NW');
    expect(html).toContain('Byron, MN 55920');
    expect(html).toContain('tel:+15072022421');
    expect(html).toContain('(507) 202-2421');
    expect(html).toContain('mailto:support@videokr.com');
    expect(html).toContain('James Thomas');
    expect(html).toContain('datetime="2026-01-17"');
  });

  it('emits matching ProfessionalService and Organization identity nodes', async () => {
    const response = await getContent('/contact');
    const html = await response.text();
    const documents = jsonLdDocuments(html);
    const graph = documents.flatMap((document) => (document['@graph'] ?? []) as Record<string, unknown>[]);
    const business = graph.find((node) => node['@type'] === 'ProfessionalService') as Record<string, unknown>;
    const organization = graph.find((node) => node['@type'] === 'Organization') as Record<string, unknown>;
    expect(business).toMatchObject({
      foundingDate: '2026-01-17',
      founder: { name: 'James Thomas' },
      address: { postalCode: '55920', addressRegion: 'MN' },
    });
    expect(organization).toMatchObject({
      foundingDate: '2026-01-17',
      address: { postalCode: '55920', addressRegion: 'MN' },
    });
    expect(organization.address).toEqual(business.address);
  });
});

describe('contact discovery resources', () => {
  it('includes Contact in the pages sitemap', async () => {
    const response = await getSeo('/sitemap-pages.xml');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('https://videokr.com/contact');
  });

  it('publishes the phone number in llms.txt', async () => {
    const response = await getSeo('/llms.txt');
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('(507) 202-2421');
  });
});
