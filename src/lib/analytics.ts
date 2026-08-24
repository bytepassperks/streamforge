import type { Env } from './types';

/**
 * Signed-in surfaces and the embed frame are deliberately left out of
 * measurement: the dashboard carries customer data in its URLs, and an embed
 * runs inside someone else's page, where a second analytics library would both
 * slow their page down and count their visitors as ours. Playback on an embed is
 * already measured first-party through the events API.
 */
const UNMEASURED = [/^\/(app|admin|login|reset)(\.html)?$/, /^\/e\//, /^\/api\//];

export function isMeasurablePath(path: string): boolean {
  return !UNMEASURED.some((pattern) => pattern.test(path));
}

/** A GA4 stream id, or nothing when analytics is not configured for this deploy. */
function measurementId(env: Env): string | undefined {
  const id = (env.GA_MEASUREMENT_ID || '').trim();
  return /^G-[A-Z0-9]+$/i.test(id) ? id : undefined;
}

/**
 * Google Tag, loaded async so it never blocks the render, with IP anonymisation
 * on and Google's ad personalisation signals off — the product sells hosting,
 * not audiences, and the privacy page says exactly this.
 */
export function gtagSnippet(env: Env): string {
  const id = measurementId(env);
  if (!id) return '';
  return (
    `<link rel="preconnect" href="https://www.googletagmanager.com" crossorigin>` +
    `<script async src="https://www.googletagmanager.com/gtag/js?id=${id}"></script>` +
    `<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}` +
    `gtag('js',new Date());gtag('config','${id}',{anonymize_ip:true,allow_google_signals:false,allow_ad_personalization_signals:false});</script>`
  );
}

/**
 * Ownership tokens for the engines that prove a site by meta tag rather than
 * DNS. Each is optional: an unset variable simply emits nothing, so a fork or a
 * preview deploy never claims someone else's property.
 */
const VERIFICATIONS: { env: keyof Env; name: string }[] = [
  { env: 'GOOGLE_SITE_VERIFICATION', name: 'google-site-verification' },
  { env: 'BING_SITE_VERIFICATION', name: 'msvalidate.01' },
  { env: 'YANDEX_SITE_VERIFICATION', name: 'yandex-verification' },
  { env: 'NAVER_SITE_VERIFICATION', name: 'naver-site-verification' },
  { env: 'SEZNAM_SITE_VERIFICATION', name: 'seznam-wmt' },
  { env: 'PINTEREST_SITE_VERIFICATION', name: 'p:domain_verify' },
];

/** Verification belongs on the home page, which is what every engine fetches. */
export function verificationTags(env: Env, path: string): string {
  if (path !== '/' && path !== '/index.html') return '';
  return VERIFICATIONS.map(({ env: key, name }) => {
    const value = (env[key] as string | undefined)?.trim();
    return value ? `<meta name="${name}" content="${value.replace(/"/g, '&quot;')}">` : '';
  }).join('');
}

/** Everything this deploy wants in the head of a public page. */
export function headTags(env: Env, path: string): string {
  if (!isMeasurablePath(path)) return '';
  return `${verificationTags(env, path)}${gtagSnippet(env)}`;
}

/**
 * Injected from one place so a page can never be missed: the tag is added to
 * every HTML response the Worker returns, whether it was rendered here or read
 * out of the static bundle.
 */
export function injectHead(html: string, tags: string): string {
  if (!tags || html.includes('googletagmanager.com/gtag/js')) return html;
  const close = html.indexOf('</head>');
  if (close === -1) return html;
  return `${html.slice(0, close)}${tags}${html.slice(close)}`;
}
