import { describe, expect, it } from 'vitest';
import { mergeLanding } from '../src/lib/landing';

const BASE = 'https://videokr.com';
const SOURCE = 'https://faithful-shape-634315.framer.app/';
const SCHEMA = '<script type="application/ld+json">{"@type":"Organization"}</script>';

describe('mergeLanding', () => {
  it('forces canonical and og:url values to the site base', () => {
    const html =
      '<head><link rel="canonical" href="https://wrong.example/"><meta property="og:url" content="https://wrong.example/"></head>';
    const merged = mergeLanding(html, BASE, SOURCE, '');
    expect(merged).toContain('<link rel="canonical" href="https://videokr.com/">');
    expect(merged).toContain('<meta property="og:url" content="https://videokr.com/">');
  });

  it('inserts canonical and og:url when they are absent', () => {
    const merged = mergeLanding('<head></head>', BASE, SOURCE, '');
    expect(merged).toContain('<link rel="canonical" href="https://videokr.com/">');
    expect(merged).toContain('<meta property="og:url" content="https://videokr.com/">');
  });

  it('injects schema immediately before the head closes', () => {
    const merged = mergeLanding('<head></head>', BASE, SOURCE, SCHEMA);
    expect(merged.indexOf(SCHEMA)).toBe(merged.indexOf('</head>') - SCHEMA.length);
  });

  it('rewrites source-origin occurrences', () => {
    const merged = mergeLanding(`<head>${SOURCE}asset</head>`, BASE, SOURCE, '');
    expect(merged).toContain('https://videokr.com/asset');
    expect(merged).not.toContain(SOURCE);
  });

  it('returns html untouched when the head close is missing', () => {
    const html = `<html>${SOURCE}</html>`;
    expect(mergeLanding(html, BASE, SOURCE, SCHEMA)).toBe(html);
  });

  it('does not inject an empty schema', () => {
    const merged = mergeLanding('<head></head>', BASE, SOURCE, '');
    expect(merged).not.toContain('application/ld+json');
  });
});
