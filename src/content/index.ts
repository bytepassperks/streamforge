import { answersPages } from './answers';
import { blogPages } from './blog';
import { comparePages } from './compare';
import { docsPages } from './docs';
import { guidesPages } from './guides';
import type { ContentPage, Section, SectionId } from './types';

export type { ContentPage, Faq, Section, SectionId } from './types';

export const SECTIONS: Section[] = [
  {
    id: 'answers',
    title: 'Answers',
    blurb: 'Direct answers to the questions people ask about Videokr, one sentence first.',
    description:
      'Answers about Videokr: what it is, who it is for, pricing and plays, technical limits and formats, analytics and lead capture, WordPress, privacy, video SEO and how it compares with Wistia, Vidyard, Vimeo and YouTube.',
    pages: answersPages,
  },
  {
    id: 'docs',
    title: 'Documentation',
    blurb: 'How every part of Videokr works, written for the person configuring it.',
    description:
      'Videokr documentation: embeds, player and branding, sources, chapters and captions, CTAs and lead capture, playlists, analytics, privacy, webhooks, the WordPress plugin, and how plays are counted.',
    pages: docsPages,
  },
  {
    id: 'guides',
    title: 'Guides',
    blurb: 'Task-shaped answers to the video questions people actually search for.',
    description:
      'Practical guides to hosting, embedding and measuring video: WordPress video hosting, embed codes, video SEO, landing pages, lead capture, chapters, private video and choosing a platform.',
    pages: guidesPages,
  },
  {
    id: 'compare',
    title: 'Comparisons',
    blurb: 'Where Videokr fits, and where it is honestly the wrong choice.',
    description:
      'Videokr compared with Wistia, Vidyard, Vimeo, a YouTube embed, WordPress player plugins and self-hosting — including the cases where Videokr is the wrong tool.',
    pages: comparePages,
  },
  {
    id: 'blog',
    title: 'Blog',
    blurb: 'Method and opinion on video that has a job to do.',
    description:
      'Notes on video marketing that can be tested: SEO checklists, why benchmarks mislead, demo structure, pricing models, page speed, thumbnails and AI search.',
    pages: blogPages,
  },
];

const BY_ID = new Map<SectionId, Section>(SECTIONS.map((section) => [section.id, section]));

export function section(id: string): Section | undefined {
  return BY_ID.get(id as SectionId);
}

export function page(sectionId: string, slug: string): ContentPage | undefined {
  return section(sectionId)?.pages.find((entry) => entry.slug === slug);
}

export interface ContentRef {
  section: Section;
  page: ContentPage;
}

export function allPages(): ContentRef[] {
  return SECTIONS.flatMap((entry) => entry.pages.map((item) => ({ section: entry, page: item })));
}

export function pathFor(sectionId: SectionId, slug: string): string {
  return `/${sectionId}/${slug}`;
}

function refFromPath(ref: string): ContentRef | undefined {
  const [sectionId, slug] = ref.split('/');
  const found = section(sectionId);
  const entry = found?.pages.find((item) => item.slug === slug);
  return found && entry ? { section: found, page: entry } : undefined;
}

/**
 * Related links are explicit first — an author knows which page answers the
 * question this one raises — and then filled out by shared keywords, so a new
 * page is never an orphan and every page has somewhere to send a reader.
 */
export function relatedFor(current: ContentRef, limit = 4): ContentRef[] {
  const out: ContentRef[] = [];
  const seen = new Set<string>([`${current.section.id}/${current.page.slug}`]);
  const push = (ref: ContentRef | undefined): void => {
    if (!ref) return;
    const key = `${ref.section.id}/${ref.page.slug}`;
    if (seen.has(key) || out.length >= limit) return;
    seen.add(key);
    out.push(ref);
  };

  for (const ref of current.page.related ?? []) push(refFromPath(ref));

  if (out.length < limit) {
    const keywords = new Set(current.page.keywords.map((word) => word.toLowerCase()));
    const scored = allPages()
      .filter((ref) => !seen.has(`${ref.section.id}/${ref.page.slug}`))
      .map((ref) => ({
        ref,
        score: ref.page.keywords.filter((word) => keywords.has(word.toLowerCase())).length,
      }))
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score);
    for (const item of scored) push(item.ref);
  }

  /* A page with unique keywords still needs an exit: fall back to its own
     section, then to the most load-bearing pages in the library. */
  if (out.length < limit) {
    for (const item of current.section.pages) push({ section: current.section, page: item });
  }
  return out.slice(0, limit);
}
