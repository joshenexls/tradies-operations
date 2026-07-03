# Deploy day — the go-live runbook

The single executable runbook for taking Tradies live. Every stage has an
explicit **verification gate**: nothing is trusted until a health check confirms
it. Work top to bottom.

This consolidates the two deeper references — read them once for the account-side
detail that cannot live in code, then drive the deploy from here:

- [`deploy-cloudflare.md`](./deploy-cloudflare.md) — DNS/TLS, R2 buckets, imagery
  pool curation, the full secrets matrix.
- [`deploy-stripe.md`](./deploy-stripe.md) — Stripe products/prices/coupon,
  webhook endpoint, billing lifecycle, legal checklist.

The orchestration itself is [`scripts/deploy.sh`](../scripts/deploy.sh): it runs
the stages below in order and stops at the first failure.

---

## 0. Prerequisites

Accounts and one-time setup (details in `deploy-cloudflare.md` / `deploy-stripe.md`):

- **Cloudflare** account with the `tradies.co.uk` zone, **Workers Paid** plan, and
  **R2** enabled. R2 buckets created: `tradies-sites-inc-cache`,
  `tradies-ops-inc-cache`, `tradies-pools`.
- **Supabase** Postgres with BOTH connection strings to hand:
  - **Session** string (port **5432**) — migrations only.
  - **Pooled** string (port **6543**) — the runtime `DATABASE_URL` for every app.
- **Trigger.dev** Cloud project for jobs (`TRIGGER_PROJECT_ID` / `TRIGGER_SECRET_KEY`).
- **Stripe** account with products/prices/coupon and the webhook endpoint set up
  (see `deploy-stripe.md` §1–§4).
- **Resend** account with a verified sending domain (lead alerts + outreach).
- Local: `pnpm install`, then **`wrangler login`** (wrangler is a pinned
  devDependency of both apps — the deploy runs it via `pnpm exec wrangler …`).

### Secrets — set them in Cloudflare (per app, after the first deploy)

`vars` in each `wrangler.jsonc` hold the non-secret config; secrets go in via
`wrangler secret put`. Run from the app dir (`cd apps/sites` / `cd apps/ops`):

| App   | `wrangler secret put …`                                                                                                                      |
| ----- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| sites | `DATABASE_URL` (pooled 6543), `PREVIEW_VISIT_SALT`, `HEALTH_TOKEN`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `RESEND_API_KEY`           |
| ops   | `DATABASE_URL` (pooled 6543), `OPS_AUTH_PASS` (**required**), `ANTHROPIC_API_KEY`, `TRIGGER_SECRET_KEY`, `HEALTH_TOKEN`                      |
| jobs  | via the Trigger.dev dashboard env vars: `DATABASE_URL`, `ANTHROPIC_API_KEY`, `STRIPE_SECRET_KEY`, `TRIGGER_SECRET_KEY`, `OUTREACH_DRY_RUN=1` |

- `HEALTH_TOKEN` is a shared secret set on **both** sites and ops — it gates the
  full sites readiness endpoint (`/api/health?token=…`), and the ops `/status`
  board fetches sites with it cross-worker.
- ⚠️ **Silent-fixture keys.** If `STRIPE_SECRET_KEY`, `RESEND_API_KEY`, or
  `SMARTLEAD_API_KEY` are absent, that service runs as a **fixture with no error**:
  no real payment / no email / no outreach. Preflight (below) surfaces these as
  service modes so you never ship "live" with a service silently faked.
