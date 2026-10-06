import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// One of the student's own shares.
//   PATCH  /api/stem-sketch/shares/[id]  { seen: true }  → marks feedback read
//   DELETE /api/stem-sketch/shares/[id]                  → unshare (soft)

async function ownShare(userId: string, id: string) {
  const db = adminDb()
  const { data } = await db
    .from('stem_sketch_shares')
    .select('id')
    .eq('id', id)
    .eq('student_id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  return { db, share: data }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { db, share } = await ownShare(session.user.id, id)
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const body = await req.json().catch(() => ({}))
  if (body?.seen) {
    const { error } = await db.from('stem_sketch_shares').update({ student_seen_at: new Date().toISOString() }).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const { db, share } = await ownShare(session.user.id, id)
  if (!share) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { error } = await db.from('stem_sketch_shares').update({ deleted_at: new Date().toISOString() }).eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
