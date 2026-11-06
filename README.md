# The Small Web

Next.js browser (`web/`) + NestJS API (`api/`) + MongoDB. Node 20 or newer (`nvm use` reads `.nvmrc`).

## Install

```bash
npm install
```

## Database

Pick one. All three work with no `.env` file.

```bash
npm run dev:db          # local development database (port 27018, data in api/.mongo-data); keep it running
```

```bash
docker compose up -d    # MongoDB 7 in Docker, published on 27017 and 27018
```

Or use your own MongoDB: set `MONGO_URI` (see Environment).

## Environment (optional)

Everything has a default, so these files are only needed to change something.

```bash
cp api/.env.example api/.env        # MONGO_URI, PORT, CORS_ORIGIN
cp web/.env.example web/.env.local  # NEXT_PUBLIC_API_URL
```

## Seed

```bash
npm run seed        # idempotent: safe to run repeatedly
```

## Run

```bash
npm run dev         # api (http://localhost:4000) and web (http://localhost:3000) together
```

Or separately:

```bash
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:3000
```

## Test

```bash
npm test                    # api (jest) and web (vitest)
npm run test -w api
npm run test -w web
```

## End-to-end tests

Needs the development database running (own terminal):

```bash
npm run dev:db
```

One-time browser install (Playwright's chromium):

```bash
cd web && npx playwright install chromium
```

Run (self-contained: API on :4100, web on :3100, its own `small-web-e2e` database, re-seeded each run; never touches :3000, :4000 or the development data):

```bash
npm run test:e2e -w web
```

To use an installed browser instead of downloading chromium:

```bash
E2E_BROWSER_CHANNEL=msedge npm run test:e2e -w web
```

PowerShell:

```powershell
$env:E2E_BROWSER_CHANNEL='msedge'; npm run test:e2e -w web
```

## Build and run for production

```bash
npm run build
npm run start -w api        # http://localhost:4000
npm run start -w web        # http://localhost:3000
```

## Type check

```bash
npm run typecheck -w api
npm run typecheck -w web
```
