# API contract

Base URL: `http://localhost:4000` (env `PORT`). No route prefix. JSON in, JSON out. CORS allows `CORS_ORIGIN` (default `http://localhost:3000`).

All ids are **stable slugs** (never Mongo ObjectIds) so they survive a re-seed and can sit in URLs / localStorage. A visit `id` is the only opaque id.

## Errors

Every error is JSON: `{ "statusCode": number, "error": string, "message": string }`.

Validation failures (400) add `fields`, a map of field name → list of messages, so forms can show them inline. **All** invalid fields are reported in one response, not just the first:

```json
{ "statusCode": 400, "error": "Bad Request", "message": "Validation failed",
  "fields": { "address": ["address must be a name ending in .zz, e.g. tidepool.zz"] } }
```

| Status | Meaning |
|---|---|
| 400 | validation failed (`fields` present) |
| 403 | `PUT /sites/:address` by someone who is not the site's author |
| 404 | nowhere / unknown person |
| 409 | address already published |
| 413 | request body over 1 MB |

## Address normalization

Used by every route that takes an address. Rules, applied in order:

1. trim; collapse inner whitespace → invalid if any whitespace remains
2. lowercase
3. strip a leading `http://`, `https://` or `web://`
4. drop everything from the first `?` or `#` to the end, then everything from the first `/` to the end: **only the host matters**, so `tidepool.zz/reading` is the site `tidepool.zz`. This happens *before* validation, so it can never make an invalid host valid (`example.com/x.zz` stays invalid)
5. a bare label with no dot (`tidepool`) gets `.zz` appended
6. **valid** iff it matches `^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+zz$` and is ≤ 100 chars

Anything else (e.g. `example.com`, `a b`, empty) is **not a small-web address**: the web app treats it as an *external link* (shown, never followed) and must not request or record it.

Test vectors (the web app re-implements these in `web/src/lib/address.ts`; `api/test/address-parity.spec.ts` runs both implementations over thousands of generated inputs and fails if they ever disagree):

| input | normalized | valid |
|---|---|---|
| `tidepool.zz` | `tidepool.zz` | yes |
| `  TidePool.ZZ/ ` | `tidepool.zz` | yes |
| `http://tidepool.zz/` | `tidepool.zz` | yes |
| `https://Tidepool.zz//` | `tidepool.zz` | yes |
| `tidepool` | `tidepool.zz` | yes |
| `tidepool.zz#top` | `tidepool.zz` | yes |
| `a.b-c.zz` | `a.b-c.zz` | yes |
| `tidepool.zz/reading` | `tidepool.zz` | yes (path dropped) |
| `tidepool.zz/about` | `tidepool.zz` | yes (path dropped) |
| `https://Tidepool.zz/a/b?x#y` | `tidepool.zz` | yes |
| `tidepool/x` | `tidepool.zz` | yes |
| `-bad.zz` | — | no |
| `-bad.zz/ok` | — | no (host is checked, not the path) |
| `example.com` | — | no (external) |
| `example.com/x.zz` | — | no (external; a `.zz` path does not rescue it) |
| `tide pool.zz` | — | no |
| `a b/c` | — | no (whitespace) |
| `//x.zz` | — | no (no host) |
| `/x.zz` | — | no (no host) |
| `tidepool.zz:80/x` | — | no |
| `` | — | no |
| `javascript:alert(1)` | — | no |

## Types

```ts
type Via = 'typed' | 'link' | 'back' | 'forward' | 'history' | 'search';

interface PersonDto {
  id: string;            // slug, e.g. "ines-varga"
  name: string;
  roles: ('browser' | 'author')[];
}

interface SiteDto {
  address: string;       // normalized
  title: string;
  html: string;          // ALREADY SANITIZED server-side. Still render only inside the sandboxed iframe.
  author: { id: string; name: string };
  revision: number;      // 1 on publish, +1 per replace
  createdAt: string;     // ISO 8601
  updatedAt: string;
}

interface SiteSummaryDto {
  address: string; title: string; author: { id: string; name: string }; createdAt: string;
}

interface VisitDto {
  id: string;
  address: string;       // normalized
  title: string | null;  // current title of the site, null when found=false
  at: string;            // ISO 8601, set by the server
  via: Via;
  found: boolean;        // computed by the server, never trusted from the client
}
```

## Routes

### `GET /health`
Readiness check: pings the database. `200 { "ok": true, "db": "up" }`, or `503 { "statusCode": 503, "error": "Service Unavailable", "message": "database unavailable", "ok": false, "db": "down" }` when MongoDB does not answer within 2 s. Wait on this (not on the port) before starting anything that needs the API.

If the database goes away while the API is running, any route answers `503 { "message": "database unavailable" }`, never a 500.

### `GET /people`
Optional `?role=author|browser`. `200 PersonDto[]`, sorted by name.

### `GET /people/:id`
`200 PersonDto` · `404` unknown id.

