import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json(null)

  const db = adminDb()
  const { data } = await db.from('profiles').select('*').eq('id', session.user.id).is('deleted_at', null).single()
  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Whitelist the fields a user may set on their own profile. `role` is NOT
  // accepted at all: it is fixed at account creation (signup / onboarding
  // completion / rostering) and a student must never be able to escalate to
  // teacher by posting here. password_hash/username/google_id/id/account_origin
  // are likewise never client-settable.
  const update: Record<string, unknown> = { id: session.user.id }
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
  for (const field of ['district', 'state', 'grade_levels', 'content_area'] as const) {
    if (typeof body[field] === 'string') update[field] = body[field].trim()
  }

  const db = adminDb()
  // Guard, don't resurrect: a soft-deleted profile must not be re-activated
  // by a stale session's profile save.
  const { data: existing } = await db
    .from('profiles').select('id').eq('id', session.user.id).is('deleted_at', null).maybeSingle()
  if (!existing) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { error } = await db.from('profiles').upsert(update)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
