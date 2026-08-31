import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

describe('native encoder ladder', () => {
  it('encodes the top rung instead of copying it', () => {
    const source = readFileSync(join(root, 'scripts/encoder-agent.mjs'), 'utf8');
    expect(source).toMatch(
      /const targetHeight = variant === 0 \? 360 : variant === 1 \? 720 : Math\.min\(height, 1080\);[\s\S]*?`-c:v:\$\{stream\}`, 'libx264'[\s\S]*?`-preset:v:\$\{stream\}`, 'veryfast'[\s\S]*?`-crf:v:\$\{stream\}`, variant === 0 \? '26' : variant === 1 \? '24' : '21'[\s\S]*?`-maxrate:v:\$\{stream\}`, variant === 0 \? '800k' : variant === 1 \? '2500k' : '4500k'[\s\S]*?`-bufsize:v:\$\{stream\}`, variant === 0 \? '1600k' : variant === 1 \? '5000k' : '9000k'[\s\S]*?`-c:a:\$\{stream\}`, 'aac'[\s\S]*?`-b:a:\$\{stream\}`, variant === 0 \? '96k' : '128k'[\s\S]*?`-g:v:\$\{stream\}`, '60'[\s\S]*?`-force_key_frames:v:\$\{stream\}`, 'expr:gte\(t,n_forced\*2\)'/,
    );
    expect(source).not.toContain('`-c:v:${stream}`, \'copy\'');
    expect(source).toContain("'-hls_time', '2'");
  });

  it('skips sources below 720p before creating a ladder', () => {
    const source = readFileSync(join(root, 'scripts/encoder-agent.mjs'), 'utf8');
    expect(source).toMatch(
      /const encoded = encodedVariantIndexes\(height\);\s*if \(encoded\.length === 0\) \{\s*console\.log\(`Skipped \$\{video\.id\}: already small enough to stream`\);\s*return;\s*\}/,
    );
    expect(source).not.toContain('longestSegment');
    expect(source).not.toContain('copyDirectory');
  });
});

describe('HLS player configuration', () => {
  it('uses a more eager up-switch factor without changing the estimate', () => {
    const source = readFileSync(join(root, 'public/player/player.js'), 'utf8');
    expect(source).toMatch(
      /abrEwmaDefaultEstimate: 2500000,\s*abrBandWidthUpFactor: 0\.8,\s*testBandwidth: false,\s*startLevel: -1/,
    );
  });
});
