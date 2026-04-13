# Deploying Agentix (production checklist)

This guide targets **Vercel + Vercel Postgres (Neon)** or any host that runs Node and can reach Postgres. Use it when you move from local dev to a shared or public URL.

## 1. Secrets and env vars

**Never commit** `.env`, `.env.local`, or real connection strings. The repo includes [`.env.example`](./.env.example) as a template only.

Set these in your host’s **Environment Variables** UI (e.g. Vercel → Project → Settings → Environment Variables). Use **Production** (and Preview if you want preview deploys to work).

| Variable | Required | Notes |
| -------- | -------- | ----- |
| `POSTGRES_PRISMA_URL` | Yes | Pooled Postgres URL (Prisma + app runtime). |
| `AUTH_SECRET` | Yes | Random string; generate e.g. `openssl rand -base64 32`. Same value must be stable across deploys. |
| `AUTH_URL` | Yes in prod | Full public origin, **no trailing slash**, e.g. `https://your-app.vercel.app`. Wrong value breaks OAuth callbacks and session cookies. |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | If using Google sign-in | See [Google OAuth](#google-oauth) below. |
| `GEMINI_API_KEY` | For AI features | Server-only; never expose to the client. |
| `CRON_WEBHOOK_SECRET` | If using webhooks | Long random string; GitHub Actions send it as `x-agentix-secret` or `Authorization: Bearer …`. |
| `RAPIDAPI_KEY` | For JSearch catalog ingest | RapidAPI key for [JSearch](https://rapidapi.com/letscrape-6bRBa3QguO5/api/jsearch); used by `POST /api/webhooks/ingest-jobs`. |
| `DEFAULT_INGEST_QUERY` | Optional | Fallback `query` string when the ingest body does not include one. |
| `EMAIL_SERVER` / `EMAIL_FROM` | Optional | Magic-link email via Nodemailer. |

Local-only copies belong in **`.env.local`** (gitignored). For Prisma CLI, `npm run db:*` loads `.env.local` via `dotenv-cli`; raw `npx prisma` only auto-loads `.env`.

## 2. Database

1. Create a Postgres database (Vercel Storage → Postgres, or Neon, etc.).
2. Copy the **Prisma** / pooled connection string into `POSTGRES_PRISMA_URL`.
3. Apply schema to production:
   - **Quick path:** `dotenv -e .env.production.local -- npx prisma db push` from a trusted machine with prod env, **or** run the same against prod URL in CI with secrets.
   - **Stricter path:** use `prisma migrate` for versioned migrations once you’re ready.

The app expects tables that match [`prisma/schema.prisma`](./prisma/schema.prisma) (including Auth.js adapter tables). After pulling new versions, run `npm run db:push` so new columns (search, job enrichment, ingest metadata) exist.

**AI disclaimers:** salary bands, “Glassdoor-like” copy, and forum sentiment on the job detail page are **model-generated summaries**, not live scraped ratings. Treat them as hints; verify on official sites before decisions.

## 3. Google OAuth

In [Google Cloud Console](https://console.cloud.google.com/) → APIs & Services → Credentials → your OAuth client:

- **Authorized JavaScript origins:** `https://your-domain.com` (and `http://localhost:3000` for local dev).
- **Authorized redirect URIs:** `https://your-domain.com/api/auth/callback/google` (and `http://localhost:3000/api/auth/callback/google` for local).

`AUTH_URL` in production must match the origin you use in the browser (scheme + host, no path).

## 4. Cron webhook (optional)

`POST /api/webhooks/cron-scraper` expects JSON:

```json
{
  "userId": "<cuid from your User table>",
  "jobs": [
    { "company": "…", "role": "…", "link": "https://…", "ctc": null }
  ]
}
```

Headers: `x-agentix-secret: <CRON_WEBHOOK_SECRET>` **or** `Authorization: Bearer <CRON_WEBHOOK_SECRET>`.

If `CRON_WEBHOOK_SECRET` is unset, the route returns **503** (disabled). There is a **maximum batch size** per request (see `MAX_JOBS_PER_REQUEST` in the route) to limit abuse.

### Catalog ingest (JSearch)

`POST /api/webhooks/ingest-jobs` uses the **same** secret headers as the cron route. Optional JSON body:

```json
{ "query": "software engineer remote", "page": 1 }
```

Requires **`RAPIDAPI_KEY`** (RapidAPI JSearch). Jobs are deduped by URL and appear under **Search** and can be saved to **My jobs**. If the body omits `query`, `DEFAULT_INGEST_QUERY` is used when set.

The repo includes [`.github/workflows/ingest-jobs.yml`](./.github/workflows/ingest-jobs.yml) (optional): set repository secrets `CRON_WEBHOOK_SECRET`, `INGEST_URL` (e.g. `https://your-app.vercel.app/api/webhooks/ingest-jobs`), and optionally `INGEST_JSON` for the POST body.

## 5. Security behavior (what the app does)

- **Middleware** protects `/board`, `/search`, `/jobs`, `/profile`, `/trackers`, and authenticated `/api/jobs`, `/api/search`, `/api/trackers`, `/api/user/*` — unauthenticated users get **401** on those APIs or redirect to `/login` for pages.
- **HTTP security headers** are set in [`next.config.mjs`](./next.config.mjs) (frame options, MIME sniffing, referrer policy, etc.).
- **Gemini** runs only in server actions; the API key is not sent to the browser.

For extra hardening on a public URL, consider Vercel’s firewall / IP rules and monitoring; the app does not ship distributed rate limiting (that usually needs Redis or an edge KV).

## 6. Smoke tests before you trust a deploy

After `npm install`:

```bash
npx playwright install chromium
npm run test:e2e
```

Playwright starts its **own** dev server on **port 3333** by default (so it does not fight with `npm run dev` on port 3000). It injects a test `AUTH_SECRET` if yours is missing (for CI / fresh clones). Tests run **one at a time** (`workers: 1`) because `next dev` compiles on demand and parallel page loads often caused `net::ERR_ABORTED` / timeouts.

- **Do not** run `npm run build` and `npm run test:e2e` at the same time in the same folder — both touch `.next` and can race.
- In **CI**, set `CI=true` and install browsers once: `npx playwright install --with-deps` (Linux).

Optional: `E2E_PORT=3344` changes the Playwright dev port.

Tests cover: login page, `/board` → login redirect, protected job APIs **401** without a session, cron webhook **403**/**503** without a valid secret.

## 7. GitHub Actions (optional)

The repo includes [`.github/workflows/ci.yml`](./.github/workflows/ci.yml): on push/PR it runs `npm ci`, `npm run lint`, and `npm run build` with placeholder `POSTGRES_PRISMA_URL` and `AUTH_SECRET` so the build does not need your real database URL.

## 8. Known audit noise (dev tooling)

`npm audit` may report issues inside **eslint-config-next** / **glob** (dev dependency). Fixing them often requires a **major** Next/eslint bump; treat as tooling risk, not runtime exposure. Re-run `npm audit` after upgrades.
