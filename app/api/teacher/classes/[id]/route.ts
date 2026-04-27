import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { LEVELS } from '@/app/tools/code-lab/python/levels'

async function verifyTeacherOwnsClass(db: ReturnType<typeof import('@/lib/db.server').adminDb>, classId: string, teacherId: string) {
  const { data } = await db.from('classes').select('teacher_id').eq('id', classId).single()
  return data?.teacher_id === teacherId
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const db = adminDb()

  const [{ data: classData }, { data: assignData }, { data: enrollData }, { data: lockData }] = await Promise.all([
    db.from('classes').select('*').eq('id', classId).single(),
    db.from('assignments').select('*').eq('class_id', classId).order('level_id'),
    db.from('enrollments').select('student_id').eq('class_id', classId),
    db.from('lesson_locks').select('*').eq('class_id', classId),
  ])

  if (!classData) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const studentIds = (enrollData ?? []).map((e: { student_id: string }) => e.student_id)
  let students: unknown[] = []

  if (studentIds.length) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, name, email')
      .in('id', studentIds)

    const totalChallenges = (assignData ?? []).reduce((sum: number, a: { level_id: number }) => {
      const level = LEVELS[a.level_id]
      return sum + (level?.challenges.length ?? 0)
    }, 0)

    students = await Promise.all(
      (profiles ?? []).map(async (p: { id: string; name: string; email: string }) => {
        const { count } = await db
          .from('user_progress')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', p.id)
          .eq('completed', true)
          .not('challenge_idx', 'is', null)
        return { id: p.id, name: p.name, email: p.email, completedChallenges: count ?? 0, totalChallenges }
      })
    )
  }

  return NextResponse.json({ class: classData, assignments: assignData ?? [], locks: lockData ?? [], students, studentIds })
}

// PATCH /api/teacher/classes/[id]  { name } → rename class
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const db = adminDb()
  if (!(await verifyTeacherOwnsClass(db, classId, session.user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const { data, error } = await db
    .from('classes').update({ name: name.trim() }).eq('id', classId).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/teacher/classes/[id]              → delete entire class
// DELETE /api/teacher/classes/[id]?studentId=X  → remove one student enrollment
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const db = adminDb()
  if (!(await verifyTeacherOwnsClass(db, classId, session.user.id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const studentId = new URL(req.url).searchParams.get('studentId')

  if (studentId) {
    // Remove one student from the class
    const { error } = await db.from('enrollments')
      .delete().eq('class_id', classId).eq('student_id', studentId)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  }

  // Delete entire class — cascade related rows first
  await Promise.all([
    db.from('enrollments').delete().eq('class_id', classId),
    db.from('assignments').delete().eq('class_id', classId),
    db.from('lesson_locks').delete().eq('class_id', classId),
  ])
  const { error } = await db.from('classes').delete().eq('id', classId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
