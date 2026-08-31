import { describe, expect, it } from 'vitest';
import {
  canonicalRedirect,
  defaultPlayerConfig,
  deviceFromUserAgent,
  escapeHtml,
  hostnameAllowed,
  mergePlayerConfig,
  normalizeSkin,
  PLAYER_SKINS,
  newId,
  parseSource,
  retentionBucket,
  safeExternalUrl,
  slugify,
} from '../src/lib/util';
import {
  measureHlsBandwidth,
  rewriteHlsMasterBandwidth,
  selectHlsEncodedVariantIndexes,
  selectHlsMasterPlaylist,
  selectHlsVariantIndexes,
} from '../src/lib/hls';

describe('parseSource', () => {
  it('reads youtube watch, short, embed and shorts urls', () => {
    expect(parseSource('https://www.youtube.com/watch?v=c65tLZVgkcY')).toEqual({
      type: 'youtube',
      ref: 'c65tLZVgkcY',
    });
    expect(parseSource('https://youtu.be/c65tLZVgkcY')).toEqual({ type: 'youtube', ref: 'c65tLZVgkcY' });
    expect(parseSource('https://www.youtube.com/embed/c65tLZVgkcY?autoplay=1')).toEqual({
      type: 'youtube',
      ref: 'c65tLZVgkcY',
    });
    expect(parseSource('https://www.youtube.com/shorts/c65tLZVgkcY')).toEqual({
      type: 'youtube',
      ref: 'c65tLZVgkcY',
    });
  });

  it('accepts a bare 11 character youtube id', () => {
    expect(parseSource('c65tLZVgkcY')).toEqual({ type: 'youtube', ref: 'c65tLZVgkcY' });
  });

  it('reads vimeo urls and explicit vimeo ids', () => {
    expect(parseSource('https://vimeo.com/76979871')).toEqual({ type: 'vimeo', ref: '76979871' });
    expect(parseSource('https://player.vimeo.com/video/76979871')).toEqual({ type: 'vimeo', ref: '76979871' });
    expect(parseSource('76979871', 'vimeo')).toEqual({ type: 'vimeo', ref: '76979871' });
  });

  it('detects progressive and streaming media files', () => {
    expect(parseSource('https://cdn.example.com/a/clip.mp4')).toEqual({
      type: 'mp4',
      ref: 'https://cdn.example.com/a/clip.mp4',
    });
    expect(parseSource('https://cdn.example.com/a/master.m3u8')?.type).toBe('hls');
    expect(parseSource('/media/usr_a/file.mp4')?.type).toBe('mp4');
  });

  it('honours an explicit source type override', () => {
    expect(parseSource('https://cdn.example.com/stream', 'hls')).toEqual({
      type: 'hls',
      ref: 'https://cdn.example.com/stream',
    });
  });

  it('rejects empty and unrecognised sources', () => {
    expect(parseSource('')).toBeNull();
    expect(parseSource('   ')).toBeNull();
    expect(parseSource('https://example.com/not-a-video')).toBeNull();
    expect(parseSource('https://www.youtube.com/watch?v=tooshort')).toBeNull();
  });
});

describe('hostnameAllowed', () => {
  it('allows everything when the allowlist is empty', () => {
    expect(hostnameAllowed('anything.dev', '')).toBe(true);
    expect(hostnameAllowed('anything.dev', '  ,  ')).toBe(true);
  });

  it('matches exact hosts case-insensitively', () => {
    expect(hostnameAllowed('Example.com', 'example.com')).toBe(true);
    expect(hostnameAllowed('evil.com', 'example.com')).toBe(false);
  });

  it('supports wildcard subdomains including the apex', () => {
    expect(hostnameAllowed('blog.example.com', '*.example.com')).toBe(true);
    expect(hostnameAllowed('example.com', '*.example.com')).toBe(true);
    expect(hostnameAllowed('notexample.com', '*.example.com')).toBe(false);
  });

  it('accepts any entry in a comma separated list', () => {
    expect(hostnameAllowed('b.io', 'a.io, b.io ,c.io')).toBe(true);
  });
});

describe('retentionBucket', () => {
  it('maps a position onto 100 buckets', () => {
    expect(retentionBucket(0, 100)).toBe(0);
    expect(retentionBucket(50, 100)).toBe(50);
    expect(retentionBucket(99.9, 100)).toBe(99);
  });

  it('clamps out-of-range input', () => {
    expect(retentionBucket(500, 100)).toBe(99);
    expect(retentionBucket(-5, 100)).toBe(0);
    expect(retentionBucket(10, 0)).toBe(0);
  });
});

