# Tradies Operations

Semi-automated platform that discovers UK tradespeople, generates a genuinely
good website for each from evidenced business facts, hosts it as a preview on
our domain, pitches the business by compliant outreach, and converts them to a
£19.99/mo subscription (site + AI chatbot + leads inbox + ongoing edits).

**Status: Stage A + B built — ops desk, engine, and the discovery pipeline.**
Everything runs offline by default (PGlite + fixtures + a deterministic
generator). Real services (Supabase, Claude, Trigger.dev, Apify, Firecrawl)
connect via env keys with no code changes — see `.env.example`.

## Layout

| Package / app           | What it is                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/site-spec`    | The contract: Zod SiteSpec + StylePreset (design systems) + **FACT-GUARD** (blocks fabricated reviews/accreditations/history — DMCC) + JSON-LD |
| `packages/templates`    | Hand-crafted design system: 3 template families (classic/modern/bold) × section variants, seed style presets, pure `renderSite(spec, ctx)`     |
| `packages/engine`       | THE generation path (used by CLI, seed, ops, jobs): generator → validators → repair loop ≤3 → persist spec/site/events/costs                   |
| `packages/db`           | Drizzle schema (incl. the PECR CHECK constraint), migrations, PGlite harness, env-selected Postgres/PGlite client                              |
| `packages/compliance`   | PECR/ICO gates: corporate-only cold email, global suppression, TPS validity, legal footer — **no SMS channel exists by design**                |
| `packages/llm`          | Generator + facts-extractor interfaces, deterministic fixtures, versioned prompts, Anthropic clients, `verifyExtractedFacts` evidence check    |
| `packages/fixtures`     | 20 hand-written UK prospect fixtures + fake provider payloads                                                                                  |
| `packages/integrations` | Provider interfaces + fixture/real adapters: Apify Google Maps discovery, Firecrawl v2, PSI v5, Haiku vision judge                             |
| `apps/sites`            | Multi-tenant renderer: `{slug}.app.tradies.co.uk` (dev: `{slug}.localhost:3000`), noindex middleware choke point, lead capture                 |
| `apps/ops`              | Operator desk (`outreach.tradies.co.uk`): pipeline board, review queue, prospect detail, design library. Basic auth.                           |
| `apps/jobs`             | Trigger.dev v4 pipeline: discover → enrich → score → generate → QA → human gate (wait tokens) → outreach stub; daily preview expiry            |
| `apps/cli`              | Manual mode: `pnpm gen --name "..." --trade plumber --town Leeds --style modern`                                                               |

## Quickstart

```bash
pnpm install
pnpm test                            # unit + integration (PGlite) + compliance gates + pipeline dry run
pnpm --filter @tradies/sites seed    # seed 20 fixture sites (dev servers stopped)
pnpm --filter @tradies/sites dev     # http://<fixture-key>.localhost:3000
pnpm --filter @tradies/ops dev       # ops desk on http://localhost:3001 (Basic auth ops/tradies-dev in dev)
pnpm gen --name "Smith Plumbing" --trade plumber --town Leeds   # manual mode
```

Design systems ("modern", "heritage", "bold" — generic or trade-specialised)
constrain every generation: the engine only fills copy and picks among the
variants/palette/imagery a system allows. Curate them in the ops desk
`/library` (DB-backed; seeds ship from `packages/templates/src/seed-presets.ts`).

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
