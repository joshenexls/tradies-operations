#!/usr/bin/env bash
set -euo pipefail

# scripts/deploy.sh — sequenced, gated go-live deploy orchestrator.
#
# Runs the deploy stages in the one safe order and STOPS at the first problem:
#   1. preflight   — `pnpm preflight` (aborts before touching prod if a key is missing)
#   2. migrate     — packages/db drizzle migrations (needs the SESSION DATABASE_URL)
#   3. build       — both apps' Cloudflare Worker bundles (build:cf)
#   4. deploy sites — wrangler deploy, then a post-deploy /api/health check
#   5. deploy ops  — wrangler deploy
#   6. deploy jobs — Trigger.dev (trigger deploy), skipped if the script is absent
#
# It ORCHESTRATES only — it stores no secrets. It assumes the founder has run
# `wrangler login` and has DATABASE_URL (+ Stripe/Resend/etc.) exported in the
# shell, or passes a gitignored env file with --env-file .env.production.
#
# Irreversible stages (migrate, each deploy) require a typed `yes` unless --yes
# is given or CI is set. See docs/deploy-day.md for the full runbook + the
# verification gate that goes with each stage.

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── flags ────────────────────────────────────────────────────────────────────
ASSUME_YES=0
ENV_FILE=''
STAGE='(startup)'

usage() {
  cat <<'EOF'
Usage: scripts/deploy.sh [--yes] [--env-file PATH] [--help]

Sequenced, verification-gated go-live deploy. Stages:
  1. preflight       pnpm preflight              (abort on any critical misconfig)
  2. migrate         @tradies/db db:migrate      (SESSION DATABASE_URL, port 5432)
  3. build           @tradies/{sites,ops} build:cf
  4. deploy sites    wrangler deploy  + /api/health check
  5. deploy ops      wrangler deploy
  6. deploy jobs     @tradies/jobs deploy        (Trigger.dev; skipped if absent)

Options:
  --yes             Skip the typed confirmations (for the founder, once trusted).
                    Also implied when CI is set.
  --env-file PATH   Source PATH first (e.g. a gitignored .env.production) so
                    DATABASE_URL and friends are present. Secrets are NOT stored
                    by this script — they only live in your shell / Cloudflare.
  --help            Show this help.

Optional env:
  SITES_HEALTH_URL  Full URL of the sites /api/health endpoint. When set, stage 4
                    curls it and asserts { ok: true, db: "up" }. When unset the
                    check is skipped with a warning (deploy is not failed).
EOF
}

while [ "$#" -gt 0 ]; do
  case "$1" in
    --yes | -y) ASSUME_YES=1 ;;
    --env-file)
      shift
      ENV_FILE="${1:-}"
      if [ -z "$ENV_FILE" ]; then
        echo "error: --env-file needs a path" >&2
        exit 2
      fi
      ;;
    --env-file=*) ENV_FILE="${1#*=}" ;;
    --help | -h)
      usage
      exit 0
      ;;
    *)
      echo "error: unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
  shift
done

# CI is a non-interactive robot — never block on a prompt.
if [ -n "${CI:-}" ]; then
  ASSUME_YES=1
fi

trap 'echo ""; echo "✗ deploy.sh failed during stage: ${STAGE}" >&2' ERR

# ── helpers ──────────────────────────────────────────────────────────────────
banner() {
  echo ""
  echo "================================================================"
  echo "  $1"
  echo "================================================================"
}

# confirm PROMPT — typed-yes gate for irreversible steps (bypassed by --yes/CI).
confirm() {
  local prompt="$1"
  if [ "$ASSUME_YES" -eq 1 ]; then
    echo "  → auto-confirmed (--yes/CI): ${prompt}"
    return 0
  fi
  local reply=''
  read -r -p "  Type 'yes' to ${prompt}: " reply
  if [ "$reply" != "yes" ]; then
    echo "  Aborted at operator request." >&2
    exit 1
  fi
}

require_env() {
  local name="$1"
  if [ -z "${!name:-}" ]; then
    echo "error: \$${name} is not set — export it (or pass --env-file) before deploying." >&2
    exit 1
  fi
}

# health_check URL — assert { ok: true, db: "up" }, retrying a few times to ride
# out propagation. Returns non-zero on failure so the caller decides severity.
health_check() {
  local url="$1"
  local attempt
  local body=''
  for attempt in 1 2 3 4 5; do
    if body="$(curl -fsS --max-time 15 "$url" 2>/dev/null)"; then
      if printf '%s' "$body" | grep -q '"ok":[[:space:]]*true' &&
        printf '%s' "$body" | grep -q '"db":[[:space:]]*"up"'; then
        echo "  ✓ health OK: ${body}"
        return 0
      fi
      echo "  … attempt ${attempt}: reachable but not ready yet: ${body}"
    else
      echo "  … attempt ${attempt}: ${url} not reachable yet"
    fi
    sleep 6
  done
  echo "  ✗ health check never reported { ok: true, db: \"up\" }" >&2
  return 1
}

# ── optional env file ────────────────────────────────────────────────────────
if [ -n "$ENV_FILE" ]; then
  if [ ! -f "$ENV_FILE" ]; then
    echo "error: --env-file '${ENV_FILE}' not found" >&2
    exit 1
  fi
  echo "Sourcing env from ${ENV_FILE}"
  set -a
  # shellcheck disable=SC1090
  . "$ENV_FILE"
  set +a
