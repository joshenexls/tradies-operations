import { FixtureResendMailer, RealResendMailer, type ResendMailer } from '@tradies/integrations'

/** Real Resend only when a key is present — every other environment stays offline. */
export function resolveMailer(env: NodeJS.ProcessEnv = process.env): ResendMailer {
  if (env.RESEND_API_KEY) return new RealResendMailer({ apiKey: env.RESEND_API_KEY })
  return new FixtureResendMailer()
}