### `GET /sites`
Directory for a start page. Query: `limit` (1-100, default 50), `offset` (default 0). `200 { total: number; items: SiteSummaryDto[] }`, sorted by address.

### `GET /sites/:address`
`:address` is URL-encoded and normalized server-side. `200 SiteDto`.
**`404` = nowhere**, including addresses that are syntactically invalid: `{ "statusCode": 404, "error": "Not Found", "message": "nowhere", "address": "<normalized or raw>" }`. The web app shows its Nowhere page and still records a visit.

### `POST /sites` — publish
Body:
```json
{ "address": "tidepool.zz", "title": "Tidepool", "html": "<h1>…</h1>", "authorId": "ines-varga" }
```
Limits: `title` 1-120 chars; `html` 1-100 000 chars; `authorId` must be a person with the `author` role. The address is normalized first, then validated.
`201 SiteDto` (html is the sanitized result — show this in the preview-after-publish).
`400` validation · `409` address taken (`message: "address already published"`).

### `POST /sites/preview` — dry run of publish
Body: `{ "html": string }`. Anything else sent (`address`, `title`, `authorId`) is ignored; no author is needed. **Never stores anything.**
`200` (not 201):
```ts
{
  html: string;          // exactly the html POST /sites would store
  text: string;          // the plain text that would be indexed for search
  empty: boolean;        // true <=> POST /sites with this html would answer 400 with fields.html
  message: string | null; // when empty: "nothing left to show after removing disallowed content" (the same wording publish returns in fields.html); otherwise null
}
```
It runs the very same function as publish and replace (`inspectPage`), so the preview cannot differ from the published page: render `html` in the sandboxed frame and it is what readers will see. **Do not re-implement the sanitizer or the "empty" rule on the client**; ask this endpoint (debounce the calls).

- Empty, whitespace-only, script-only or style-only html is a normal answer: `200 { empty: true }`, never an error.
- `html` over 100 000 characters → `400` with `fields.html`, exactly like publish. A missing or non-string `html` → `400` with `fields.html`. A body over 1 MB → `413`.

### `PUT /sites/:address` — replace
**Edit = replace in place.** Same body minus `address`: `{ title, html, authorId }`; `authorId` must match the site's author (no accounts, so this is a courtesy check, not security). Bumps `revision`, sets `updatedAt`, keeps `createdAt`. `200 SiteDto` · `404` · `400` · `403` (`authorId` is not the site's author).
Visits reference the *address*, not a revision, so history stays valid across edits.

### `GET /search?q=…`
Query: `q` (trimmed, max 200 chars), `limit` (1-50, default 20), `offset` (default 0).
Full-text over title (weight 10), address (5) and body text (1), ranked by relevance.
`200`:
```ts
{ query: string; total: number; results: Array<{
    address: string; title: string; author: { id: string; name: string };
    score: number;
    snippet: Array<{ text: string; match: boolean }>;  // concatenate `text` for the plain snippet; render match=true segments highlighted
}> }
```
Snippets are **structured segments, never HTML**, so React renders them with no `dangerouslySetInnerHTML`.
Empty or whitespace-only `q` → `200 { query: "", total: 0, results: [] }` (not an error). No hits → `total: 0, results: []`.

### `GET /people/:id/visits` — history, newest first
Query: `limit` (1-100, default 50), `cursor` (opaque, from the previous page). `200 { items: VisitDto[]; nextCursor: string | null }`. Keep requesting with `nextCursor` until it is `null` (infinite scroll). Grouping by day is done client-side in the browser's timezone. `404` unknown person.

### `POST /people/:id/visits` — record an arrival
Body: `{ "address": string, "via": Via, "requestId"?: string }`.
- Send the address as the user would see it; the server normalizes it. A non-address (`example.com`) → `400`.
- `found` and `at` are decided by the server.
- **`requestId`** (client-generated uuid, ≤ 64 chars) makes the call idempotent per person: a repeat with the same `requestId` returns the already-stored visit with `200` instead of creating a second one. Always send it — this is what keeps React strict-mode double effects and retried requests from writing double history.
`201 VisitDto` (first time) · `200 VisitDto` (replayed requestId) · `400` · `404` unknown person.

Record exactly one visit per page *arrival* (typed, link, search click, history jump, back, forward). Reload and scroll-restore are not arrivals.

## Seeded data (deterministic)

`npm run seed` (from the repo root). Fixed identities you can rely on while building:

- People ids: `ines-varga` (author), `tomas-reyes` (author), `wen-zhao` (author), `odile-mercier` (author), `kofi-mensah` (browser only). `tomas-reyes` has visited nearly every site.
- Sites include `tidepool.zz`, `ironbread.zz`, `nightfreight.zz`, `mothledger.zz`, `cartographers.zz`, `quietcircuits.zz`, `pepperandrain.zz`, `highline.zz`, `slowclock.zz`, `saltroad.zz`.
- Some pages link to addresses that never existed (404 → Nowhere).
- Search `tide` ranks `tidepool.zz` first.
