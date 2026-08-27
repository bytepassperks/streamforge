import { describe, expect, it, vi } from 'vitest';
import { mergeLanding } from '../src/lib/landing';

const BASE = 'https://videokr.com';
const SOURCE = 'https://faithful-shape-634315.framer.app/';
const SCHEMA = '<script type="application/ld+json">{"@type":"Organization"}</script>';

describe('mergeLanding', () => {
  it('forces canonical and og:url values to the site base', () => {
    const html =
      '<head><link rel="canonical" href="https://wrong.example/"><meta property="og:url" content="https://wrong.example/"></head>';
    const merged = mergeLanding(html, BASE, SOURCE, '', '/pricing');
    expect(merged).toContain('<link rel="canonical" href="https://videokr.com/pricing">');
    expect(merged).toContain('<meta property="og:url" content="https://videokr.com/pricing">');
  });

  it('uses a trailing slash for the root canonical and og:url', () => {
    const merged = mergeLanding('<head></head>', BASE, SOURCE, '', '/');
    expect(merged).toContain('<link rel="canonical" href="https://videokr.com/">');
    expect(merged).toContain('<meta property="og:url" content="https://videokr.com/">');
  });

  it('injects schema immediately before the root head closes', () => {
    const merged = mergeLanding('<head></head>', BASE, SOURCE, SCHEMA, '/');
    expect(merged.indexOf(SCHEMA)).toBe(merged.indexOf('</head>') - SCHEMA.length);
  });

  it('inserts canonical and og:url when they are absent', () => {
    const merged = mergeLanding('<head></head>', BASE, SOURCE, '', '/pricing');
    expect(merged).toContain('<link rel="canonical" href="https://videokr.com/pricing">');
    expect(merged).toContain('<meta property="og:url" content="https://videokr.com/pricing">');
  });

  it('rewrites source-origin occurrences', () => {
    const merged = mergeLanding(`<head>${SOURCE}asset</head>`, BASE, SOURCE, '', '/pricing');
    expect(merged).toContain('https://videokr.com/asset');
    expect(merged).not.toContain(SOURCE);
  });

  it('returns html untouched when the head close is missing', () => {
    const html = `<html>${SOURCE}</html>`;
    expect(mergeLanding(html, BASE, SOURCE, SCHEMA, '/')).toBe(html);
  });

  it('does not inject schema on non-root paths', () => {
    const merged = mergeLanding('<head></head>', BASE, SOURCE, '', '/pricing');
    expect(merged).not.toContain('application/ld+json');
  });

  it('falls back to the site root for protocol-relative paths', () => {
    const merged = mergeLanding('<head></head>', BASE, SOURCE, '', '//evil.example/x');
    expect(merged).toContain('<link rel="canonical" href="https://videokr.com/">');
    expect(merged).toContain('<meta property="og:url" content="https://videokr.com/">');
  });

  it('keeps a normal path unchanged', () => {
    const merged = mergeLanding('<head></head>', BASE, SOURCE, '', '/pricing');
    expect(merged).toContain('<link rel="canonical" href="https://videokr.com/pricing">');
    expect(merged).toContain('<meta property="og:url" content="https://videokr.com/pricing">');
  });

  it('rewrites Get started contact anchors to signup', () => {
    const merged = mergeLanding(
      '<head><a href="./contact">Get started</a></head>',
      BASE,
      SOURCE,
      '',
      '/',
    );
    expect(merged).toContain(
      '<a href="https://videokr.com/login?mode=signup" data-videokr-signup="">Get started</a>',
    );
  });

  it('keeps team and footer contact anchors unchanged', () => {
    const merged = mergeLanding(
      '<head><a href="./contact">Talk to our team</a><a href="./contact">Contact</a></head>',
      BASE,
      SOURCE,
      '',
      '/',
    );
    expect(merged).toContain('<a href="./contact">Talk to our team</a>');
    expect(merged).toContain('<a href="./contact">Contact</a>');
  });

  it('rewrites only the Get started anchors among several contact links', () => {
    const merged = mergeLanding(
      '<head><a href="./contact"><span>Get started</span></a><a href="./contact">Contact</a><a href="./contact">Get started</a></head>',
      BASE,
      SOURCE,
      '',
      '/pricing',
    );
    expect(merged.match(/https:\/\/videokr\.com\/login\?mode=signup/g)).toHaveLength(2);
    expect(merged.match(/href="\.\/contact"/g)).toHaveLength(1);
    expect(merged.match(/data-videokr-signup=""/g)).toHaveLength(2);
  });

  it('injects one signup click handler before the body closes', () => {
    const merged = mergeLanding(
      '<head></head><body><a href="./contact">Get started</a></body>',
      BASE,
      SOURCE,
      '',
      '/',
    );
    expect(merged.match(/<script>/g)).toHaveLength(1);
    expect(merged).toContain('a[data-videokr-signup]');
    expect(merged.indexOf('<script>')).toBeLessThan(merged.indexOf('</body>'));
  });

  it('does not inject a click handler when no signup CTA is rewritten', () => {
    const merged = mergeLanding(
      '<head></head><body><a href="./contact">Contact</a></body>',
      BASE,
      SOURCE,
      '',
      '/about',
    );
    expect(merged).not.toContain('data-videokr-signup');
    expect(merged).not.toContain('window.location.assign');
  });

  it('does not warn for contact links on non-plan-card pages', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mergeLanding('<head><a href="./contact">Contact</a></head>', BASE, SOURCE, '', '/about');
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });

  it('warns when a plan-card page has no matching signup CTA', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    mergeLanding('<head><a href="./contact">Contact</a></head>', BASE, SOURCE, '', '/pricing');
    expect(warn).toHaveBeenCalledOnce();
    expect(warn).toHaveBeenCalledWith('[landing] no Get started CTA matched at /pricing');
    warn.mockRestore();
  });
});
