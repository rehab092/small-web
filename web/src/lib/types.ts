/** Shared DTO types. These mirror docs/api.md; keep them in sync with the API. */

export type Via = 'typed' | 'link' | 'back' | 'forward' | 'history' | 'search';

export interface PersonDto {
  id: string;
  name: string;
  roles: ('browser' | 'author')[];
}

export interface AuthorRef {
  id: string;
  name: string;
}

export interface SiteDto {
  address: string;
  title: string;
  /** Sanitized server-side. Still rendered only inside the sandboxed iframe. */
  html: string;
  author: AuthorRef;
  revision: number;
  createdAt: string;
  updatedAt: string;
}

export interface SiteSummaryDto {
  address: string;
  title: string;
  author: AuthorRef;
  createdAt: string;
}

export interface VisitDto {
  id: string;
  address: string;
  title: string | null;
  at: string;
  via: Via;
  found: boolean;
}

export interface SnippetSegment {
  text: string;
  match: boolean;
}

export interface SearchResultDto {
  address: string;
  title: string;
  author: AuthorRef;
  score: number;
  snippet: SnippetSegment[];
}

export interface SearchResponseDto {
  query: string;
  total: number;
  results: SearchResultDto[];
}
