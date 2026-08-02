import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isMeasTool, normalizeAssignmentConfig } from '@/app/tools/measurement-lab/constants'

// GET /api/teacher/measurement-assignments?classId=X
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: assignments } = await db
    .from('measurement_assignments')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })

  // Attach how many distinct students have attempted each assignment
  const result = await Promise.all((assignments ?? []).map(async (a: { id: string }) => {
    const { data: attempts } = await db
      .from('measurement_attempts')
      .select('student_id')
      .eq('assignment_id', a.id)
      .is('deleted_at', null)
    const attemptStudentCount = new Set((attempts ?? []).map((r: { student_id: string }) => r.student_id)).size
    return { ...a, attemptStudentCount }
  }))

  return NextResponse.json(result)
}

// POST /api/teacher/measurement-assignments
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { classId, title, tool, config } = await req.json()
  if (!classId || !isMeasTool(tool))
    return NextResponse.json({ error: 'Missing or invalid fields' }, { status: 400 })

  // normalizeAssignmentConfig clamps questionCount (5–20), timerSeconds and
  // passThreshold (1..questionCount) — store the normalized form.
  const cfg = normalizeAssignmentConfig(config)

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await db
    .from('measurement_assignments')
    .insert({
      class_id: classId,
      teacher_id: session.user.id,
      title: title?.trim() || 'Measurement Assignment',
      tool,
      config: cfg,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, attemptStudentCount: 0 })
}

// DELETE /api/teacher/measurement-assignments?id=X
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db.from('measurement_assignments').select('teacher_id').eq('id', id).single()
  if (!a || a.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db.from('measurement_assignments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
