import { describe, expect, it } from 'vitest';
import type { Env, User } from '../src/lib/types';
import { api } from '../src/routes/api';
import { pub } from '../src/routes/public';
import { redeemCode, settleGrant } from '../src/lib/promos';

const actor: User = {
  id: 'usr_admin',
  email: 'admin@example.com',
  name: 'Admin',
  plan: 'free',
  role: 'admin',
  unlimited: 0,
  suspended: 0,
  lead_emails: 1,
  subscription_id: '',
  plan_renews_at: 0,
  grant_plan: '',
  grant_until: 0,
  grant_code: '',
  created_at: 1_700_000_000,
};

type CodeRow = {
  id: string;
  code: string;
  plan: string;
  grant_days: number;
  redeem_by: number;
  max_redemptions: number;
  redemptions: number;
  active: number;
  note?: string;
  created_at?: number;
};

type Redemption = {
  id: string;
  code_id: string;
  code: string;
  user_id: string;
  plan: string;
  granted_until: number;
  created_at: number;
};

function envFor(options: { codes?: CodeRow[]; user?: Partial<User>; ownerGrant?: Partial<User> } = {}) {
  const codes = options.codes ?? [];
  const redemptions: Redemption[] = [];
  const user = {
    id: 'usr_1',
    email: 'owner@example.com',
    name: 'Owner',
    plan: 'free',
    role: 'user',
    unlimited: 0,
    suspended: 0,
    lead_emails: 1,
    subscription_id: '',
    plan_renews_at: 0,
    grant_plan: '',
    grant_until: 0,
    grant_code: '',
    created_at: 1_700_000_000,
    ...options.user,
  } as User;
  const owner = { ...user, ...options.ownerGrant };
  const audits: Record<string, unknown>[] = [];
  const prepare = (sql: string) => {
    let values: unknown[] = [];
    const statement = {
      bind(...args: unknown[]) {
        values = args;
        return statement;
      },
      async first<T>() {
        if (sql.includes('FROM sessions')) return { ...actor, expires_at: 1_900_000_000 } as T;
        if (sql.includes('FROM promo_codes WHERE code')) {
          return (codes.find((row) => row.code === values[0]) ?? null) as T;
        }
        if (sql.includes('FROM promo_codes WHERE id')) {
          return (codes.find((row) => row.id === values[0]) ?? null) as T;
        }
        if (sql.includes('FROM promo_redemptions WHERE code_id')) {
          return (redemptions.find((row) => row.code_id === values[0] && row.user_id === values[1]) ?? null) as T;
        }
        if (sql.includes('FROM promo_redemptions WHERE id')) {
          return (redemptions.find((row) => row.id === values[0]) ?? null) as T;
        }
        if (sql.includes('FROM promo_redemptions') && sql.includes('granted_until != 0')) {
          return (redemptions.filter((row) => row.user_id === values[0]).sort((a, b) => b.created_at - a.created_at)[0] ?? null) as T;
        }
        if (sql.includes('FROM users')) return owner as T;
        if (sql.includes('FROM videos WHERE user_id')) return { n: 0 } as T;
        if (sql.includes('FROM videos')) {
          return {
            id: 'vid_1',
            user_id: owner.id,
            slug: 'demo',
            title: 'Demo',
            description: '',
            source_type: 'youtube',
            source_ref: 'c65tLZVgkcY',
            fallback_ref: '',
            duration: 10,
            thumbnail_url: '',
            thumbnail_url_b: '',
            captions_url: '',
            transcript: '',
            player_config: '{}',
            visibility: 'public',
            password_hash: '',
            password_salt: '',
            allowed_domains: '',
            created_at: 1,
            updated_at: 1,
          } as T;
        }
        return null;
      },
      async all<T>() {
        if (sql.includes('FROM promo_codes')) return { results: codes as T[] };
        if (sql.includes('FROM promo_redemptions')) {
          return {
            results: redemptions.map((row) => ({ ...row, email: user.email })) as T[],
          };
        }
        if (sql.includes('FROM purchases')) return { results: [] as T[] };
        if (sql.includes('FROM chapters') || sql.includes('FROM ctas') || sql.includes('FROM videos')) return { results: [] as T[] };
        return { results: [] as T[] };
      },
      async run() {
        if (sql.startsWith('UPDATE promo_codes SET redemptions = redemptions + 1')) {
          const row = codes.find((candidate) => candidate.id === values[0]);
          if (!row || Number(row.active) !== 1 || (row.max_redemptions > 0 && row.redemptions >= row.max_redemptions)) {
            return { meta: { changes: 0 } };
          }
          row.redemptions += 1;
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('UPDATE promo_codes SET redemptions = redemptions - 1')) {
          const row = codes.find((candidate) => candidate.id === values[0]);
          if (row) row.redemptions -= 1;
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('INSERT INTO promo_redemptions')) {
          const redemption = {
            id: values[0] as string,
            code_id: values[1] as string,
            code: values[2] as string,
            user_id: values[3] as string,
            plan: values[4] as string,
            granted_until: values[5] as number,
            created_at: values[6] as number,
          };
          if (redemptions.some((row) => row.code_id === redemption.code_id && row.user_id === redemption.user_id)) {
            throw new Error('UNIQUE constraint failed');
          }
          redemptions.push(redemption);
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('UPDATE users SET grant_plan = ?, grant_until = ?, grant_code = ?')) {
          user.grant_plan = values[0] as string;
          user.grant_until = values[1] as number;
          user.grant_code = values[2] as string;
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith("UPDATE users SET grant_plan = '', grant_until = 0")) {
          if (user.id === values[0] && user.grant_code === values[1]) {
            user.grant_plan = '';
            user.grant_until = 0;
            user.grant_code = '';
          }
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('INSERT INTO promo_codes')) {
          if (codes.some((row) => row.code === values[1])) throw new Error('UNIQUE constraint failed');
          codes.push({
            id: values[0] as string,
            code: values[1] as string,
            plan: values[2] as string,
            grant_days: values[3] as number,
            redeem_by: values[4] as number,
            max_redemptions: values[5] as number,
            redemptions: 0,
            active: 1,
            note: values[6] as string,
            created_at: values[7] as number,
          });
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('UPDATE promo_codes SET')) {
          const row = codes.find((candidate) => candidate.id === values[values.length - 1]);
          if (row) {
            const sets = sql.slice('UPDATE promo_codes SET '.length, sql.indexOf(' WHERE')).split(', ');
            sets.forEach((set, index) => {
              const key = set.split(' = ')[0] as keyof CodeRow;
              row[key] = values[index] as never;
            });
          }
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('DELETE FROM promo_codes')) {
          const index = codes.findIndex((row) => row.id === values[0]);
          if (index >= 0) codes.splice(index, 1);
          return { meta: { changes: 1 } };
        }
        if (sql.startsWith('INSERT INTO admin_audit')) {
          audits.push({ action: values[3], target: values[4], detail: values[5] });
        }
        return { meta: { changes: 1 } };
      },
    };
    return statement;
  };
  const env = {
    PUBLIC_BASE_URL: 'https://videokr.com',
    DB: { prepare },
    MEDIA: {},
  } as unknown as Env;
  return { env, user, owner, codes, redemptions, audits };
}

