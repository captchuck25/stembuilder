import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/teacher/bridge-assignments?classId=X
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: assignments } = await db
    .from('bridge_assignments')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })

  // Attach completion counts
  const result = await Promise.all((assignments ?? []).map(async (a: { id: string }) => {
    const { count } = await db
      .from('bridge_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('assignment_id', a.id)
      .eq('passed', true)
    return { ...a, completionCount: count ?? 0 }
  }))

  return NextResponse.json(result)
}

// POST /api/teacher/bridge-assignments
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { classId, title, spanFeet, loadLb, maxCost } = await req.json()
  if (!classId || !spanFeet || !loadLb || !maxCost)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await db
    .from('bridge_assignments')
    .insert({ class_id: classId, teacher_id: session.user.id, title: title?.trim() || 'Bridge Assignment', span_feet: spanFeet, load_lb: loadLb, max_cost: maxCost })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, completionCount: 0 })
}

// DELETE /api/teacher/bridge-assignments?id=X
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db.from('bridge_assignments').select('teacher_id').eq('id', id).single()
  if (!a || a.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db.from('bridge_assignments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
