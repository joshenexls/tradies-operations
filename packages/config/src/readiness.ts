/**
 * The single source of truth for "is this service really wired, or silently
 * faked?". Every integration resolver picks real-vs-fixture from env, and the
 * fixtures succeed silently — so a prod deploy missing a key runs green while
 * doing nothing. This pure reporter re-derives each resolver's decision from
 * the same env so preflight (before deploy) and the health/status surfaces
 * (after deploy) can show the founder the truth. It mirrors the resolvers;
 * the agreement test guards against drift.
 */

export type ServiceMode = 'real' | 'fixture' | 'dry-run' | 'disabled'
export type ReadinessScope = 'shared' | 'sites' | 'ops' | 'jobs'

export type ServiceStatus = {
  name: string
  scope: ReadinessScope
  mode: ServiceMode
  /** The env key that flips this service to real. */
  envKey: string
  /** True when this mode is harmful in the intended (production) environment. */
  critical: boolean
  note: string
}

export type ReadinessReport = {
  production: boolean
  db: { configured: boolean; driver: 'postgres' | 'pglite' }
  services: ServiceStatus[]
  /** Human-readable, production-only: the things that must be fixed before go-live. */
  criticalWarnings: string[]
}

type Env = Record<string, string | undefined>

const has = (v: string | undefined) => typeof v === 'string' && v.trim().length > 0

