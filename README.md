# Tradies Operations

Semi-automated platform that discovers UK tradespeople, generates a genuinely
good website for each from evidenced business facts, hosts it as a preview on
our domain, pitches the business by compliant outreach, and converts them to a
£19.99/mo subscription (site + AI chatbot + leads inbox + ongoing edits).

**Status: Phases 1–6 built — ops desk, engine, discovery pipeline, HTML
design systems + chatbot, hosting configs, outreach (dry-run), and the full
conversion stack (claim → Stripe → live → customer portal).**
Everything runs offline by default (PGlite + fixtures + deterministic
generators). Real services (Supabase, Claude, Trigger.dev, Apify, Firecrawl,
Smartlead, Resend, Stripe, Cloudflare) connect via env keys with no code
changes — see `.env.example`; runbooks in `docs/deploy-cloudflare.md` and
`docs/deploy-stripe.md`.

## Layout

| Package / app             | What it is                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/site-spec`      | The contract: Zod SiteSpec + StylePreset (design systems) + **FACT-GUARD** (blocks fabricated reviews/accreditations/history — DMCC) + JSON-LD |
| `packages/templates`      | Hand-crafted design system: 3 template families (classic/modern/bold) × section variants, seed style presets, pure `renderSite(spec, ctx)`     |
| `packages/engine`         | THE generation path (used by CLI, seed, ops, jobs): generator → validators → repair loop ≤3 → persist spec/site/events/costs                   |
| `packages/db`             | Drizzle schema (incl. the PECR CHECK constraint), migrations, PGlite harness, env-selected Postgres/PGlite client                              |
| `packages/compliance`     | PECR/ICO gates: corporate-only cold email, global suppression, TPS validity, legal footer — **no SMS channel exists by design**                |
| `packages/llm`            | Generator + facts-extractor interfaces, deterministic fixtures, versioned prompts, Anthropic clients, `verifyExtractedFacts` evidence check    |
| `packages/fixtures`       | 20 hand-written UK prospect fixtures + 3 HTML design-system fixtures + fake provider payloads                                                  |
| `packages/html-templates` | Uploaded-HTML machinery: deterministic sanitizer, annotation ops applier (LLM never rewrites markup), template validator, `renderHtmlSite`     |
| `packages/integrations`   | Provider interfaces + fixture/real adapters: Apify Google Maps discovery, Firecrawl v2, PSI v5, Haiku vision judge, Smartlead, Resend          |
| `apps/sites`              | Multi-tenant renderer: `{slug}.app.tradies.co.uk` (dev: `{slug}.localhost:3000`), noindex middleware choke point, lead capture                 |
| `apps/ops`                | Operator desk (`outreach.tradies.co.uk`): pipeline board, review queue, prospect detail, design library. Basic auth.                           |
| `apps/jobs`               | Trigger.dev v4 pipeline: discover → enrich → score → generate → QA → human gate (wait tokens) → outreach stub; daily preview expiry            |
| `apps/cli`                | Manual mode: `pnpm gen --name "..." --trade plumber --town Leeds --style modern`                                                               |

## Quickstart

```bash
pnpm install
pnpm test                            # unit + integration (PGlite) + compliance gates + pipeline dry run
pnpm --filter @tradies/sites seed    # seed 20 fixture sites (dev servers stopped)
pnpm --filter @tradies/sites dev     # http://<fixture-key>.localhost:3000
pnpm --filter @tradies/ops dev       # ops desk on http://localhost:3001 (Basic auth ops/tradies-dev in dev)
pnpm gen --name "Smith Plumbing" --trade plumber --town Leeds   # manual mode
```

Design systems constrain every generation and come in two kinds, resolved
system × trade (specialisation wins, generic falls back):

- **Component** ("modern", "heritage", "bold"): the engine fills copy and
  picks among the variants/palette/imagery the system allows.
- **HTML** (uploaded in `/library` → Upload design system): a self-contained
  lander becomes the pixel-fixed skeleton. Ingest sanitizes it (external
  scripts/analytics/iframes stripped; the keyless Google Maps embed is the
  one allowed exception), Claude marks slots via edit-ops applied
  deterministically (it can never rewrite the markup), dummy testimonials are
  stripped (DMCC), and per business Claude writes all content fresh into the
  manifest's slots — schema-enforced at emission, FACT-GUARD-checked after.
  Ships with 3 fixture systems (`craftsman-dark`, `coastal-light`,
  `bold-mono`), seeded active: `pnpm gen --style craftsman-dark ...` works
  offline.

Every generated site shows a keyless Google **Maps** embed of the business's
location (from the discovered address/town — no API key, the one external
embed the sanitizer sanctions) and, for discovered prospects, a compliant
"See our reviews on Google" link to their real Google listing (place_id).
All social-proof text is code-built, never LLM-authored — no rating or
review copy is ever fabricated, and JSON-LD emits no `aggregateRating`
(DMCC). Imagery comes from the `/pool` route: deterministic trade-tuned
placeholder art offline, real curated photography when `IMAGE_POOL_SOURCE=r2`

- a Pexels-sourced R2 pool are wired (`scripts/curate-pool.ts`).

Every generated site carries the lean chatbot widget (`/embed/v1.js` →
`POST /api/chat`): Claude Haiku answering only from the prospect's facts
sheet, capturing name/phone/email into the same `leads` table as the form,
demo-labelled on previews, per-session/site/IP rate limits (`CHAT_RATE_*`).
Preview visits are logged hashed-only (`PREVIEW_VISIT_SALT`) and surface as
"Opened N× from M devices" engagement on the pipeline board and prospect
page; operator opens (ops links carry `?op=1`) are excluded.

Outreach (Phase 5) generates a pitch per prospect (FACT-GUARD-validated, no
legal text — the footer is appended in code at dispatch), which the operator
reviews next to the site. Dispatch is dry-run by default
(`OUTREACH_DRY_RUN=1` → `outreach_messages` stop at `queued`); with a
Smartlead key it pushes to a per-(city,trade) campaign and webhooks drive
statuses, replies land in the ops `/inbox`, and `/u/[token]` one-click
unsubscribe suppresses globally.

Conversion (Phase 6): every preview banner links `/claim/{token}` — a
confirmation form + price block (£19.99/mo; the £149.99 setup fee display is
env-driven with a `SETUP_FEE_PROMO` kill switch, waived via a pre-applied
Stripe coupon) → Stripe Checkout → webhook flips the site **live** through
the engine's single go-live path (noindex off at the middleware choke point,
DB-driven and fail-closed; demo label off; prospect `converted`). Customers
manage everything at `/portal/{token}`: leads inbox with "mark handled",
change requests (feed the ops `/edits` queue, which regenerates through the
same engine path), chatbot toggle, lead-alert email, and Stripe billing
portal. New leads trigger an email alert via Resend. A daily
`reconcile_subscriptions` cron lapses sites past
`currentPeriodEnd + BILLING_GRACE_DAYS` and republishes recovered ones. Ops
gains `/customers` (MRR view) and Publish/Unpublish/Disable overrides —
every transition audited in the events timeline. The whole chain runs
offline (`pnpm --filter @tradies/sites test:e2e`); see
`docs/deploy-stripe.md` for the go-live checklist including the
solicitor-review items.

## Discovery (amended Phase 3)

Discovery scrapes Google Maps via the Apify actor (`APIFY_ACTOR_ID`,
default `compass~crawler-google-places`) and warehouses the payload
(name/address/phone/website/place id) directly into `prospects` with
provenance + the raw item for audit. Firecrawl scrapes each prospect's own
site; Claude extracts facts; `verifyExtractedFacts` drops any fact whose
quote isn't verbatim in the page. **Entity classification is a manual
operator decision** (ops desk, with a Companies House deep-link) — there is
no automated classifier and no "send anyway" path.

## Non-negotiables baked into code

- Cold email can only ever be queued for prospects the operator has marked
  corporate (Ltd/LLP) — enforced in `@tradies/compliance` **and** by a DB
  CHECK constraint; CI runs these as the `compliance-gates` job. Marking is
  the operator's decision and is audited in the events table.
- No cold-SMS code path exists anywhere (channel enums have no SMS member).
- Every preview response carries `X-Robots-Tag: noindex` (middleware choke
  point) and a "concept preview — not the official site" banner; previews
  expire after `PREVIEW_TTL_DAYS`.
- FACT-GUARD rejects generated copy asserting facts not in the evidenced
  facts sheet; the extraction side drops unquoted facts before they ever
  reach the warehouse.
- Google review scores from discovery (`totalScore`) are never rendered on
  generated sites (DMCC) — social proof is the live Google widget (Phase 4)
  or evidenced trust badges only.

## Deploying the database (when Supabase arrives)

```bash
DATABASE_URL=postgres://...:5432/postgres pnpm --filter @tradies/db db:migrate
```

Use the session-mode connection string (port 5432) for migrations; the apps
can use the pooled string. Without `DATABASE_URL`, everything uses local
PGlite (`PGLITE_DIR`).
