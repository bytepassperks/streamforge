import { ASSET_STAMPS } from '../asset-stamps';

/**
 * Adds the content hash to an asset URL. Unknown paths are returned untouched
 * so a missing stamp degrades to today's behaviour rather than a 404.
 */
export function stamp(path: string): string {
  const version = ASSET_STAMPS[path];
  return version ? `${path}?v=${version}` : path;
}

/** True when the request already carries the current hash for this asset. */
export function isStamped(path: string, version: string | undefined): boolean {
  return Boolean(version) && ASSET_STAMPS[path] === version;
}

const ATTR = /(href|src)="(\/[^"?]+)"/g;

/**
 * Rewrites asset references in a static HTML page so they carry the current
 * hash. The HTML itself is always revalidated, so the page is what breaks the
 * cache for everything it loads.
 */
export function stampHtml(html: string): string {
  return html.replace(ATTR, (match, attr: string, path: string) => {
    const version = ASSET_STAMPS[path];
    return version ? `${attr}="${path}?v=${version}"` : match;
  });
}