fi

cd "$ROOT"

banner "Tradies deploy — go-live sequence"
echo "  repo:        ${ROOT}"
echo "  confirmations: $([ "$ASSUME_YES" -eq 1 ] && echo 'SKIPPED (--yes/CI)' || echo 'required (typed yes)')"
echo "  This orchestrates deploys but stores no secrets. Ctrl-C to bail anytime."

# ── 1. Preflight ─────────────────────────────────────────────────────────────
STAGE='preflight'
banner "1/6  Preflight — pnpm preflight"
echo "  Prints the describeReadiness report and exits non-zero if any critical"
echo "  service is misconfigured. This is the gate that catches missing keys"
echo "  BEFORE anything is deployed."
if ! pnpm preflight; then
  echo "" >&2
  echo "✗ Preflight failed — fix the critical(s) above, then re-run. Nothing deployed." >&2
  exit 1
fi
echo "  ✓ preflight passed"

# ── 2. Migrate ───────────────────────────────────────────────────────────────
STAGE='migrate'
banner "2/6  Migrate — @tradies/db db:migrate"
echo "  Applies drizzle migrations to Postgres. This is FORWARD-ONLY and touches"
echo "  the production database."
echo "  DATABASE_URL here MUST be the Supabase SESSION string (port 5432) — the"
echo "  transaction pooler (6543) breaks migrations."
require_env DATABASE_URL
confirm "run migrations against \$DATABASE_URL"
pnpm --filter @tradies/db db:migrate
echo "  ✓ migrations applied"

# ── 3. Build ─────────────────────────────────────────────────────────────────
STAGE='build'
banner "3/6  Build — Cloudflare Worker bundles (build:cf)"
echo "  OpenNext → .open-next/worker.js for each app. CI's build-cf job already"
echo "  asserts these bundles are PGlite/.wasm-free."
pnpm --filter @tradies/sites build:cf
pnpm --filter @tradies/ops build:cf
echo "  ✓ both Worker bundles built"

# ── 4. Deploy sites ──────────────────────────────────────────────────────────
STAGE='deploy sites'
banner "4/6  Deploy sites — wrangler deploy (tradies-sites)"
echo "  Publishes apps/sites/.open-next/worker.js to Cloudflare."
confirm "deploy the sites Worker to Cloudflare"
(cd "$ROOT/apps/sites" && pnpm exec wrangler deploy)
echo "  ✓ sites deployed"

STAGE='verify sites health'
echo ""
echo "  Post-deploy health check:"
if [ -n "${SITES_HEALTH_URL:-}" ]; then
  if ! health_check "$SITES_HEALTH_URL"; then
    echo "✗ sites is deployed but /api/health is not green — investigate before ops." >&2
    echo "  (DATABASE_URL secret set on the worker? migrations applied? see docs/deploy-day.md)" >&2
    exit 1
  fi
else
  echo "  ⚠ SITES_HEALTH_URL not set — skipping the automated check."
  echo "    Verify manually: curl https://<sites-host>/api/health  → { ok: true, db: \"up\" }"
  echo "    and curl 'https://<sites-host>/api/health?token=\$HEALTH_TOKEN' for service modes."
fi

# ── 5. Deploy ops ────────────────────────────────────────────────────────────
STAGE='deploy ops'
banner "5/6  Deploy ops — wrangler deploy (tradies-ops)"
echo "  Publishes apps/ops/.open-next/worker.js to Cloudflare."
confirm "deploy the ops Worker to Cloudflare"
(cd "$ROOT/apps/ops" && pnpm exec wrangler deploy)
echo "  ✓ ops deployed"
echo ""
echo "  Verify manually: open the ops /status page (behind Basic auth) — the"
echo "  readiness board should be green, including its cross-worker fetch of the"
echo "  sites /api/health?token=\$HEALTH_TOKEN."

# ── 6. Deploy jobs ───────────────────────────────────────────────────────────
STAGE='deploy jobs'
banner "6/6  Deploy jobs — Trigger.dev (trigger deploy)"
echo "  jobs is NOT a Cloudflare Worker — it deploys to Trigger.dev Cloud and"
echo "  needs TRIGGER_SECRET_KEY / TRIGGER_PROJECT_ID (from your shell or the"
echo "  Trigger.dev dashboard)."
if node -e "process.exit(require('${ROOT}/apps/jobs/package.json').scripts?.deploy ? 0 : 1)" 2>/dev/null; then
  confirm "deploy jobs to Trigger.dev"
  pnpm --filter @tradies/jobs deploy
  echo "  ✓ jobs deployed"
else
  echo "  ⚠ apps/jobs has no 'deploy' script — skipping (deploy jobs from the"
  echo "    Trigger.dev dashboard, or add the script)."
fi

# ── done ─────────────────────────────────────────────────────────────────────
STAGE='done'
trap - ERR
banner "Deploy sequence complete"
echo "  Next: walk the verification gates in docs/deploy-day.md —"
echo "    • sites  /api/health            → { ok: true, db: \"up\" }"
echo "    • sites  /api/health?token=…    → stripe/email/chat/imagery modes"
echo "    • ops    /status                → all green"
echo "    • Stripe test-mode purchase, then the 'real lead alert' smoke."
echo ""
