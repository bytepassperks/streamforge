import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Env } from '../src/lib/types';
import { indexNowKey, submitChanged, submitUrls } from '../src/lib/indexnow';

const KEY = 'a1b2c3d4e5f60718293a4b5c6d7e8f90';

/** A D1 stand-in holding the announcement log in memory. */
function db(rows: { url: string; lastmod: string }[] = []) {
  const log = new Map(rows.map((row) => [row.url, row.lastmod]));
  const writes: { url: string; lastmod: string }[] = [];
  return {
    log,
    writes,
    binding: {
      prepare(sql: string) {
        return {
          all: async () => ({ results: [...log].map(([url, lastmod]) => ({ url, lastmod })) }),
          bind(...args: unknown[]) {
            expect(sql).toContain('INSERT INTO index_submissions');
            return { statement: { url: String(args[0]), lastmod: String(args[1]) } };
          },
        };
      },
      async batch(statements: { statement: { url: string; lastmod: string } }[]) {
        for (const item of statements) {
          log.set(item.statement.url, item.statement.lastmod);
          writes.push(item.statement);
        }
      },
    },
  };
}

function env(store: ReturnType<typeof db>, extra: Partial<Env> = {}): Env {
  return {
    PUBLIC_BASE_URL: 'https://videokr.com',
    INDEXNOW_KEY: KEY,
    DB: store.binding,
    ...extra,
  } as unknown as Env;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(status = 200) {
  const calls: { url: string; body: Record<string, unknown> }[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push({ url, body: JSON.parse(String(init?.body)) });
      return new Response('', { status });
    }),
  );
  return calls;
}

describe('indexNowKey', () => {
  it('accepts a long opaque key and refuses anything else', () => {
    expect(indexNowKey({ INDEXNOW_KEY: KEY } as Env)).toBe(KEY);
    expect(indexNowKey({ INDEXNOW_KEY: 'short' } as Env)).toBeUndefined();
    expect(indexNowKey({} as Env)).toBeUndefined();
  });
});

describe('submitUrls', () => {
  it('tells every engine the same host, key and key location', async () => {
    const calls = stubFetch();
    const report = await submitUrls(env(db()), ['https://videokr.com/v/a']);
    expect(report.results.every((result) => result.ok)).toBe(true);
    expect(calls.map((call) => new URL(call.url).host)).toEqual([
      'api.indexnow.org',
      'www.bing.com',
      'yandex.com',
      'search.seznam.cz',
      'searchadvisor.naver.com',
    ]);
    expect(calls[0].body).toMatchObject({
      host: 'videokr.com',
      key: KEY,
      keyLocation: `https://videokr.com/${KEY}.txt`,
      urlList: ['https://videokr.com/v/a'],
    });
  });

  it('does nothing at all without a key', async () => {
    const calls = stubFetch();
    const report = await submitUrls(env(db(), { INDEXNOW_KEY: '' }), ['https://videokr.com/']);
    expect(report.reason).toContain('INDEXNOW_KEY');
    expect(calls).toHaveLength(0);
  });
});

describe('submitChanged', () => {
  const target = { loc: 'https://videokr.com/v/a', lastmod: '2026-08-18T00:00:00.000Z' };

  it('announces a url once and skips it until it moves', async () => {
    const store = db();
    const calls = stubFetch();
    const first = await submitChanged(env(store), [target]);
    expect(first.submitted).toEqual([target.loc]);
    expect(store.writes).toHaveLength(1);

    const second = await submitChanged(env(store), [target]);
    expect(second.submitted).toEqual([]);
    expect(second.unchanged).toBe(1);
    expect(calls).toHaveLength(5);

    const third = await submitChanged(env(store), [{ ...target, lastmod: '2026-08-19T00:00:00.000Z' }]);
    expect(third.submitted).toEqual([target.loc]);
    expect(calls).toHaveLength(10);
  });

  it('remembers nothing when every engine refused, so the next run retries', async () => {
    const store = db();
    stubFetch(429);
    const report = await submitChanged(env(store), [target]);
    expect(report.submitted).toEqual([target.loc]);
    expect(store.writes).toHaveLength(0);
    expect(store.log.size).toBe(0);
  });
});
