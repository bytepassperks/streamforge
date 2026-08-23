import { describe, expect, it } from 'vitest';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { ASSET_STAMPS } from '../src/asset-stamps';
import { isStamped, stamp, stampHtml } from '../src/lib/assets';

const root = join(import.meta.dirname, '..');

function hash(path: string): string {
  return createHash('sha256').update(readFileSync(join(root, 'public', path))).digest('hex').slice(0, 10);
}

describe('asset stamps', () => {
  it('matches the bytes actually shipped', () => {
    for (const [path, version] of Object.entries(ASSET_STAMPS)) {
      expect(hash(path), `${path} stamp is stale — run npm run assets:stamp`).toBe(version);
    }
  });

  it('covers every stylesheet and script in public/', () => {
    const walk = (dir: string, prefix: string): string[] =>
      readdirSync(join(root, 'public', dir), { withFileTypes: true }).flatMap((entry) => {
        if (entry.isDirectory()) return dir === '' ? walk(entry.name, `/${entry.name}`) : [];
        return /\.(css|js)$/.test(entry.name) ? [`${prefix}/${entry.name}`] : [];
      });
    for (const path of walk('', '')) {
      expect(ASSET_STAMPS, `${path} is unstamped`).toHaveProperty(path);
    }
  });

  it('appends the hash and only treats the current hash as immutable', () => {
    expect(stamp('/styles.css')).toBe(`/styles.css?v=${ASSET_STAMPS['/styles.css']}`);
    expect(stamp('/nothing.css')).toBe('/nothing.css');
    expect(isStamped('/styles.css', ASSET_STAMPS['/styles.css'])).toBe(true);
    expect(isStamped('/styles.css', 'deadbeef')).toBe(false);
    expect(isStamped('/styles.css', undefined)).toBe(false);
  });

  it('rewrites static HTML references without touching anything else', () => {
    const html = stampHtml(
      '<link rel="stylesheet" href="/styles.css"><link rel="preload" href="/fonts/x.woff2"><script src="/hills.js"></script><a href="/docs">d</a>',
    );
    expect(html).toContain(`href="/styles.css?v=${ASSET_STAMPS['/styles.css']}"`);
    expect(html).toContain(`src="/hills.js?v=${ASSET_STAMPS['/hills.js']}"`);
    expect(html).toContain('href="/fonts/x.woff2"');
    expect(html).toContain('href="/docs"');
  });

  it('leaves no unstamped stylesheet or script in a server-rendered page', () => {
    for (const file of ['src/routes/content.ts', 'src/routes/public.ts']) {
      const source = readFileSync(join(root, file), 'utf8');
      const unstamped = [...source.matchAll(/(?:href|src)="(\/[^"$]+\.(?:css|js))"/g)].map((m) => m[1]);
      expect(unstamped, `${file} renders unstamped assets`).toEqual([]);
    }
  });

  it('stamps every stylesheet and script the shipped pages load', () => {
    for (const file of ['index.html', 'app.html', 'admin.html', 'login.html', 'reset.html']) {
      const stamped = stampHtml(readFileSync(join(root, 'public', file), 'utf8'));
      const unstamped = [...stamped.matchAll(/(?:href|src)="(\/[^"?]+\.(?:css|js))"/g)].map((m) => m[1]);
      expect(unstamped, `${file} loads unstamped assets`).toEqual([]);
    }
  });
});