describe('slugify', () => {
  it('produces url safe slugs', () => {
    expect(slugify('My First Video!')).toBe('my-first-video');
    expect(slugify('  spaced   out  ')).toBe('spaced-out');
  });

  it('falls back when nothing survives', () => {
    expect(slugify('!!!')).toBe('video');
    expect(slugify('', 'playlist')).toBe('playlist');
  });
});

describe('escapeHtml + safeExternalUrl', () => {
  it('escapes html control characters', () => {
    expect(escapeHtml('<img src=x onerror="a">')).toBe('&lt;img src=x onerror=&quot;a&quot;&gt;');
  });

  it('rejects javascript urls', () => {
    expect(safeExternalUrl('javascript:alert(1)')).toBe('');
    expect(safeExternalUrl('https://example.com')).toBe('https://example.com');
    expect(safeExternalUrl('/v/slug')).toBe('/v/slug');
  });
});

describe('player config', () => {
  it('merges partial stored config over defaults', () => {
    const merged = mergePlayerConfig(JSON.stringify({ accent: '#ff0000', controls: { pip: false } }));
    expect(merged.accent).toBe('#ff0000');
    expect(merged.controls.pip).toBe(false);
    expect(merged.controls.fullscreen).toBe(defaultPlayerConfig().controls.fullscreen);
  });

  it('falls back to defaults on invalid json or empty speeds', () => {
    expect(mergePlayerConfig('not json')).toEqual(defaultPlayerConfig());
    expect(mergePlayerConfig(null)).toEqual(defaultPlayerConfig());
    expect(mergePlayerConfig(JSON.stringify({ speeds: [] })).speeds).toEqual(defaultPlayerConfig().speeds);
  });

  it('defaults to the videokr skin', () => {
    expect(defaultPlayerConfig().skin).toBe('videokr');
    expect(PLAYER_SKINS[0]).toBe('videokr');
  });

  it('keeps a shipped skin and maps a retired one onto the shipped set', () => {
    PLAYER_SKINS.forEach((skin) => expect(normalizeSkin(skin)).toBe(skin));
    expect(normalizeSkin('wave')).toBe('wave');
    expect(normalizeSkin('forge-dark')).toBe('videokr');
    expect(normalizeSkin('glass')).toBe('frame');
    expect(normalizeSkin('bold')).toBe('pop');
    expect(normalizeSkin('minimal')).toBe('studio');
  });

  it('never renders an unknown skin', () => {
    expect(normalizeSkin('')).toBe('videokr');
    expect(normalizeSkin(undefined)).toBe('videokr');
    expect(normalizeSkin('<script>')).toBe('videokr');
    expect(mergePlayerConfig(JSON.stringify({ skin: 'nope' })).skin).toBe('videokr');
    expect(mergePlayerConfig(JSON.stringify({ skin: 'pop' })).skin).toBe('pop');
  });
});

