import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json(null)

  const db = adminDb()
  const { data } = await db.from('profiles').select('*').eq('id', session.user.id).single()
  return NextResponse.json(data ?? null)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()

  // Whitelist the fields a user may set on their own profile. In particular,
  // `role` is clamped to teacher/student so this route can never be used to
  // self-promote to admin, and password_hash/username/google_id/id are never
  // client-settable here.
  const update: Record<string, unknown> = { id: session.user.id }
  if (typeof body.name === 'string' && body.name.trim()) update.name = body.name.trim()
  if (body.role === 'teacher' || body.role === 'student') update.role = body.role
  for (const field of ['district', 'state', 'grade_levels', 'content_area'] as const) {
    if (typeof body[field] === 'string') update[field] = body[field].trim()
  }

  const db = adminDb()
  const { error } = await db.from('profiles').upsert(update)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
