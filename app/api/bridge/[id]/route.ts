import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = adminDb()
  const { data } = await db.from('bridge_designs').select('*').eq('id', id).is('deleted_at', null).maybeSingle()
  return NextResponse.json(data ?? null)
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = adminDb()
  // Soft delete (30-day retention window) — purged permanently by the daily job.
  const { error } = await db
    .from('bridge_designs')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id)
    .eq('user_id', session.user.id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
