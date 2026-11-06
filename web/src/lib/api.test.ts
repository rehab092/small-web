import { describe, expect, it } from 'vitest';
import { ApiError, createApi } from './api';

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function fakeApi(handler: (url: string, init?: RequestInit) => Response | Promise<Response>) {
  const calls: Array<{ url: string; init?: RequestInit }> = [];
  const api = createApi(async (url, init) => {
    calls.push({ url, init });
    return handler(url, init);
  }, 'http://api.test');
  return { api, calls };
}

describe('api client', () => {
  it('treats a 404 for a site as nowhere (null), not an error', async () => {
    const { api, calls } = fakeApi(() => jsonResponse(404, { message: 'nowhere' }));
    await expect(api.site('ghostship.zz')).resolves.toBeNull();
    expect(calls[0]?.url).toBe('http://api.test/sites/ghostship.zz');
  });

  it('returns the site on 200', async () => {
    const site = { address: 'tidepool.zz', title: 'Tidepool', html: '<p>x</p>' };
    const { api } = fakeApi(() => jsonResponse(200, site));
    await expect(api.site('tidepool.zz')).resolves.toEqual(site);
  });

  it('turns validation failures into ApiError with per-field messages', async () => {
    const { api } = fakeApi(() =>
      jsonResponse(400, { message: 'Validation failed', fields: { address: ['bad address'] } }),
    );
    const err = await api
      .publish({ address: 'x', title: 't', html: 'h', authorId: 'a' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(400);
    expect((err as ApiError).fields).toEqual({ address: ['bad address'] });
  });

  it('surfaces a duplicate address as a 409 ApiError', async () => {
    const { api } = fakeApi(() => jsonResponse(409, { message: 'address already published' }));
    const err = await api
      .publish({ address: 'a.zz', title: 't', html: 'h', authorId: 'a' })
      .catch((e: unknown) => e);
    expect((err as ApiError).status).toBe(409);
    expect((err as ApiError).message).toBe('address already published');
  });

  it('reports an unreachable server as status 0 instead of leaking a TypeError', async () => {
    const api = createApi(async () => {
      throw new TypeError('Failed to fetch');
    }, 'http://api.test');
    const err = await api.people().catch((e: unknown) => e);
    expect(err).toBeInstanceOf(ApiError);
    expect((err as ApiError).status).toBe(0);
  });

  it('lets aborts through untouched so callers can ignore them', async () => {
    const api = createApi(async () => {
      throw Object.assign(new Error('aborted'), { name: 'AbortError' });
    }, 'http://api.test');
    const err = await api.people().catch((e: unknown) => e);
    expect((err as Error).name).toBe('AbortError');
  });

  it('encodes search queries and sends visits with a requestId', async () => {
    const { api, calls } = fakeApi((url) =>
      url.includes('/search')
        ? jsonResponse(200, { query: 'a b&c', total: 0, results: [] })
        : jsonResponse(201, { id: '1' }),
    );
    await api.search('a b&c');
    expect(calls[0]?.url).toBe('http://api.test/search?q=a%20b%26c&limit=20&offset=0');
    await api.recordVisit('ines-varga', 'tidepool.zz', 'link', 'req-1');
    expect(calls[1]?.url).toBe('http://api.test/people/ines-varga/visits');
    expect(JSON.parse(String(calls[1]?.init?.body))).toEqual({
      address: 'tidepool.zz',
      via: 'link',
      requestId: 'req-1',
    });
  });

  it('passes the cursor when paging history', async () => {
    const { api, calls } = fakeApi(() => jsonResponse(200, { items: [], nextCursor: null }));
    await api.visits('ines-varga', 'abc', undefined, 25);
    expect(calls[0]?.url).toBe('http://api.test/people/ines-varga/visits?limit=25&cursor=abc');
  });
});
