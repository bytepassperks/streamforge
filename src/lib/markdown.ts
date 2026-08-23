import { escapeHtml } from './util';

/**
 * Content pages are authored once, in Markdown, and served two ways: as HTML to
 * people and search crawlers, and as the same Markdown to assistants that ask
 * for the `.md` twin. That rules out an HTML-only authoring format, and a full
 * CommonMark parser would be far more code than the handful of constructs the
 * library actually uses, so this renders exactly those constructs.
 */

export interface Heading {
  id: string;
  text: string;
}

export interface RenderedMarkdown {
  html: string;
  headings: Heading[];
}

function slugForHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
    .slice(0, 60);
}

/* Private-use character: it cannot appear in authored prose, so it is a safe
   placeholder for a lifted-out code span. */
const SENTINEL = '\uE000';
const SENTINEL_RE = /\uE000(\d+)\uE000/g;

/** Inline: links, bold, and code — escaped first so authored text is inert. */
export function renderInline(source: string): string {
  const codes: string[] = [];
  /* Code spans are lifted out before anything else so a `[` or `**` inside a
     snippet is shown verbatim instead of being read as markup. */
  const withoutCode = source.replace(/`([^`]+)`/g, (_match, code: string) => {
    codes.push(`<code>${escapeHtml(code)}</code>`);
    return `${SENTINEL}${codes.length - 1}${SENTINEL}`;
  });
  let html = escapeHtml(withoutCode)
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (_match, text: string, href: string) => {
      const external = /^https?:\/\//i.test(href) && !href.includes('videokr.com');
      const attrs = external ? ' rel="noopener"' : '';
      return `<a href="${href}"${attrs}>${text}</a>`;
    })
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])_([^_]+)_(?=[\s.,;:)!?]|$)/g, '$1<em>$2</em>');
  html = html.replace(SENTINEL_RE, (_match, index: string) => codes[Number(index)]);
  return html;
}

/**
 * Block level: h2/h3, paragraphs, bullet and ordered lists, tables, blockquotes
 * and fenced code. Headings get ids so a page can carry its own contents list
 * and so an assistant can deep-link an answer.
 */
export function renderMarkdown(source: string): RenderedMarkdown {
  const lines = source.replace(/\r\n/g, '\n').split('\n');
  const out: string[] = [];
  const headings: Heading[] = [];
  let index = 0;

  const paragraph = (buffer: string[]): void => {
    if (buffer.length) out.push(`<p>${renderInline(buffer.join(' '))}</p>`);
    buffer.length = 0;
  };

  while (index < lines.length) {
    const line = lines[index];

    if (!line.trim()) {
      index += 1;
      continue;
    }

    if (line.startsWith('```')) {
      const code: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        code.push(lines[index]);
        index += 1;
      }
      index += 1;
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`);
      continue;
    }

    const heading = /^(#{2,3})\s+(.*)$/.exec(line);
    if (heading) {
      const level = heading[1].length;
      const text = heading[2].trim();
      const id = slugForHeading(text);
      if (level === 2) headings.push({ id, text });
      out.push(`<h${level} id="${id}">${renderInline(text)}</h${level}>`);
      index += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const quote: string[] = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        quote.push(lines[index].slice(2));
        index += 1;
      }
      out.push(`<blockquote><p>${renderInline(quote.join(' '))}</p></blockquote>`);
      continue;
    }

    if (line.startsWith('| ')) {
      const rows: string[][] = [];
      while (index < lines.length && lines[index].startsWith('| ')) {
        const cells = lines[index]
          .replace(/^\|/, '')
          .replace(/\|$/, '')
          .split('|')
          .map((cell) => cell.trim());
        // The dashed separator row only tells a reader where the header ends.
        if (!cells.every((cell) => /^:?-{2,}:?$/.test(cell))) rows.push(cells);
        index += 1;
      }
      const [head, ...body] = rows;
      const headHtml = head.map((cell) => `<th scope="col">${renderInline(cell)}</th>`).join('');
      const bodyHtml = body
        .map(
          (row) =>
            `<tr>${row
              .map((cell, cellIndex) =>
                cellIndex === 0
                  ? `<th scope="row">${renderInline(cell)}</th>`
                  : `<td>${renderInline(cell)}</td>`,
              )
              .join('')}</tr>`,
        )
        .join('');
      out.push(
        `<div class="sf-table-wrap"><table class="sf-table"><thead><tr>${headHtml}</tr></thead><tbody>${bodyHtml}</tbody></table></div>`,
      );
      continue;
    }

    if (/^[-*]\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^[-*]\s+/, ''))}</li>`);
        index += 1;
      }
      out.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s+/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s+/.test(lines[index])) {
        items.push(`<li>${renderInline(lines[index].replace(/^\d+\.\s+/, ''))}</li>`);
        index += 1;
      }
      out.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    const buffer: string[] = [];
    while (
      index < lines.length &&
      lines[index].trim() &&
      !/^(#{2,3}\s|```|>\s|\|\s|[-*]\s|\d+\.\s)/.test(lines[index])
    ) {
      buffer.push(lines[index].trim());
      index += 1;
    }
    paragraph(buffer);
  }

  return { html: out.join('\n'), headings };
}

/** First sentences of the body, for a list page or a meta description. */
export function plainText(source: string, limit = 300): string {
  const text = source
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/^[#>|-].*$/gm, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/[*`_]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > limit ? `${text.slice(0, limit - 1).trimEnd()}…` : text;
}