describe('HLS variant selection', () => {
  it('only adds encoded renditions below the source at standard ladder steps', () => {
    expect(selectHlsEncodedVariantIndexes(1080)).toEqual([0, 1]);
    expect(selectHlsEncodedVariantIndexes(720)).toEqual([0]);
    expect(selectHlsEncodedVariantIndexes(480)).toEqual([]);
    expect(selectHlsEncodedVariantIndexes(360)).toEqual([]);
  });

  it('keeps the copied rendition when its segments are at most 12 seconds', () => {
    expect(selectHlsVariantIndexes(12)).toEqual([0, 1, 2]);
  });

  it('drops the copied rendition when its segments exceed 12 seconds', () => {
    expect(selectHlsVariantIndexes(12.01)).toEqual([0, 1]);
    const master = '#EXTM3U\n#EXT-X-STREAM-INF:BANDWIDTH=1\nv0/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=2\nv1/index.m3u8\n#EXT-X-STREAM-INF:BANDWIDTH=3\nv2/index.m3u8\n';
    expect(selectHlsMasterPlaylist(master, [0, 1])).not.toContain('v2/index.m3u8');
  });

  it('measures a sliding-window peak below a single-segment spike', () => {
    const playlist = [
      '#EXTM3U',
      '#EXTINF:4,',
      'seg_000.ts',
      '#EXTINF:4,',
      'seg_001.ts',
      '#EXTINF:4,',
      'seg_002.ts',
      '#EXTINF:4,',
      'seg_003.ts',
    ].join('\n');
    expect(
      measureHlsBandwidth(playlist, {
        'seg_000.ts': 100_000,
        'seg_001.ts': 100_000,
        'seg_002.ts': 1_000_000,
        'seg_003.ts': 100_000,
      }),
    ).toEqual({ bandwidth: 800_000, averageBandwidth: 650_000 });
  });

  it('uses the whole-rendition average when it is shorter than the window', () => {
    const playlist = '#EXTM3U\n#EXTINF:4,\nseg_000.ts\n#EXTINF:1.5,\nseg_001.ts\n';
    expect(
      measureHlsBandwidth(playlist, { 'seg_000.ts': 50_000, 'seg_001.ts': 100_000 }),
    ).toEqual({ bandwidth: 218_182, averageBandwidth: 218_182 });
  });

  it('rewrites both measured attributes while preserving metadata and pairing', () => {
    const master = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=100,AVERAGE-BANDWIDTH=200,RESOLUTION=640x360',
      'v0/index.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=200,RESOLUTION=1280x720,CODECS="avc1"',
      'v1/index.m3u8',
    ].join('\n');
    const playlist = [
      '#EXTM3U',
      '#EXTINF:4,',
      'seg_000.ts',
      '#EXTINF:4,',
      'seg_001.ts',
      '#EXTINF:4,',
      'seg_002.ts',
      '#EXTINF:4,',
      'seg_003.ts',
    ].join('\n');
    const rewritten = rewriteHlsMasterBandwidth(master, [
      {
        playlist,
        segmentSizes: {
          'seg_000.ts': 100_000,
          'seg_001.ts': 100_000,
          'seg_002.ts': 1_000_000,
          'seg_003.ts': 100_000,
        },
      },
      {
        playlist,
        segmentSizes: {
          'seg_000.ts': 50_000,
          'seg_001.ts': 50_000,
          'seg_002.ts': 500_000,
          'seg_003.ts': 50_000,
        },
      },
    ]);
    expect(rewritten).toContain(
      '#EXT-X-STREAM-INF:BANDWIDTH=800000,AVERAGE-BANDWIDTH=650000,RESOLUTION=640x360',
    );
    expect(rewritten).toContain(
      '#EXT-X-STREAM-INF:BANDWIDTH=400000,AVERAGE-BANDWIDTH=325000,RESOLUTION=1280x720,CODECS="avc1"',
    );
    expect(rewritten).toContain('v0/index.m3u8\n#EXT-X-STREAM-INF');
  });

  it('leaves invalid measurements and already-correct values unchanged', () => {
    const master = [
      '#EXTM3U',
      '#EXT-X-STREAM-INF:BANDWIDTH=100000,AVERAGE-BANDWIDTH=100000,CODECS="avc1"',
      'v0/index.m3u8',
      '#EXT-X-STREAM-INF:BANDWIDTH=200000,RESOLUTION=1280x720',
      'v1/index.m3u8',
    ].join('\n');
    const playlist = '#EXTM3U\n#EXTINF:4,\nseg_000.ts\n';
    expect(
      rewriteHlsMasterBandwidth(master, [
        { playlist, segmentSizes: { 'seg_000.ts': 50_000 } },
        { playlist, segmentSizes: {} },
      ]),
    ).toBe(master);
  });
});

describe('deviceFromUserAgent', () => {
  it('classifies common agents', () => {
    expect(deviceFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0)')).toBe('mobile');
    expect(deviceFromUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0)')).toBe('tablet');
    expect(deviceFromUserAgent('Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)')).toBe('desktop');
    expect(deviceFromUserAgent('')).toBe('unknown');
  });
});

describe('newId', () => {
  it('is prefixed and unique', () => {
    const a = newId('vid');
    const b = newId('vid');
    expect(a.startsWith('vid_')).toBe(true);
    expect(a).not.toBe(b);
    expect(newId()).toHaveLength(16);
  });
});

describe('canonicalRedirect', () => {
  const base = 'https://videokr.com';

  it('sends the workers.dev name and www to the domain, keeping path and query', () => {
    expect(canonicalRedirect('https://streamforge.getlaunchpod.workers.dev/e/vid_a?autoplay=1', base))
      .toBe('https://videokr.com/e/vid_a?autoplay=1');
    expect(canonicalRedirect('https://www.videokr.com/v/film', base)).toBe('https://videokr.com/v/film');
  });

  it('leaves the canonical host, localhost and unknown hosts alone', () => {
    expect(canonicalRedirect('https://videokr.com/app.html', base)).toBe('');
    expect(canonicalRedirect('http://localhost:8787/app.html', base)).toBe('');
    expect(canonicalRedirect('https://videokr.com.evil.test/', base)).toBe('');
  });

  it('does not redirect when no base url is configured', () => {
    expect(canonicalRedirect('https://streamforge.getlaunchpod.workers.dev/', '')).toBe('');
  });
});
