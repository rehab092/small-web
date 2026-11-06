/**
 * Typed client for the Small Web API (see docs/api.md at the repo root).
 * `createApi` takes the fetch implementation and base URL so it can be tested
 * without a network; `api` is the instance the app uses.
 */

import type {
  PersonDto,
  SearchResponseDto,
  SiteDto,
  SiteSummaryDto,
  Via,
  VisitDto,
} from './types';

export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000').replace(/\/+$/, '');

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly fields?: Record<string, string[]>,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

export interface PublishInput {
  address: string;
  title: string;
  html: string;
  authorId: string;
}

export type ReplaceInput = Omit<PublishInput, 'address'>;

export interface VisitsPage {
  items: VisitDto[];
  nextCursor: string | null;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export function createApi(fetchImpl: FetchLike, baseUrl: string) {
  async function request(path: string, init?: RequestInit): Promise<Response> {
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${path}`, init);
    } catch (err) {
      if ((err as { name?: string }).name === 'AbortError') throw err;
      throw new ApiError('Cannot reach the Small Web server. Is the API running?', 0);
    }
    return res;
  }

  async function failure(res: Response): Promise<ApiError> {
    let message = res.statusText || `Request failed (${res.status})`;
    let fields: Record<string, string[]> | undefined;
    try {
      const body = (await res.json()) as { message?: unknown; fields?: Record<string, string[]> };
      if (typeof body.message === 'string') message = body.message;
      if (body.fields && typeof body.fields === 'object') fields = body.fields;
    } catch {
      /* non-JSON error body: keep the status text */
    }
    return new ApiError(message, res.status, fields);
  }

  async function json<T>(path: string, init?: RequestInit): Promise<T> {
    const res = await request(path, init);
    if (!res.ok) throw await failure(res);
    return (await res.json()) as T;
  }

  const jsonInit = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });

  return {
    people: (signal?: AbortSignal) => json<PersonDto[]>('/people', { signal }),

    /** The site at `address`, or null when there is nothing there (404 = nowhere). */
    async site(address: string, signal?: AbortSignal): Promise<SiteDto | null> {
      const res = await request(`/sites/${encodeURIComponent(address)}`, { signal });
      if (res.status === 404) return null;
      if (!res.ok) throw await failure(res);
      return (await res.json()) as SiteDto;
    },

    listSites: (limit = 50, offset = 0, signal?: AbortSignal) =>
      json<{ total: number; items: SiteSummaryDto[] }>(`/sites?limit=${limit}&offset=${offset}`, {
        signal,
      }),

    publish: (input: PublishInput) => json<SiteDto>('/sites', jsonInit('POST', input)),

    replace: (address: string, input: ReplaceInput) =>
      json<SiteDto>(`/sites/${encodeURIComponent(address)}`, jsonInit('PUT', input)),

    search: (q: string, signal?: AbortSignal, limit = 20, offset = 0) =>
      json<SearchResponseDto>(
        `/search?q=${encodeURIComponent(q)}&limit=${limit}&offset=${offset}`,
        { signal },
      ),

    visits: (personId: string, cursor: string | null, signal?: AbortSignal, limit = 50) => {
      const qs = new URLSearchParams({ limit: String(limit) });
      if (cursor) qs.set('cursor', cursor);
      return json<VisitsPage>(`/people/${encodeURIComponent(personId)}/visits?${qs}`, { signal });
    },

    /** Record one arrival. `requestId` makes retries and strict-mode replays idempotent. */
    recordVisit: (personId: string, address: string, via: Via, requestId: string) =>
      json<VisitDto>(
        `/people/${encodeURIComponent(personId)}/visits`,
        jsonInit('POST', { address, via, requestId }),
      ),
  };
}

export type Api = ReturnType<typeof createApi>;

export const api: Api = createApi((input, init) => fetch(input, init), API_URL);
