import type { PlayerConfig, SourceType } from './types';

const ID_ALPHABET = 'abcdefghijkmnopqrstuvwxyz23456789';

export function newId(prefix = ''): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  let out = '';
  for (const b of bytes) out += ID_ALPHABET[b % ID_ALPHABET.length];
  return prefix ? `${prefix}_${out}` : out;
}

export function now(): number {
  return Math.floor(Date.now() / 1000);
}

export function slugify(input: string, fallback = 'video'): string {
  const base = input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 60)
    .replace(/^-|-$/g, '');
  return base || fallback;
}

export function normalizeCtaUrl(raw: unknown): string {
  const value = String(raw ?? '').trim();
  if (!value) return '';
  if (/^(javascript|data|vbscript):/i.test(value)) return '';
  if (/^(https?:|mailto:|tel:)/i.test(value)) return value;
  if (value.startsWith('/') || value.startsWith('#')) return value;
  return 'https://' + value;
}

export const CTA_STYLES = [
  'card',
  'solid',
  'minimal',
  'outline',
  'glass',
  'bar',
  'ribbon',
  'toast',
  'spotlight',
  'gradient',
] as const;

export const GATE_STYLES = [
  'card',
  'light',
  'solid',
  'outline',
  'glass',
  'sheet',
  'spotlight',
  'minimal',
  'split',
  'gradient',
] as const;

export function normalizeCtaStyle(value: unknown, kind: unknown): string {
  const styles = kind === 'gate' || kind === 'endscreen' ? GATE_STYLES : CTA_STYLES;
  return (styles as readonly string[]).includes(String(value ?? '')) ? String(value) : 'card';
}

export function escapeHtml(input: string): string {
  return input
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export interface ParsedSource {
  type: SourceType;
  ref: string;
}

/**
 * Accepts a YouTube/Vimeo URL or bare id, or a direct media URL, and normalises
 * it to a source type plus reference.
 */
export function parseSource(input: string, explicitType?: string): ParsedSource | null {
  const raw = input.trim();
  if (!raw) return null;

  if (explicitType === 'mp4' || explicitType === 'hls') {
    return { type: explicitType, ref: raw };
  }

  if (/^[A-Za-z0-9_-]{11}$/.test(raw) && explicitType !== 'vimeo') {
    return { type: 'youtube', ref: raw };
  }
  if (/^\d{6,12}$/.test(raw) && explicitType === 'vimeo') {
    return { type: 'vimeo', ref: raw };
  }

  let url: URL;
  try {
    url = new URL(raw, 'https://placeholder.invalid');
  } catch {
    return null;
  }
  const host = url.hostname.replace(/^www\./, '');

  if (host === 'youtu.be') {
    const id = url.pathname.slice(1).split('/')[0];
    return /^[A-Za-z0-9_-]{11}$/.test(id) ? { type: 'youtube', ref: id } : null;
  }
  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v');
    if (v && /^[A-Za-z0-9_-]{11}$/.test(v)) return { type: 'youtube', ref: v };
    const m = url.pathname.match(/\/(embed|shorts|live|v)\/([A-Za-z0-9_-]{11})/);
    if (m) return { type: 'youtube', ref: m[2] };
    return null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const m = url.pathname.match(/(\d{6,12})/);
    return m ? { type: 'vimeo', ref: m[1] } : null;
  }

  const path = url.pathname.toLowerCase();
  if (path.endsWith('.m3u8')) return { type: 'hls', ref: raw };
  if (/\.(mp4|webm|mov|m4v|ogv)$/.test(path)) return { type: 'mp4', ref: raw };
  if (raw.startsWith('/media/')) return { type: 'mp4', ref: raw };
  return null;
}

/**
 * Matches a request hostname against a comma separated allowlist.
 * Supports exact hostnames and a single leading wildcard label (*.example.com).
 */
export function hostnameAllowed(hostname: string, allowlist: string): boolean {
  const patterns = allowlist
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter(Boolean);
  if (patterns.length === 0) return true;
  const host = hostname.toLowerCase();
  return patterns.some((pattern) => {
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1);
      return host.endsWith(suffix) || host === pattern.slice(2);
    }
    return host === pattern;
  });
}

