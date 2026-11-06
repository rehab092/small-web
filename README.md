# The Small Web

Next.js browser (`web/`) + NestJS API (`api/`) + MongoDB.

## Install

```bash
npm install
```

## Environment

```bash
cp api/.env.example api/.env        # MONGO_URI, PORT, CORS_ORIGIN
cp web/.env.example web/.env.local  # NEXT_PUBLIC_API_URL
```

## Database

With your own MongoDB, set `MONGO_URI` in `api/.env`. Without one, start the local development database (port 27018, data in `api/.mongo-data`) and leave `MONGO_URI` unset:

```bash
npm run dev:db
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
npm run test:e2e -w web     # browser tests (Playwright, uses the installed Edge)
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