function request(env: Env, path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers);
  headers.set('cookie', 'sf_session=test-session');
  return Promise.resolve(api.request(path, { ...init, headers }, env));
}

describe('promo grants', () => {
  it('redeems a live code, records the audit row and increments its counter', async () => {
    const { env, user, codes, redemptions } = envFor({
      codes: [{ id: 'pco_1', code: 'LAUNCH15', plan: 'starter', grant_days: 15, redeem_by: 0, max_redemptions: 2, redemptions: 0, active: 1 }],
    });
    const result = await redeemCode(env, user, ' launch 15 ');
    expect(result).toMatchObject({ ok: true, plan: 'starter', code: 'LAUNCH15' });
    expect(codes[0].redemptions).toBe(1);
    expect(redemptions).toHaveLength(1);
    expect(user.grant_plan).toBe('starter');
  });

  it.each([
    ['missing', 404, 'that code is not valid'],
    ['inactive', 409, 'that code is no longer active'],
    ['expired', 409, 'that code has expired'],
    ['claimed', 409, 'that code has been fully claimed'],
    ['owned', 409, 'your plan already includes this'],
  ])('returns the exact rejection for %s', async (kind, status, error) => {
    const nowSeconds = Math.floor(Date.now() / 1000);
    const { env, user } = envFor({
      user: kind === 'owned' ? { plan: 'agency' } : undefined,
      codes: kind === 'missing'
        ? []
        : [{
            id: 'pco_1',
            code: 'LAUNCH15',
            plan: 'starter',
            grant_days: 15,
            redeem_by: kind === 'expired' ? nowSeconds - 1 : 0,
            max_redemptions: kind === 'claimed' ? 1 : 0,
            redemptions: kind === 'claimed' ? 1 : 0,
            active: kind === 'inactive' ? 0 : 1,
          }],
    });
    const result = await redeemCode(env, user, 'LAUNCH15');
    expect(result).toEqual({ ok: false, status, error });
  });

  it('rejects a repeat redemption and leaves the cap unchanged', async () => {
    const { env, user, codes, redemptions } = envFor({
      codes: [{ id: 'pco_1', code: 'LAUNCH15', plan: 'starter', grant_days: 15, redeem_by: 0, max_redemptions: 1, redemptions: 0, active: 1 }],
    });
    await redeemCode(env, user, 'LAUNCH15');
    const result = await redeemCode(env, user, 'LAUNCH15');
    expect(result).toEqual({ ok: false, status: 409, error: 'you have already used that code' });
    expect(codes[0].redemptions).toBe(1);
    expect(redemptions).toHaveLength(1);
  });

  it('never increments a capped code beyond its limit', async () => {
    const { env, user, codes } = envFor({
      codes: [{ id: 'pco_1', code: 'LAUNCH15', plan: 'starter', grant_days: 15, redeem_by: 0, max_redemptions: 1, redemptions: 0, active: 1 }],
    });
    expect((await redeemCode(env, user, 'LAUNCH15')).ok).toBe(true);
    const other = { ...user, id: 'usr_2' };
    const result = await redeemCode(env, other, 'LAUNCH15');
    expect(result).toEqual({ ok: false, status: 409, error: 'that code has been fully claimed' });
    expect(codes[0].redemptions).toBe(1);
  });

  it('settles only a lapsed grant', async () => {
    const expired = envFor({ user: { grant_plan: 'starter', grant_until: 1 } });
    const settled = await settleGrant(expired.env, expired.user);
    expect(settled.grant_plan).toBe('');
    const live = envFor({ user: { grant_plan: 'starter', grant_until: 9_999_999_999 } });
    await settleGrant(live.env, live.user);
    expect(live.user.grant_plan).toBe('starter');
  });

  it('does not expose a grant date in customer responses', async () => {
    const setup = envFor({
      codes: [{ id: 'pco_1', code: 'LAUNCH15', plan: 'starter', grant_days: 15, redeem_by: 0, max_redemptions: 0, redemptions: 0, active: 1 }],
    });
    const redeem = await request(setup.env, '/promo/redeem', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'LAUNCH15' }),
    });
    expect(await redeem.json()).not.toHaveProperty('granted_until');
    const billing = await request(setup.env, '/billing');
    expect(await billing.json()).not.toHaveProperty('grant.granted_until');
    const me = await request(setup.env, '/auth/me');
    expect(await me.json()).not.toHaveProperty('user.grant_until');
  });

  it('preserves the existing auth/me user fields without exposing grant duration', async () => {
    const setup = envFor();
    const response = await request(setup.env, '/auth/me');
    const body = await response.json();
    expect(body).toMatchObject({
      user: {
        lead_emails: 1,
        unlimited: 0,
        subscription_id: '',
        created_at: 1_700_000_000,
        grant_plan: '',
        grant_code: '',
      },
    });
    expect(body).not.toHaveProperty('user.grant_until');
  });

  it('uses entitlement for embed badges, not purchase ownership', async () => {
    const setup = envFor({ ownerGrant: { grant_plan: 'starter', grant_until: 9_999_999_999 } });
    const response = await pub.request('/api/embed/demo', {}, setup.env);
    expect((await response.json<{ badge: boolean }>()).badge).toBe(false);
    setup.owner.grant_until = 1;
    const lapsed = await pub.request('/api/embed/demo', {}, setup.env);
    expect((await lapsed.json<{ badge: boolean }>()).badge).toBe(true);
  });

  it('keeps customer app free of grant expiry wording', async () => {
    const app = await (await import('node:fs/promises')).readFile(new URL('../public/app.js', import.meta.url), 'utf8');
    expect(app).not.toMatch(/grant.{0,80}(expire|countdown|days)/i);
  });
});