export function retentionBucket(position: number, duration: number, buckets = 100): number {
  if (!(duration > 0) || !(position >= 0)) return 0;
  const idx = Math.floor((position / duration) * buckets);
  return Math.min(buckets - 1, Math.max(0, idx));
}

/** Shipped skins. The first is the default every new video and every surface uses. */
export const PLAYER_SKINS = ['videokr', 'frame', 'pop', 'studio', 'wave', 'neon', 'cinema', 'ghost', 'aurora', 'slate'] as const;

/** Retired skin names still stored on old videos, mapped onto the shipped set. */
const LEGACY_SKINS: Record<string, string> = {
  'forge-dark': 'videokr',
  'forge-light': 'studio',
  minimal: 'studio',
  bold: 'pop',
  glass: 'frame',
};

export function normalizeSkin(skin: unknown): string {
  const name = typeof skin === 'string' ? skin.trim() : '';
  if ((PLAYER_SKINS as readonly string[]).includes(name)) return name;
  return LEGACY_SKINS[name] ?? PLAYER_SKINS[0];
}

export function defaultPlayerConfig(): PlayerConfig {
  return {
    skin: PLAYER_SKINS[0],
    accent: '#ff6106',
    background: '#0b0908',
    controls: {
      playPause: true,
      progress: true,
      volume: true,
      time: true,
      speed: true,
      quality: true,
      captions: true,
      chapters: true,
      pip: true,
      fullscreen: true,
      keyboard: true,
      share: true,
    },
    autoplay: false,
    muted: false,
    loop: false,
    startAt: 0,
    resume: true,
    speeds: [0.5, 0.75, 1, 1.25, 1.5, 2],
    logoUrl: '',
    logoLink: '',
    logoPosition: 'top-right',
    title: true,
    /* The default skin puts the transport button in the bar, the way the
       reference design does, so nothing sits over the picture. */
    bigPlayButton: false,
    sourceCaptions: false,
    sticky: false,
    borderRadius: 14,
    related: false,
  };
}

/* The accent every video carried before the orange identity. A config still holding
   it was never actually customised, so it follows the brand rather than staying blue. */
const LEGACY_ACCENT = '#4f7cff';

export function mergePlayerConfig(stored: string | null | undefined): PlayerConfig {
  const base = defaultPlayerConfig();
  if (!stored) return base;
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return base;
  }
  if (!parsed || typeof parsed !== 'object') return base;
  const incoming = parsed as Partial<PlayerConfig>;
  return {
    ...base,
    ...incoming,
    accent: incoming.accent === LEGACY_ACCENT || !incoming.accent ? base.accent : incoming.accent,
    skin: normalizeSkin(incoming.skin),
    controls: { ...base.controls, ...(incoming.controls ?? {}) },
    speeds: Array.isArray(incoming.speeds) && incoming.speeds.length ? incoming.speeds : base.speeds,
  };
}

export function deviceFromUserAgent(ua: string): string {
  const s = ua.toLowerCase();
  if (/ipad|tablet/.test(s)) return 'tablet';
  if (/mobi|iphone|android/.test(s)) return 'mobile';
  if (!s) return 'unknown';
  return 'desktop';
}

export function safeExternalUrl(input: string): string {
  const raw = input.trim();
  if (!raw) return '';
  if (/^https?:\/\//i.test(raw) || raw.startsWith('/')) return raw;
  return '';
}

/**
 * The address a request should be sent to when it arrives on an alias of the
 * canonical host, or an empty string when it is already canonical. Only the
 * workers.dev name and the `www` subdomain are treated as aliases, so a local
 * or preview host is never redirected away.
 */
export function canonicalRedirect(requestUrl: string, publicBaseUrl: string): string {
  const url = new URL(requestUrl);
  let canonical: URL;
  try {
    canonical = new URL(publicBaseUrl);
  } catch {
    return '';
  }
  if (url.hostname === canonical.hostname) return '';
  const alias = url.hostname.endsWith('.workers.dev') || url.hostname === `www.${canonical.hostname}`;
  if (!alias) return '';
  url.protocol = canonical.protocol;
  url.hostname = canonical.hostname;
  url.port = '';
  return url.toString();
}
