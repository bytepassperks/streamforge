/** The four content sections. Each one is a directory in the URL space. */
export type SectionId = 'docs' | 'guides' | 'compare' | 'blog';

export interface Faq {
  q: string;
  a: string;
}

export interface ContentPage {
  slug: string;
  /** `<h1>` and the label used wherever the page is linked. */
  title: string;
  /** Overrides the `<title>` tag when the h1 alone reads badly in a SERP. */
  metaTitle?: string;
  /** Meta description and the summary shown on the section's hub page. */
  description: string;
  /**
   * Answer-first opening paragraph. Rendered above the body and reused as the
   * page's summary in structured data, so an answer engine can quote the page
   * without having to infer what it claims.
   */
  answer: string;
  /** ISO date of the last meaningful edit; drives `lastmod` and `dateModified`. */
  updated: string;
  published?: string;
  /** Terms the page is genuinely about — used for related-page matching. */
  keywords: string[];
  /** Markdown body. */
  body: string;
  faqs?: Faq[];
  /** Explicit `section/slug` links, ahead of keyword-matched ones. */
  related?: string[];
}

export interface Section {
  id: SectionId;
  title: string;
  /** Short line under the hub heading. */
  blurb: string;
  description: string;
  pages: ContentPage[];
}