describe('admin promo routes', () => {
  it('validates creation, rejects duplicates, and audits creation', async () => {
    const setup = envFor();
    const bad = await request(setup.env, '/admin/promos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'X', plan: 'starter', grant_days: 15 }),
    });
    expect(bad.status).toBe(400);
    const created = await request(setup.env, '/admin/promos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'launch15', plan: 'starter', grant_days: 15 }),
    });
    expect(created.status).toBe(201);
    expect(setup.audits[0].action).toBe('promo.create');
    const duplicate = await request(setup.env, '/admin/promos', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ code: 'LAUNCH15', plan: 'starter', grant_days: 15 }),
    });
    expect(duplicate.status).toBe(409);
  });

  it('refuses immutable fields and revokes only a matching current grant', async () => {
    const setup = envFor({
      codes: [{ id: 'pco_1', code: 'LAUNCH15', plan: 'starter', grant_days: 15, redeem_by: 0, max_redemptions: 0, redemptions: 1, active: 1 }],
    });
    setup.redemptions.push({ id: 'red_1', code_id: 'pco_1', code: 'LAUNCH15', user_id: 'usr_1', plan: 'starter', granted_until: 9_999_999_999, created_at: 1_700_000_000 });
    setup.user.grant_code = 'OTHER';
    const patch = await request(setup.env, '/admin/promos/pco_1', {
      method: 'PATCH',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ plan: 'agency' }),
    });
    expect(patch.status).toBe(400);
    const revoke = await request(setup.env, '/admin/promos/redemptions/red_1/revoke', { method: 'POST' });
    expect(revoke.status).toBe(200);
    expect(setup.user.grant_code).toBe('OTHER');
  });
});
