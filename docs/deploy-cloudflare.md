# Deploying to Cloudflare Workers

Runbook for the founder's deploy day. Everything below is already wired in the
repo (`apps/{sites,ops}/wrangler.jsonc`, `open-next.config.ts`, `build:cf`
scripts); this doc is the order of operations plus the account-side setup that
cannot live in code.

## Prerequisites

- Cloudflare account with the `tradies.co.uk` zone active on it.
- **Workers Paid** plan (the Next.js server bundles exceed the free-plan size
  limits, and R2 incremental cache needs paid-tier limits headroom).
- **R2** enabled on the account (billing acknowledged).
- Supabase project (Postgres) — both connection strings to hand:
  - **Session** string, port `5432` — migrations only.
  - **Pooled** (transaction pooler) string, port `6543` — the runtime
    `DATABASE_URL` for every app (`createDb` already sets `prepare: false`).
- Trigger.dev Cloud project (jobs) with `TRIGGER_PROJECT_ID` /
  `TRIGGER_SECRET_KEY`.
- Local: `pnpm install`, `wrangler login` (wrangler is a pinned devDependency
  of both apps — run it via `pnpm --filter @tradies/sites exec wrangler ...`).

## DNS + TLS (tradies.co.uk zone)

| Record                | Type  | Target / note                                                                                                                                 |
| --------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `*.app.tradies.co.uk` | CNAME | proxied placeholder (e.g. `tradies-sites.<account>.workers.dev`) — the wildcard route in `apps/sites/wrangler.jsonc` does the actual dispatch |
| `outreach`            | —     | Workers custom domain (created automatically when you enable the commented route/custom domain in `apps/ops/wrangler.jsonc`)                  |
| `pools`               | —     | R2 custom domain for the public imagery bucket (below)                                                                                        |

- **Wildcard TLS**: the universal cert only covers `*.tradies.co.uk`, not the
  second-level wildcard `*.app.tradies.co.uk`. Order an **Advanced Certificate
  Manager** cert (or enable **Total TLS**) including `*.app.tradies.co.uk`
  before flipping DNS, or every tenant preview serves a cert error.
- After DNS: uncomment the `routes` blocks in both `wrangler.jsonc` files and
  redeploy.

## R2 buckets

```sh
cd apps/sites
pnpm exec wrangler r2 bucket create tradies-sites-inc-cache
pnpm exec wrangler r2 bucket create tradies-ops-inc-cache
pnpm exec wrangler r2 bucket create tradies-pools
```

- The two `inc-cache` buckets stay **private** (bound as
  `NEXT_INC_CACHE_R2_BUCKET` in each `wrangler.jsonc`; used by the OpenNext
  incremental cache).
- `tradies-pools` gets **public access via custom domain**: R2 dashboard →
  `tradies-pools` → Settings → Custom Domains → add `pools.tradies.co.uk`.
  That value is the sites app's `POOL_BASE_URL` var (already set in
  `apps/sites/wrangler.jsonc`).

## Imagery pools (one-off curation)

```sh
PEXELS_API_KEY=... pnpm --filter @tradies/sites exec tsx ../../scripts/curate-pool.ts
```

Review `pool-out/` (6 pools x 6 images, 1600x1000, attribution.json per pool),
then upload — no extra dependencies, just a shell loop:

```sh
cd apps/sites
for f in ../../pool-out/*/*; do
  key="${f#../../pool-out/}"
  pnpm exec wrangler r2 object put "tradies-pools/$key" --file "$f" --remote
done
```

The sites pool route (`/pool/[pool]/[index]`) 302-redirects to
`${POOL_BASE_URL}/{pool}/{index}.jpg` when `IMAGE_POOL_SOURCE=r2`; without
those vars it serves the offline SVG placeholders (unchanged locally — visual
baselines are unaffected).

## Secrets

Set after the first deploy of each app (`vars` in `wrangler.jsonc` hold the
non-secret config):

| App   | `wrangler secret put ...`                                                                                                                               |
| ----- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| sites | `DATABASE_URL` (pooled 6543), `PREVIEW_VISIT_SALT`                                                                                                      |
| ops   | `DATABASE_URL` (pooled 6543), `OPS_AUTH_PASS` (**required** — dev default is not a credential), `ANTHROPIC_API_KEY`, `TRIGGER_SECRET_KEY`               |
| jobs  | via Trigger.dev dashboard env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `APIFY_TOKEN`, `FIRECRAWL_API_KEY`, `TRIGGER_SECRET_KEY`, `OUTREACH_DRY_RUN=1` |

`DATABASE_URL` is **mandatory** in production: `createDb` refuses the PGlite
fallback when `NODE_ENV=production` (and the Workers bundles deliberately do
not contain PGlite at all).

## Deploy order

```sh
# 1. Migrate — SESSION string, port 5432 (the 6543 pooler breaks migrations)
DATABASE_URL='postgres://...:5432/...' pnpm --filter @tradies/db db:migrate

# 2. Sites
pnpm --filter @tradies/sites build:cf
cd apps/sites && pnpm exec wrangler deploy && cd ../..

# 3. Ops
pnpm --filter @tradies/ops build:cf
cd apps/ops && pnpm exec wrangler deploy && cd ../..

# 4. Jobs (Trigger.dev, not Workers)
pnpm --filter @tradies/jobs deploy   # runs `trigger deploy`
```

Then set the secrets (table above), upload the pools, wire DNS, uncomment the
`routes` blocks and redeploy sites + ops.

## Rollback

```sh
cd apps/sites && pnpm exec wrangler rollback   # pick the previous version
cd apps/ops && pnpm exec wrangler rollback
```

Jobs roll back from the Trigger.dev dashboard (promote a previous deployment).
DB migrations are forward-only — write a compensating migration rather than
downgrading.

## Smoke checklist

- `curl -sI https://<any-slug>.app.tradies.co.uk | grep -i x-robots-tag` →
  `noindex, nofollow` on every preview response (compliance guardrail).
- `curl -s -o /dev/null -w '%{http_code}' https://outreach.tradies.co.uk` →
  `401` without credentials; loads with `OPS_AUTH_USER`/`OPS_AUTH_PASS`.
- `curl -sI https://<slug>.app.tradies.co.uk/pool/plumbing-modern/0` → `302`
  to `https://pools.tradies.co.uk/plumbing-modern/0.jpg`, and that URL serves
  a JPEG.
- Ops → generate a site for a manual prospect (exercises `DATABASE_URL` +
  `ANTHROPIC_API_KEY` + Trigger.dev round-trip).
- `wrangler tail tradies-sites` while clicking around — no uncaught errors.

## Later / optional

- **CI**: add `pnpm --filter @tradies/sites build:cf` and
  `pnpm --filter @tradies/ops build:cf` as a CI job so bundle regressions
  (e.g. PGlite creeping back into the Workers build) fail before deploy day.
  `.github/workflows/ci.yml` is intentionally untouched for now.
- **Durable Object tag cache / revalidation queue**: the apps ship with the
  OpenNext defaults (R2 incremental cache only) because nothing uses ISR or
  `revalidateTag` yet. If that changes, follow the OpenNext Cloudflare caching
  docs to add `doQueue` + `d1NextTagCache`/sharded DO tag cache and the
  matching `durable_objects` + `migrations` blocks in `wrangler.jsonc`.
- **Preview URL pattern**: ops' `PREVIEW_URL_PATTERN` var already points at
  `https://{slug}.app.tradies.co.uk`.
