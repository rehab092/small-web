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

With a real MongoDB, set `MONGO_URI` in `api/.env`. Without one, start the local development database first (it listens on 27018 and keeps its data in `api/.mongo-data`), and leave `MONGO_URI` unset:

```bash
npm run dev:db -w api
```

## Run

```bash
npm run dev:api     # http://localhost:4000
npm run dev:web     # http://localhost:3000
```

## Seed

```bash
npm run seed        # idempotent: safe to run repeatedly
```

## Test

```bash
npm test
```

## Build

```bash
npm run build
```
