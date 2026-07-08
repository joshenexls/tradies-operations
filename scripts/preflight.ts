/**
 * Pre-deploy readiness gate. Prints the describeReadiness report for the
 * current environment and EXITS NON-ZERO when a service is critically
 * misconfigured for production — so a missing RESEND_API_KEY / Stripe key /
 * unsubscribe secret is caught before the deploy, not after (when the system
 * runs "green" while silently sending nothing and taking no money).
 *
 *   pnpm preflight                          # checks the current shell env
 *   pnpm preflight --env-file .env.prod     # checks a specific env file
 *   NODE_ENV=production pnpm preflight       # simulate the go-live check anywhere
 *
 * Fixture / dry-run modes are NOT failures (they are legitimate deliberate
 * states) — only criticalWarnings fail the gate, and those only exist when
 * NODE_ENV=production. Imports the readiness reporter by relative path (it is
 * a pure, dependency-free function) so this runs from a bare `tsx` without
 * needing workspace symlinks hoisted to the repo root.
 */
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describeReadiness, type ServiceMode } from '../packages/config/src/readiness'

const isTty = process.stdout.isTTY
const paint = (code: number, s: string) => (isTty ? `\x1b[${code}m${s}\x1b[0m` : s)
const green = (s: string) => paint(32, s)
const red = (s: string) => paint(31, s)
const amber = (s: string) => paint(33, s)
const dim = (s: string) => paint(90, s)

/** pnpm sets INIT_CWD to the directory the command was invoked from. */
const invokedFrom = process.env.INIT_CWD ?? process.cwd()

function loadEnvFile(file: string): void {
  const resolved = path.resolve(invokedFrom, file)
  let text: string
  try {
    text = readFileSync(resolved, 'utf8')
  } catch {
    console.error(red(`preflight: could not read --env-file ${resolved}`))
    process.exit(2)
  }
  for (const line of text.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    let value = trimmed.slice(eq + 1).trim()
    const quoted =
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    if (quoted) value = value.slice(1, -1)
    // an explicit shell value always wins over the file
    if (process.env[key] === undefined) process.env[key] = value
  }
  console.log(dim(`(loaded ${resolved})`))
}

const argv = process.argv.slice(2)
for (let i = 0; i < argv.length; i++) {
  const arg = argv[i]
  if (arg === '--env-file') {
    const next = argv[i + 1]
    if (next) {
      loadEnvFile(next)
      i++
    }
  } else if (arg?.startsWith('--env-file=')) {
    loadEnvFile(arg.slice('--env-file='.length))
  }
}

const report = describeReadiness(process.env)

function modeLabel(mode: ServiceMode, critical: boolean): string {
  const glyph = critical ? '✗' : mode === 'real' ? '●' : mode === 'disabled' ? '·' : '○'
  const text = `${glyph} ${mode}`.padEnd(12)
  if (critical) return red(text)
  if (mode === 'real') return green(text)
  if (mode === 'disabled') return dim(text)
  return amber(text)
}

console.log('')
console.log(
  `Readiness — ${report.production ? green('production') : amber('non-production')} · db ${
    report.db.configured ? green(report.db.driver) : amber(report.db.driver)
  }`,
)
console.log(dim('─'.repeat(66)))
for (const s of report.services) {
  console.log(`${modeLabel(s.mode, s.critical)} ${dim(`[${s.scope}]`.padEnd(9))} ${s.name}`)
  console.log(dim(`             ${s.note}`))
}
console.log(dim('─'.repeat(66)))

if (report.criticalWarnings.length > 0) {
  console.log(red(`\n${report.criticalWarnings.length} CRITICAL — must fix before go-live:`))
  for (const w of report.criticalWarnings) console.log(red(`  ✗ ${w}`))
  console.log('')
  process.exit(1)
}

if (report.production) {
  console.log(green('\n✓ No critical misconfigurations. Safe to deploy.\n'))
} else {
  console.log(
    amber(
      '\nNon-production env: nothing is gated. Set NODE_ENV=production (or --env-file a prod env) to run the real go-live check.\n',
    ),
  )
}
process.exit(0)