- `DATABASE_URL` is **mandatory** in production: `createDb` refuses the PGlite
  fallback under `NODE_ENV=production`, and the Worker bundle contains no PGlite
  at all (CI's `build-cf` job enforces that).

---

## 1. Preflight — the pre-deploy gate

```sh
pnpm preflight
```

Prints the `describeReadiness` report (DB reachability, migration status, and the
mode of each service — stripe/email/chat/imagery) and **exits non-zero if any
critical service is misconfigured**. A "critical" looks like: `DATABASE_URL`
missing/unreachable, or a key you intend to be live still absent so the service
would run as a silent fixture.

**Gate:** `pnpm preflight` must exit `0`. If it doesn't, fix the reported
critical(s) and re-run — do not proceed. `scripts/deploy.sh` runs this first and
aborts on a non-zero exit before touching anything.

---

## 2. Run the deploy

```sh
# dry, gated (typed 'yes' before each irreversible stage):
export DATABASE_URL='postgres://…:5432/…'      # SESSION string for migrations
export SITES_HEALTH_URL='https://app.tradies.co.uk/api/health'
scripts/deploy.sh

# once you trust it, skip the confirmations:
scripts/deploy.sh --yes
```

The script sequences: **preflight → migrate → build → deploy sites → deploy ops →
deploy jobs**, with a post-deploy `/api/health` check after sites. It stores no
secrets; it assumes `wrangler login` and the env above.

> Migrations use the **SESSION** `DATABASE_URL` (port 5432). The runtime workers
> use the **POOLED** string (6543), set as the `DATABASE_URL` Cloudflare secret —
> a different value from the one you export for the migrate step.

### Verification gate after each stage

| Stage            | How to verify                                                                                                 | Expected                                                                                                 |
| ---------------- | ------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| **migrate**      | `pnpm --filter @tradies/db db:migrate` prints applied migrations; re-running is a no-op.                      | No pending migrations.                                                                                   |
| **build**        | `apps/{sites,ops}/.open-next/worker.js` exist; CI `build-cf` is green.                                        | Bundles built, PGlite/.wasm guard passes.                                                                |
| **deploy sites** | `curl https://app.tradies.co.uk/api/health`                                                                   | `{ "ok": true, "db": "up", "time": … }`                                                                  |
| ↳ readiness      | `curl 'https://app.tradies.co.uk/api/health?token=$HEALTH_TOKEN'`                                             | migrations current; `stripe`/`email` show `real` (not `fixture`)                                         |
| **deploy ops**   | Open the ops **`/status`** page (behind Basic auth `OPS_AUTH_USER`/`OPS_AUTH_PASS`).                          | Board all green: DB up, migrations current, and the cross-worker sites `/api/health?token=` check green. |
| **deploy jobs**  | Trigger.dev dashboard shows the new deployment; the `reconcile_subscriptions` cron (05:00 UTC) is registered. | Deployment live, schedule registered.                                                                    |

If the sites `/api/health` is not `{ ok: true, db: "up" }`, **stop** — the most
common cause is the `DATABASE_URL` secret not set on the worker, or migrations not
applied. If `/api/health?token=` shows `stripe` or `email` as `fixture` when you
meant to be live, the corresponding secret is missing on the worker (silent
fixture) — set it and redeploy before taking payments or sending mail.

After the workers are green: upload the imagery pools, wire DNS + the
`*.app.tradies.co.uk` TLS cert, uncomment the `routes` blocks in both
`wrangler.jsonc`, and redeploy sites + ops (see `deploy-cloudflare.md` §DNS+TLS
and §Imagery pools).

---

## 3. Stripe test-mode purchase walkthrough

Prove the full money path end-to-end **against Stripe test mode** before flipping
to live keys — a claim → checkout → webhook → site-live cycle.

1. In the Stripe dashboard, switch to **Test mode**. Use the **test-mode**
   `sk_test_…` / `whsec_…` and test-mode price/coupon ids as the sites worker
   secrets (or point at a staging deploy) so no real card is charged.
2. Confirm the webhook endpoint exists in test mode:
   `https://app.tradies.co.uk/api/webhooks/stripe`, subscribed to exactly
   `checkout.session.completed`, `customer.subscription.updated`,
   `customer.subscription.deleted` (see `deploy-stripe.md` §3). Copy its test
   signing secret into `STRIPE_WEBHOOK_SECRET`.
3. On a claimed preview site, start checkout. The setup fee should show struck to
   **£0.00** ("Waived — code WELCOME applied"); the monthly line is **£19.99**.
4. Pay with the Stripe **test card `4242 4242 4242 4242`**, any future expiry, any
   CVC/postcode.
5. **Verify the webhook fired:** Stripe dashboard → Developers → Webhooks → the
   endpoint shows `checkout.session.completed` delivered `200`. (`wrangler tail
tradies-sites` shows the handler run.)
6. **Verify the site flipped live:** the prospect goes `converted`, the site goes
   `live` with **noindex off** —
   `curl -sI https://<slug>.app.tradies.co.uk | grep -i x-robots-tag` should no
   longer return `noindex` for that site. The ops prospect page shows `active` /
   `live`, and the welcome email with the portal link is sent.
7. In the customer **Billing Portal**, confirm "Manage billing" opens a portal
   session (update card / cancel / invoices).

**Gate:** webhook delivered `200`, site is `live` with noindex off, welcome email
sent. Only after this passes in test mode do you swap in the **live** Stripe keys
(`sk_live_…` / live `whsec_…` / live price ids) and set `SETUP_FEE_PROMO` per the
legal sign-off in `deploy-stripe.md` §6.

---

## 4. Smoke — "send yourself a real lead alert"

Confirms the live email path (Resend) actually delivers, not just the fixture.

1. Ensure `RESEND_API_KEY` and `LEAD_ALERT_FROM_EMAIL` (a verified Resend domain)
   are set on the **sites** worker. Re-run `pnpm preflight` /
   `/api/health?token=$HEALTH_TOKEN` and confirm `email` shows **`real`**, not
   `fixture` — a missing key means alerts are silently dropped.
2. On a **live** tenant site, submit the lead/contact form as if you were a
   customer's customer (use your own email as the business owner's alert address).
3. **Verify:** the new-lead alert email arrives in that inbox within a minute
   (check the Resend dashboard → Emails for the delivery + status), and the lead
   appears on the ops side.

**Gate:** a real email lands in your inbox. If nothing arrives, `email` is almost
certainly still a fixture (key absent) or the Resend domain isn't verified.

---

## 5. Rollback

Deploys are versioned; roll a bad one back immediately, then diagnose.

```sh
cd apps/sites && pnpm exec wrangler rollback   # pick the previous version
cd apps/ops   && pnpm exec wrangler rollback
```

- **jobs**: roll back from the Trigger.dev dashboard (promote a previous deployment).
- **DB migrations are forward-only** — never downgrade; write a compensating
  migration and deploy forward.
- After any rollback, re-run the stage-2 verification gates (`/api/health`,
  `/api/health?token=`, ops `/status`) to confirm you're back to green.

---

## 6. Observability

For go-live, three live signals — no external tooling required:

- **`wrangler tail tradies-sites`** / **`wrangler tail tradies-ops`** — live
  request/error logs while you click around. No uncaught errors is the bar.
- **ops `/status` page** — the standing red/green readiness board (ops + shared
  env, DB ping, migration check, and the cross-worker sites health fetch).
- **sites `/api/health`** — public liveness (`{ ok, db, time }`); with
  `?token=$HEALTH_TOKEN`, full readiness including each service's mode.

Sentry / Langfuse tracing are explicitly a **later round** — not part of day 1.
