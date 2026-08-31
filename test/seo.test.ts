import { describe, expect, it } from 'vitest';
import type { Video } from '../src/lib/types';
import {
  absoluteUrl,
  breadcrumbLd,
  isWorthIndexing,
  isoDuration,
  jsonLdScript,
  organizationLd,
  videoObjectLd,
} from '../src/lib/seo';

const BASE = 'https://videokr.com';

function video(overrides: Partial<Video> = {}): Video {
  return {
    id: 'vid_1',
    user_id: 'usr_1',
    project_id: null,
    slug: 'the-film',
    title: 'The film',
    description: 'A film.',
    source_type: 'mp4',
    source_ref: '/media/usr_1/a.mp4',
    fallback_ref: '',
    duration: 130,
    thumbnail_url: '/media/usr_1/a.jpg',
    thumbnail_url_b: '',
    captions_url: '',
    transcript: '',
    player_config: '{}',
    visibility: 'public',
    password_hash: '',
    password_salt: '',
    allowed_domains: '',
    created_at: 1_700_000_000,
    updated_at: 1_700_000_500,
    ...overrides,
  };
}

describe('absoluteUrl', () => {
  it('resolves site-relative paths and leaves absolute ones alone', () => {
    expect(absoluteUrl(BASE, '/media/a.jpg')).toBe('https://videokr.com/media/a.jpg');
    expect(absoluteUrl(BASE, 'media/a.jpg')).toBe('https://videokr.com/media/a.jpg');
    expect(absoluteUrl(BASE, 'https://i.ytimg.com/vi/x/hq.jpg')).toBe('https://i.ytimg.com/vi/x/hq.jpg');
    expect(absoluteUrl(BASE, '')).toBe('');
  });
});

describe('isoDuration', () => {
  it('writes hours, minutes and seconds only when present', () => {
    expect(isoDuration(130)).toBe('PT2M10S');
    expect(isoDuration(3600)).toBe('PT1H');
    expect(isoDuration(3661)).toBe('PT1H1M1S');
    expect(isoDuration(0)).toBeUndefined();
    expect(isoDuration(Number.NaN)).toBeUndefined();
  });
});

describe('jsonLdScript', () => {
  it('never lets embedded markup close the script element', () => {
    const html = jsonLdScript({ name: '</script><img onerror=x>' });
    expect(html).not.toContain('</script><img');
    expect(html.endsWith('</script>')).toBe(true);
  });
});

describe('videoObjectLd', () => {
  it('describes an own-hosted video with chapters as clips', () => {
    const ld = videoObjectLd(BASE, {
      video: video(),
      chapters: [
        { start_seconds: 0, title: 'Open' },
        { start_seconds: 40, title: 'Player' },
      ],
      plays: 12,
    });
    expect(ld.url).toBe('https://videokr.com/v/the-film');
    expect(ld.embedUrl).toBe('https://videokr.com/e/the-film');
    expect(ld.contentUrl).toBe('https://videokr.com/media/usr_1/a.mp4');
    expect(ld.duration).toBe('PT2M10S');
    expect(ld.thumbnailUrl).toBe('https://videokr.com/media/usr_1/a.jpg');
    const clips = ld.hasPart as { startOffset: number; endOffset: number }[];
    expect(clips).toHaveLength(2);
    expect(clips[0]).toMatchObject({ startOffset: 0, endOffset: 40 });
    expect(clips[1]).toMatchObject({ startOffset: 40, endOffset: 130 });
    expect(ld.interactionStatistic).toMatchObject({ userInteractionCount: 12 });
  });

  it('never claims a third-party file as our own content', () => {
    const ld = videoObjectLd(BASE, {
      video: video({ source_type: 'youtube', source_ref: 'c65tLZVgkcY' }),
      chapters: [],
      plays: 0,
    });
    expect(ld.contentUrl).toBeUndefined();
    expect(ld.hasPart).toBeUndefined();
    expect(ld.interactionStatistic).toBeUndefined();
  });

  it('drops a trailing chapter that cannot be closed', () => {
    const ld = videoObjectLd(BASE, {
      video: video({ duration: 0 }),
      chapters: [{ start_seconds: 0, title: 'Only' }],
      plays: 0,
    });
    expect(ld.hasPart).toBeUndefined();
    expect(ld.duration).toBeUndefined();
  });
});

describe('identity graph', () => {
  it('publishes one organization node the other nodes can point at', () => {
    const org = organizationLd(BASE);
    expect(org['@id']).toBe('https://videokr.com/#organization');
    expect((org.sameAs as string[]).length).toBeGreaterThan(0);
  });

  it('states the brand distinction machine-readably, since the name collides', () => {
    const org = organizationLd(BASE);
    expect(String(org.disambiguatingDescription)).toContain('videokr.com');
    expect(String(org.disambiguatingDescription)).toContain('unrelated');
    expect(org.mainEntityOfPage).toBe('https://videokr.com/answers/what-is-videokr');
  });

  it('numbers breadcrumb positions from one and absolutises items', () => {
    const crumbs = breadcrumbLd(BASE, [
      { name: 'Videokr', url: '/' },
      { name: 'The film', url: '/v/the-film' },
    ]);
    const items = crumbs.itemListElement as { position: number; item: string }[];
    expect(items[0]).toMatchObject({ position: 1, item: 'https://videokr.com/' });
    expect(items[1]).toMatchObject({ position: 2, item: 'https://videokr.com/v/the-film' });
  });
});

describe('index-worthiness', () => {
  it('keeps placeholder titles out of the sitemap and the IndexNow feed', () => {
    expect(isWorthIndexing('Untitled video')).toBe(false);
    expect(isWorthIndexing('untitled video 2')).toBe(false);
    expect(isWorthIndexing('  Untitled Video 12  ')).toBe(false);
  });

  it('leaves a named video alone, including one that merely mentions the word', () => {
    expect(isWorthIndexing('Videokr — the product film')).toBe(true);
    expect(isWorthIndexing('Untitled video: the director’s cut')).toBe(true);
    expect(isWorthIndexing('Entrepreneur Life')).toBe(true);
  });
});
