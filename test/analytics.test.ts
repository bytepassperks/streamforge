import { describe, expect, it } from 'vitest';
import type { Env } from '../src/lib/types';
import { gtagSnippet, headTags, injectHead, isMeasurablePath, verificationTags } from '../src/lib/analytics';

function env(overrides: Partial<Env> = {}): Env {
  return { PUBLIC_BASE_URL: 'https://videokr.com', ...overrides } as Env;
}

describe('isMeasurablePath', () => {
  it('measures public pages and leaves dashboards, embeds and the api alone', () => {
    expect(isMeasurablePath('/')).toBe(true);
    expect(isMeasurablePath('/v/the-film')).toBe(true);
    expect(isMeasurablePath('/docs/quickstart')).toBe(true);
    expect(isMeasurablePath('/pl/a-playlist')).toBe(true);
    expect(isMeasurablePath('/app')).toBe(false);
    expect(isMeasurablePath('/app.html')).toBe(false);
    expect(isMeasurablePath('/admin')).toBe(false);
    expect(isMeasurablePath('/login')).toBe(false);
    expect(isMeasurablePath('/reset.html')).toBe(false);
    expect(isMeasurablePath('/e/vid_1')).toBe(false);
    expect(isMeasurablePath('/api/videos')).toBe(false);
  });
});

describe('gtagSnippet', () => {
  it('emits nothing without a configured measurement id', () => {
    expect(gtagSnippet(env())).toBe('');
    expect(gtagSnippet(env({ GA_MEASUREMENT_ID: 'not-an-id' }))).toBe('');
  });

  it('loads the tag async and turns the advertising signals off', () => {
    const html = gtagSnippet(env({ GA_MEASUREMENT_ID: 'G-ABC123' }));
    expect(html).toContain('<script async src="https://www.googletagmanager.com/gtag/js?id=G-ABC123">');
    expect(html).toContain("gtag('config','G-ABC123'");
    expect(html).toContain('anonymize_ip:true');
    expect(html).toContain('allow_google_signals:false');
    expect(html).toContain('allow_ad_personalization_signals:false');
  });
});

describe('verificationTags', () => {
  it('claims ownership only on the home page, and only for tokens it has', () => {
    const configured = env({ BING_SITE_VERIFICATION: 'BING123', YANDEX_SITE_VERIFICATION: 'YA123' });
    const home = verificationTags(configured, '/');
    expect(home).toContain('<meta name="msvalidate.01" content="BING123">');
    expect(home).toContain('<meta name="yandex-verification" content="YA123">');
    expect(home).not.toContain('google-site-verification');
    expect(verificationTags(configured, '/docs')).toBe('');
    expect(verificationTags(env(), '/')).toBe('');
  });
});

describe('headTags and injectHead', () => {
  it('adds the tag to a public page head and never twice', () => {
    const tags = headTags(env({ GA_MEASUREMENT_ID: 'G-ABC123' }), '/v/the-film');
    const page = '<html><head><title>a</title></head><body>b</body></html>';
    const once = injectHead(page, tags);
    expect(once).toContain('gtag/js?id=G-ABC123');
    expect(once.indexOf('</head>')).toBeGreaterThan(once.indexOf('gtag/js'));
    expect(injectHead(once, tags)).toBe(once);
  });

  it('leaves a dashboard, an embed and a headless body untouched', () => {
    const configured = env({ GA_MEASUREMENT_ID: 'G-ABC123' });
    expect(headTags(configured, '/app')).toBe('');
    expect(headTags(configured, '/e/vid_1')).toBe('');
    expect(injectHead('<body>no head</body>', headTags(configured, '/'))).toBe('<body>no head</body>');
  });
});
