import type { Env } from './types';

interface WebhookRow {
  id: string;
  url: string;
  secret: string;
  events: string;
}

async function sign(secret: string, body: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  return [...new Uint8Array(sig)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Fire-and-forget delivery of an event to a user's active webhooks. */
export async function dispatchWebhooks(
  env: Env,
  userId: string,
  event: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const { results } = await env.DB.prepare(
    'SELECT id, url, secret, events FROM webhooks WHERE user_id = ? AND active = 1',
  )
    .bind(userId)
    .all<WebhookRow>();
  const hooks = (results ?? []).filter((h) =>
    h.events
      .split(',')
      .map((e) => e.trim())
      .includes(event),
  );
  if (hooks.length === 0) return;
  const body = JSON.stringify({ event, sent_at: new Date().toISOString(), data: payload });
  const attempted = Math.floor(Date.now() / 1000);
  await Promise.all(
    hooks.map(async (hook) => {
      const headers: Record<string, string> = { 'content-type': 'application/json' };
      if (hook.secret) headers['x-streamforge-signature'] = await sign(hook.secret, body);
      let status = 0;
      let error = '';
      try {
        const response = await fetch(hook.url, { method: 'POST', headers, body });
        status = response.status;
        if (!response.ok) error = `endpoint returned ${response.status}`;
      } catch (err) {
        // Delivery failures never surface to the viewer; they are recorded on the
        // webhook instead so the dashboard can show a broken endpoint.
        error = err instanceof Error ? err.message : 'delivery failed';
      }
      await env.DB.prepare(
        'UPDATE webhooks SET last_status = ?, last_attempt_at = ?, last_error = ? WHERE id = ?',
      )
        .bind(status, attempted, error.slice(0, 200), hook.id)
        .run();
    }),
  );
}
