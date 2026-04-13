# Agentix

Personal career pipeline: **My jobs** list, **Search** over a shared catalog, résumé upload, optional JSearch ingest + webhooks, and Gemini-powered matching and job detail enrichment (server-side).

## Quick start

```bash
npm install
cp .env.example .env.local   # fill in values; never commit .env.local
npm run db:push
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Docs

- **[DEPLOY.md](./DEPLOY.md)** — production checklist (Vercel, env vars, OAuth, database, webhooks, smoke tests).
- **CI** — GitHub Actions runs lint + build on push/PR (see `.github/workflows/ci.yml`).

## Scripts

| Script        | Purpose                                      |
| ------------- | -------------------------------------------- |
| `npm run dev` | Local dev server                             |
| `npm run build` / `start` | Production build / server          |
| `npm run db:push` | Apply Prisma schema (uses `.env.local`) |
| `npm run test:e2e` | Playwright smoke tests (starts dev server) |

## Stack

Next.js 14 (App Router), Prisma + Postgres, Auth.js, Sonner, Google Gemini (server actions only).
