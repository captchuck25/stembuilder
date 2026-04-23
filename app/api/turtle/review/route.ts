import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const studentIds = req.nextUrl.searchParams.get('studentIds')?.split(',').filter(Boolean) ?? []
  if (!studentIds.length) return NextResponse.json([])

  const db = adminDb()
  const { data } = await db
    .from('turtle_submissions')
    .select('*')
    .in('user_id', studentIds)
    .not('submitted_at', 'is', null)

  return NextResponse.json(data ?? [])
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, approved } = await req.json()
  const db = adminDb()
  const { error } = await db
    .from('turtle_submissions')
    .update({ approved, updated_at: new Date().toISOString() })
    .eq('id', id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
