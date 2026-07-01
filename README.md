# Tradies Operations

Semi-automated platform that discovers UK tradespeople, generates a genuinely
good website for each from evidenced business facts, hosts it as a preview on
our domain, pitches the business by compliant outreach, and converts them to a
£19.99/mo subscription (site + AI chatbot + leads inbox + ongoing edits).

**Status: Phase 1 — the core engine, fully offline.** No external accounts
needed: fixtures + a deterministic generator stand in for Google Places,
Companies House, Firecrawl and Claude. Later phases swap real adapters in
behind the same interfaces (see the build plan).

## Layout

| Package / app           | What it is                                                                                                                                     |
| ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/site-spec`    | The contract: Zod SiteSpec + StylePreset (design systems) + **FACT-GUARD** (blocks fabricated reviews/accreditations/history — DMCC) + JSON-LD |
| `packages/templates`    | Hand-crafted design system: 3 template families (classic/modern/bold) × section variants, seed style presets, pure `renderSite(spec, ctx)`     |
| `packages/db`           | Drizzle schema (incl. the PECR CHECK constraint), migrations, PGlite test harness                                                              |
| `packages/compliance`   | PECR/ICO gates: corporate-only cold email, global suppression, TPS validity, legal footer — **no SMS channel exists by design**                |
| `packages/llm`          | Generator interface, deterministic FixtureLLM, versioned prompts, Anthropic client (Phase 2)                                                   |
| `packages/fixtures`     | 20 hand-written UK prospect fixtures + fake provider payloads                                                                                  |
| `packages/integrations` | Provider interfaces + fixture adapters; `PlacesSafeResult` containment boundary (only `place_id` + flags are storable — Google ToS)            |
| `apps/sites`            | Multi-tenant renderer: `{slug}.app.tradies.co.uk` (dev: `{slug}.localhost:3000`), noindex middleware choke point, lead capture                 |
| `apps/cli`              | Manual mode: `pnpm gen --name "..." --trade plumber --town Leeds --style modern`                                                               |

## Quickstart

```bash
pnpm install
pnpm test                    # unit + integration (PGlite) + compliance gates
pnpm --filter @tradies/sites seed   # seed 20 fixture sites (dev server must be stopped)
pnpm --filter @tradies/sites dev    # then open http://<fixture-key>.localhost:3000
pnpm gen --name "Smith Plumbing" --trade plumber --town Leeds   # manual mode
```

Design systems ("modern", "heritage", "bold" — generic or trade-specialised)
constrain every generation: the engine only fills copy and picks among the
variants/palette/imagery a system allows. Curate them in
`packages/templates/src/seed-presets.ts` (DB-backed library UI lands with the
ops desk in Phase 2).

## Non-negotiables baked into code

- Cold email can only ever be queued for verified Ltd/LLP prospects — enforced
  in `@tradies/compliance` **and** by a DB CHECK constraint; CI runs these as
  the `compliance-gates` job.
- No cold-SMS code path exists anywhere (channel enums have no SMS member).
- Only `place_id` + derived booleans from Google Places are storable
  (`PlacesSafeResult` brand); business data comes from Overture/operator input.
- Every preview response carries `X-Robots-Tag: noindex` (middleware choke
  point) and a "concept preview — not the official site" banner.
- FACT-GUARD rejects any generated copy asserting facts that are not in the
  evidenced facts sheet.