export function describeReadiness(env: Env = process.env): ReadinessReport {
  const production = env.NODE_ENV === 'production'
  const services: ServiceStatus[] = []
  const criticalWarnings: string[] = []

  // ── DB ────────────────────────────────────────────────────────────────────
  const dbConfigured = has(env.DATABASE_URL)
  const dbDriver: 'postgres' | 'pglite' = dbConfigured ? 'postgres' : 'pglite'
  const db = { configured: dbConfigured, driver: dbDriver }
  if (production && !dbConfigured) {
    criticalWarnings.push('DATABASE_URL is unset: production requires Supabase Postgres.')
  }

  // ── Email (silent-fixture: absent key → fixture, no send, no error) ────────
  const emailReal = has(env.RESEND_API_KEY)
  services.push({
    name: 'Email (Resend)',
    scope: 'shared',
    envKey: 'RESEND_API_KEY',
    mode: emailReal ? 'real' : 'fixture',
    critical: production && !emailReal,
    note: emailReal
      ? 'Lead alerts, inbox replies and claim/welcome emails send for real.'
      : 'FIXTURE: no email is sent (lead alerts, inbox replies, claim emails silently no-op).',
  })
  if (production && !emailReal) {
    criticalWarnings.push(
      'Email is in FIXTURE mode (RESEND_API_KEY unset): no emails will actually send.',
    )
  }

  // ── Stripe (silent-fixture + unsigned-webhook risk) ────────────────────────
  const stripeReal = has(env.STRIPE_SECRET_KEY)
  const stripeWebhook = has(env.STRIPE_WEBHOOK_SECRET)
  services.push({
    name: 'Payments (Stripe)',
    scope: 'sites',
    envKey: 'STRIPE_SECRET_KEY',
    mode: stripeReal ? 'real' : 'fixture',
    critical: production && (!stripeReal || !stripeWebhook),
    note: !stripeReal
      ? 'FIXTURE: no real charge; the webhook accepts UNSIGNED bodies.'
      : stripeWebhook
        ? 'Checkout + signed webhooks are live.'
        : 'LIVE key but STRIPE_WEBHOOK_SECRET unset — webhooks will 500 and sites never publish.',
  })
  if (production && !stripeReal) {
    criticalWarnings.push(
      'Stripe is in FIXTURE mode (STRIPE_SECRET_KEY unset): no payments; the webhook trusts unsigned bodies.',
    )
  } else if (production && stripeReal && !stripeWebhook) {
    criticalWarnings.push(
      'Stripe is live but STRIPE_WEBHOOK_SECRET is unset: webhook verification will fail and paid sites will never go live.',
    )
  }

  // ── Outreach (Smartlead) — key + OUTREACH_DRY_RUN ──────────────────────────
  const smartleadReal = has(env.SMARTLEAD_API_KEY)
  const dryRun = (env.OUTREACH_DRY_RUN ?? '1') !== '0'
  const outreachMode: ServiceMode = !smartleadReal ? 'fixture' : dryRun ? 'dry-run' : 'real'
  services.push({
    name: 'Outreach (Smartlead)',
    scope: 'jobs',
    envKey: 'SMARTLEAD_API_KEY',
    mode: outreachMode,
    // dry-run is a legitimate deliberate state, never critical
    critical: false,
    note:
      outreachMode === 'real'
        ? 'Cold email dispatches to Smartlead.'
        : outreachMode === 'dry-run'
          ? 'DRY-RUN: messages stop at "queued" (OUTREACH_DRY_RUN≠0).'
          : 'FIXTURE: no outreach sent (SMARTLEAD_API_KEY unset).',
  })

  // ── LLM-backed generators (mode flag + ANTHROPIC_API_KEY) ──────────────────
  const anthropic = has(env.ANTHROPIC_API_KEY)
  const llm = (flag: string | undefined, on: string) => (flag === on ? anthropic : false)
  services.push(
    modeFlagService(
      'Site generator',
      'jobs',
      'SITE_GENERATOR',
      llm(env.SITE_GENERATOR, 'anthropic'),
      env.SITE_GENERATOR === 'anthropic',
    ),
    modeFlagService(
      'Pitch generator',
      'jobs',
      'PITCH_GENERATOR',
      llm(env.PITCH_GENERATOR, 'anthropic'),
      env.PITCH_GENERATOR === 'anthropic',
    ),
    modeFlagService(
      'Chatbot',
      'sites',
      'CHAT_RESPONDER',
      llm(env.CHAT_RESPONDER, 'anthropic'),
      env.CHAT_RESPONDER === 'anthropic',
    ),
    modeFlagService(
      'Discovery + facts (Apify/Firecrawl)',
      'jobs',
      'INTEGRATIONS',
      env.INTEGRATIONS === 'real',
      env.INTEGRATIONS === 'real',
    ),
  )

  // ── Imagery ────────────────────────────────────────────────────────────────
  const imageryReal = env.IMAGE_POOL_SOURCE === 'r2' && has(env.POOL_BASE_URL)
  services.push({
    name: 'Imagery pool',
    scope: 'sites',
    envKey: 'IMAGE_POOL_SOURCE',
    mode: imageryReal ? 'real' : 'fixture',
    critical: false, // placeholder art is presentable; real photos are an upgrade
    note: imageryReal
      ? 'Serving curated photography from R2.'
      : 'Deterministic placeholder art (set IMAGE_POOL_SOURCE=r2 + POOL_BASE_URL for real photos).',
  })

  // ── Compliance / security secrets ──────────────────────────────────────────
  pushSecret(services, criticalWarnings, production, {
    name: 'Unsubscribe HMAC',
    scope: 'jobs',
    envKey: 'UNSUBSCRIBE_SECRET',
    set: has(env.UNSUBSCRIBE_SECRET),
    warn: 'UNSUBSCRIBE_SECRET is unset: one-click unsubscribe tokens use a guessable dev default (PECR).',
  })
  pushSecret(services, criticalWarnings, production, {
    name: 'Preview-visit salt',
    scope: 'sites',
    envKey: 'PREVIEW_VISIT_SALT',
    set: has(env.PREVIEW_VISIT_SALT),
    warn: 'PREVIEW_VISIT_SALT is unset: hashed visitor ids use a guessable dev default.',
  })
  pushSecret(services, criticalWarnings, production, {
    name: 'Ops Basic-auth password',
    scope: 'ops',
    envKey: 'OPS_AUTH_PASS',
    set: has(env.OPS_AUTH_PASS),
    warn: 'OPS_AUTH_PASS is unset: the ops desk has no real password.',
  })

  // Operator legal identity only matters when outreach actually sends
  const legalSet = has(env.OPERATOR_COMPANY_NUMBER) && has(env.OPERATOR_REGISTERED_OFFICE)
  services.push({
    name: 'Operator legal identity',
    scope: 'jobs',
    envKey: 'OPERATOR_COMPANY_NUMBER',
    mode: legalSet ? 'real' : 'fixture',
    critical: production && outreachMode === 'real' && !legalSet,
    note: legalSet
      ? 'Company number + registered office set for the legal footer.'
      : 'Placeholder company number/office (fine until you send real cold email).',
  })
  if (production && outreachMode === 'real' && !legalSet) {
    criticalWarnings.push(
      'Sending real cold email (OUTREACH_DRY_RUN=0) with a placeholder company number/registered office — a PECR/company-law exposure.',
    )
  }

  return { production, db, services, criticalWarnings }
}

function modeFlagService(
  name: string,
  scope: ReadinessScope,
  envKey: string,
  real: boolean,
  flagOn: boolean,
): ServiceStatus {
  return {
    name,
    scope,
    envKey,
    mode: real ? 'real' : 'fixture',
    critical: false, // these require an explicit opt-in flag; never silently harmful
    note: real
      ? 'Live (Claude/real providers).'
      : flagOn
        ? 'Flag set but ANTHROPIC_API_KEY missing — resolver will throw.'
        : 'Deterministic fixture (set the mode flag + ANTHROPIC_API_KEY to go live).',
  }
}

function pushSecret(
  services: ServiceStatus[],
  warnings: string[],
  production: boolean,
  s: { name: string; scope: ReadinessScope; envKey: string; set: boolean; warn: string },
): void {
  services.push({
    name: s.name,
    scope: s.scope,
    envKey: s.envKey,
    mode: s.set ? 'real' : 'fixture',
    critical: production && !s.set,
    note: s.set ? 'Set.' : s.warn,
  })
  if (production && !s.set) warnings.push(s.warn)
}
