'use server'

import { revalidatePath } from 'next/cache'
import { FixtureResendMailer, RealResendMailer, type ResendMailer } from '@tradies/integrations'
import { getDb } from '@/lib/db'
import {
  closeThreadCore,
  sendReplyCore,
  suppressAndCloseThreadCore,
  type InboxActionResult,
} from '../core/inbox'

/** Real Resend only when a key is present — every other environment stays offline. */
function resolveMailer(env: NodeJS.ProcessEnv = process.env): ResendMailer {
  if (env.RESEND_API_KEY) return new RealResendMailer({ apiKey: env.RESEND_API_KEY })
  return new FixtureResendMailer()
}

function refresh(threadId: string): void {
  revalidatePath('/inbox', 'layout')
  revalidatePath(`/inbox/${threadId}`)
}

export async function sendReply(threadId: string, body: string): Promise<InboxActionResult> {
  const result = await sendReplyCore(getDb(), resolveMailer(), { threadId, body })
  if ('ok' in result) refresh(threadId)
  return result
}

export async function closeThread(threadId: string): Promise<InboxActionResult> {
  const result = await closeThreadCore(getDb(), threadId)
  if ('ok' in result) refresh(threadId)
  return result
}

export async function suppressAndCloseThread(threadId: string): Promise<InboxActionResult> {
  const result = await suppressAndCloseThreadCore(getDb(), threadId)
  if ('ok' in result) refresh(threadId)
  return result
}
