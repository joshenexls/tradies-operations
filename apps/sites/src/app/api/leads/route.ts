import { eq } from 'drizzle-orm'
import { NextResponse, type NextRequest } from 'next/server'
import { leads, sites } from '@tradies/db/schema'
import { getDb } from '@/lib/db'
import { scheduleLeadAlert } from '@/lib/lead-alerts'
import { resolveMailer } from '@/lib/mailer'

export async function POST(request: NextRequest) {
  const siteId = request.nextUrl.searchParams.get('site')
  if (!siteId) return NextResponse.json({ error: 'missing site' }, { status: 400 })

  const form = await request.formData()
  const name = String(form.get('name') ?? '').trim()
  const phone = String(form.get('phone') ?? '').trim()
  const message = String(form.get('message') ?? '').trim()
  const email = String(form.get('email') ?? '').trim() || null
  if (!name || (!phone && !email)) {
    return NextResponse.json({ error: 'name and a contact method are required' }, { status: 400 })
  }

  const db = getDb()
  const [site] = await db.select().from(sites).where(eq(sites.id, siteId)).limit(1)
  if (!site) return NextResponse.json({ error: 'unknown site' }, { status: 404 })

  const [lead] = await db
    .insert(leads)
    .values({
      siteId: site.id,
      source: 'form',
      name,
      phone: phone || null,
      email,
      message: message || null,
    })
    .returning()
  if (lead) {
    scheduleLeadAlert(db, resolveMailer(), lead.id, { origin: request.nextUrl.origin })
  }

  const referer = request.headers.get('referer')
  const back = referer ? new URL(referer) : new URL('/', request.nextUrl.origin)
  back.searchParams.set('sent', '1')
  return NextResponse.redirect(back, 303)
}
