import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = join(import.meta.dirname, '..');

describe('native encoder ladder', () => {
  it('encodes the top rung instead of copying it', () => {
    const source = readFileSync(join(root, 'scripts/encoder-agent.mjs'), 'utf8');
    expect(source).toMatch(
      /const targetHeight = variant === 0 \? 360 : variant === 1 \? 720 : height;[\s\S]*?`-c:v:\$\{stream\}`, 'libx264'[\s\S]*?`-crf:v:\$\{stream\}`, variant === 0 \? '26' : variant === 1 \? '24' : '21'[\s\S]*?`-maxrate:v:\$\{stream\}`, variant === 0 \? '800k' : variant === 1 \? '2500k' : '4500k'[\s\S]*?`-bufsize:v:\$\{stream\}`, variant === 0 \? '1600k' : variant === 1 \? '5000k' : '9000k'[\s\S]*?`-g:v:\$\{stream\}`, '60'[\s\S]*?`-force_key_frames:v:\$\{stream\}`, 'expr:gte\(t,n_forced\*2\)'/,
    );
    expect(source).not.toContain('`-c:v:${stream}`, \'copy\'');
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
