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
  'fullbleed',
  'split',
  'gradient',
] as const;

export function normalizeCtaStyle(value: unknown, kind: unknown): string {
  const styles = kind === 'gate' || kind === 'endscreen' ? GATE_STYLES : CTA_STYLES;
  return (styles as readonly string[]).includes(String(value ?? '')) ? String(value) : 'card';
}

export const CTA_BUTTON_STYLES = [
  'solid',
  'pill',
  'chunky',
  'raised',
  'framed',
  'arrow',
  'gradient',
  'glow',
  'ghost',
  'white',
] as const;

export function normalizeCtaButtonStyle(value: unknown): string {
  return (CTA_BUTTON_STYLES as readonly string[]).includes(String(value ?? ''))
    ? String(value)
    : 'solid';
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

export const PLAYER_FONTS = ['', 'Inter', 'Figtree', 'Bricolage Grotesque', 'JetBrains Mono'] as const;

export function normalizeFontFamily(value: unknown): string {
  return (PLAYER_FONTS as readonly string[]).includes(String(value ?? '')) ? String(value ?? '') : '';
}

// Keep this in sync with formFieldsWithName in public/app.js.
export function normalizeFormFields(value: unknown): string {
  const fields = String(value ?? '')
    .split(',')
    .map((field) => field.trim().toLowerCase())
    .filter(Boolean)
    .filter((field, index, list) => field !== 'email' && field !== 'name' && list.indexOf(field) === index);
  fields.unshift('email');
  return fields.join(',');
}

export function toggleFormNameField(value: unknown, includeName: boolean): string {
  const fields = normalizeFormFields(value).split(',').filter((field) => field !== 'name');
  if (includeName) fields.push('name');
  return fields.join(',');
}

export type RgbColor = [number, number, number];

export function parseHexColor(value: unknown): RgbColor | null {
  const match = /^#?([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(String(value ?? '').trim());
  if (!match) return null;
  const digits = match[1].length === 3
    ? match[1].split('').map((digit) => digit + digit).join('')
    : match[1];
  return [
    parseInt(digits.slice(0, 2), 16),
    parseInt(digits.slice(2, 4), 16),
    parseInt(digits.slice(4, 6), 16),
  ];
}

export function rgbToHex(rgb: RgbColor): string {
  return '#' + rgb.map((channel) => Math.max(0, Math.min(255, Math.round(channel))).toString(16).padStart(2, '0')).join('');
}

export function rgbToHsv(rgb: RgbColor): [number, number, number] {
  const values = rgb.map((channel) => channel / 255);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const delta = max - min;
  let hue = 0;
  if (delta) {
    if (max === values[0]) hue = ((values[1] - values[2]) / delta) % 6;
    else if (max === values[1]) hue = (values[2] - values[0]) / delta + 2;
    else hue = (values[0] - values[1]) / delta + 4;
    hue *= 60;
    if (hue < 0) hue += 360;
  }
  return [hue, max ? delta / max : 0, max];
}

export function hsvToRgb(hsv: [number, number, number]): RgbColor {
  const [hue, saturation, value] = hsv;
  const chroma = value * saturation;
  const part = chroma * (1 - Math.abs(((hue / 60) % 2) - 1));
  const match = value - chroma;
  let rgb: [number, number, number];
  if (hue < 60) rgb = [chroma, part, 0];
  else if (hue < 120) rgb = [part, chroma, 0];
  else if (hue < 180) rgb = [0, chroma, part];
  else if (hue < 240) rgb = [0, part, chroma];
  else if (hue < 300) rgb = [part, 0, chroma];
  else rgb = [chroma, 0, part];
  return rgb.map((channel) => Math.round((channel + match) * 255)) as RgbColor;
}

export function contrastRatio(first: RgbColor, second: RgbColor): number {
  const luminance = (rgb: RgbColor) => {
    const channels = rgb.map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.03928
        ? normalized / 12.92
        : Math.pow((normalized + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
  };
  const firstLuminance = luminance(first);
  const secondLuminance = luminance(second);
  return (Math.max(firstLuminance, secondLuminance) + 0.05) /
    (Math.min(firstLuminance, secondLuminance) + 0.05);
}

export function clampHighContrast(accent: RgbColor, background: RgbColor): RgbColor {
  if (contrastRatio(accent, background) >= 4.5) return accent;
  const [hue, saturation, value] = rgbToHsv(accent);
  const low = hsvToRgb([hue, saturation, 0]);
  const towardLow = contrastRatio(low, background) >= 4.5;
  let lower = 0;
  let upper = 1;
  if (towardLow) upper = value;
  else lower = value;
  for (let index = 0; index < 24; index += 1) {
    const midpoint = (lower + upper) / 2;
    const candidate = hsvToRgb([hue, saturation, midpoint]);
    const passes = contrastRatio(candidate, background) >= 4.5;
    if (towardLow) {
      if (passes) lower = midpoint;
      else upper = midpoint;
    } else if (passes) {
      upper = midpoint;
    } else {
      lower = midpoint;
    }
  }
  return hsvToRgb([hue, saturation, towardLow ? lower : upper]);
}

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
    fontFamily: '',
    showChapters: true,
    showCtas: true,
    showForms: true,
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
    fontFamily: normalizeFontFamily(incoming.fontFamily),
    showChapters: incoming.showChapters !== false,
    showCtas: incoming.showCtas !== false,
    showForms: incoming.showForms !== false,
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
