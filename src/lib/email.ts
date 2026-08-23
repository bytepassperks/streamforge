/**
 * Transactional email through Resend.
 *
 * Sending is optional: with no `RESEND_API_KEY` the helpers return `false` and
 * the caller carries on, so local development and tests never try to post mail.
 * Every message is plain text plus a light html twin — no tracking pixels, no
 * remote images, so it renders the same in Gmail and in a text client.
 */
import type { Env } from './types';

const DEFAULT_FROM = 'Videokr <hello@videokr.com>';
const ENDPOINT = 'https://api.resend.com/emails';

export interface Mail {
  to: string;
  subject: string;
  /** Body as plain text; blank lines separate paragraphs in the html twin. */
  text: string;
  replyTo?: string;
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** Wraps the plain text in the Videokr email shell: one column, system fonts. */
export function htmlFromText(text: string): string {
  const paragraphs = text
    .trim()
    .split(/\n{2,}/)
    .map((block) => `<p style="margin:0 0 14px">${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('');
  return [
    '<div style="background:#f6f4ef;padding:28px 16px">',
    '<div style="max-width:520px;margin:0 auto;background:#fff;border:1px solid #e6e1d6;border-radius:14px;',
    'padding:26px 24px;font:15px/1.6 -apple-system,BlinkMacSystemFont,\'Segoe UI\',Roboto,Arial,sans-serif;color:#20201c">',
    '<div style="font-weight:700;letter-spacing:.02em;color:#20201c;margin:0 0 18px">Videokr</div>',
    paragraphs,
    '</div></div>',
  ].join('');
}

/** Returns whether the message was accepted by Resend. Never throws. */
export async function sendMail(env: Env, mail: Mail): Promise<boolean> {
  if (!env.RESEND_API_KEY) return false;
  try {
    const response = await fetch(ENDPOINT, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env.RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: env.EMAIL_FROM || DEFAULT_FROM,
        to: [mail.to],
        subject: mail.subject,
        text: mail.text,
        html: htmlFromText(mail.text),
        ...(mail.replyTo ? { reply_to: mail.replyTo } : {}),
      }),
    });
    return response.ok;
  } catch {
    return false;
  }
}
