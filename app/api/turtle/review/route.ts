import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const studentIds = req.nextUrl.searchParams.get('studentIds')?.split(',').filter(Boolean) ?? []
  if (!studentIds.length) return NextResponse.json([])

  const db = adminDb()
  // Return every turtle_submissions row, including those without a submitted_at —
  // tutorial completions and tutorial code auto-saves intentionally write rows with
  // submit:false (submitted_at stays null), so filtering by submitted_at hid all
  // tutorial activity from the teacher dashboard. The dashboard differentiates
  // tutorial vs. challenge rendering client-side and only treats challenge rows as
  // submissions when submitted_at is set, so including drafts here is safe.
  const { data } = await db
    .from('turtle_submissions')
    .select('*')
    .in('user_id', studentIds)
    .is('deleted_at', null)

  return NextResponse.json(data ?? [])
}

export async function PATCH(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id, approved } = await req.json()
  const db = adminDb()
  const { error } = await db
    .from('turtle_submissions')
    .update({ approved, updated_at: new Date().toISOString() })
    .eq('id', id)
    .is('deleted_at', null)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
