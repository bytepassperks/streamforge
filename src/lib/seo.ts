import type { Chapter, Env, Video } from './types';

/** Public identity of the product, kept in one place so page copy, structured
 *  data, `llms.txt` and social metadata can never drift apart. */
export const SITE = {
  name: 'Videokr',
  tagline: 'your video, your player, your data',
  description:
    'Videokr is hosted video for marketing sites: upload or link a video, brand the player, capture emails inside it, embed it anywhere and read second-by-second retention. Free tier forever, $69 lifetime, or metered plans.',
  email: 'hello@videokr.com',
  social: [
    'https://www.youtube.com/@videokr-s7z',
    'https://www.instagram.com/videokrmaker/',
    'https://www.facebook.com/profile.php?id=61593628350806',
    'https://www.pinterest.com/videokr/',
    'https://www.reddit.com/user/videokr/',
  ],
} as const;

export function baseUrl(env: Env): string {
  return (env.PUBLIC_BASE_URL || 'https://videokr.com').replace(/\/$/, '');
}

/** Social and structured-data consumers reject relative URLs, so every emitted
 *  URL is resolved against the canonical host. */
export function absoluteUrl(base: string, url: string): string {
  if (!url) return '';
  if (/^https?:\/\//i.test(url)) return url;
  return `${base}${url.startsWith('/') ? '' : '/'}${url}`;
}

/**
 * A video keeps the placeholder title until its owner names it. Those pages say
 * nothing a search engine can rank, so they stay out of the sitemap and out of
 * the IndexNow feed — the page itself is still public and reachable, it just
 * does not get pushed at crawlers as if it were content.
 */
export function isWorthIndexing(title: string): boolean {
  return !/^untitled video(\s+\d+)?$/i.test(title.trim());
}

export function isoDate(seconds: number): string {
  return new Date(seconds * 1000).toISOString();
}

export function isoDuration(seconds: number): string | undefined {
  const total = Math.round(seconds);
  if (!Number.isFinite(total) || total <= 0) return undefined;
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s || (!h && !m) ? `${s}S` : ''}`;
}

/** JSON-LD is written into a `<script>` element, so the sequence that could end
 *  that element early has to be neutralised. */
export function jsonLdScript(data: unknown): string {
  const json = JSON.stringify(data).replace(/</g, '\\u003c');
  return `<script type="application/ld+json">${json}</script>`;
}

export function organizationLd(base: string): Record<string, unknown> {
  return {
    '@type': 'Organization',
    '@id': `${base}/#organization`,
    name: SITE.name,
    alternateName: ['Videokr.com', 'Videokr video hosting'],
    description: SITE.description,
    /* An unrelated academic dataset shares the spelling, and assistants answer
       "what is Videokr" from it. Stating the distinction in the entity itself is
       the machine-readable half of the disambiguation page. */
    disambiguatingDescription:
      'Videokr is a commercial hosted video-marketing platform at videokr.com. It is unrelated to the similarly-spelled VideoKR academic video-reasoning dataset and benchmark.',
    slogan: SITE.tagline,
    url: `${base}/`,
    logo: {
      '@type': 'ImageObject',
      url: `${base}/brand/mark-512.png`,
      width: 512,
      height: 512,
    },
    email: SITE.email,
    sameAs: [...SITE.social],
    mainEntityOfPage: `${base}/answers/what-is-videokr`,
  };
}

export function webSiteLd(base: string): Record<string, unknown> {
  return {
    '@type': 'WebSite',
    '@id': `${base}/#website`,
    name: SITE.name,
    url: `${base}/`,
    description: SITE.description,
    inLanguage: 'en',
    publisher: { '@id': `${base}/#organization` },
  };
}

export function breadcrumbLd(
  base: string,
  trail: { name: string; url: string }[],
): Record<string, unknown> {
  return {
    '@type': 'BreadcrumbList',
    itemListElement: trail.map((item, index) => ({
      '@type': 'ListItem',
      position: index + 1,
      name: item.name,
      item: absoluteUrl(base, item.url),
    })),
  };
}

/** Own-media sources can advertise a `contentUrl`; a YouTube or Vimeo source
 *  belongs to that platform and must not be claimed as ours. */
function contentUrlFor(base: string, video: Video): string | undefined {
  if (video.source_type === 'youtube' || video.source_type === 'vimeo') return undefined;
  if (!video.source_ref) return undefined;
  return absoluteUrl(base, video.source_ref);
}

export interface VideoLdInput {
  video: Video;
  chapters: Pick<Chapter, 'start_seconds' | 'title'>[];
  plays: number;
}

export function videoObjectLd(base: string, input: VideoLdInput): Record<string, unknown> {
  const { video, chapters, plays } = input;
  const pageUrl = `${base}/v/${video.slug}`;
  const duration = video.duration || 0;
  /* Key moments are only valid when a clip has both a start and an end, so the
     final chapter is closed with the video's own duration. */
  const clips = chapters
    .map((chapter, index): Record<string, unknown> | null => {
      const end = index + 1 < chapters.length ? chapters[index + 1].start_seconds : duration;
      if (!(end > chapter.start_seconds)) return null;
      return {
        '@type': 'Clip',
        name: chapter.title,
        startOffset: Math.round(chapter.start_seconds),
        endOffset: Math.round(end),
        url: `${pageUrl}?t=${Math.round(chapter.start_seconds)}`,
      };
    })
    .filter((clip): clip is Record<string, unknown> => clip !== null);

  const ld: Record<string, unknown> = {
    '@type': 'VideoObject',
    '@id': `${pageUrl}#video`,
    name: video.title,
    description: video.description || video.title,
    thumbnailUrl: video.thumbnail_url ? absoluteUrl(base, video.thumbnail_url) : undefined,
    uploadDate: isoDate(video.created_at),
    duration: isoDuration(duration),
    url: pageUrl,
    embedUrl: `${base}/e/${video.slug}`,
    contentUrl: contentUrlFor(base, video),
    isFamilyFriendly: true,
    inLanguage: 'en',
    publisher: { '@id': `${base}/#organization` },
    potentialAction: {
      '@type': 'SeekToAction',
      target: `${pageUrl}?t={seek_to_second_number}`,
      'startOffset-input': 'required name=seek_to_second_number',
    },
  };
  if (video.transcript) ld.transcript = video.transcript.slice(0, 5000);
  if (clips.length) ld.hasPart = clips;
  if (plays > 0) {
    ld.interactionStatistic = {
      '@type': 'InteractionCounter',
      interactionType: { '@type': 'WatchAction' },
      userInteractionCount: plays,
    };
  }
  return ld;
}

export function graphLd(nodes: Record<string, unknown>[]): string {
  return jsonLdScript({ '@context': 'https://schema.org', '@graph': nodes });
}
