import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { normalizeAssignmentConfig } from '@/app/tools/measurement-lab/constants'

// GET /api/measurement-assignments/[id]
// Returns the assignment config so a game page can lock its settings.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = adminDb()

  const { data, error } = await db
    .from('measurement_assignments')
    .select('id, title, tool, config, class_id')
    .eq('id', id)
    .single()

  if (error || !data) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Allow access if the caller is either an enrolled student or the teacher
  // who owns the class (so a teacher can try their own assignment).
  const [{ data: enrollment }, { data: classRow }] = await Promise.all([
    db.from('enrollments').select('id')
      .eq('class_id', data.class_id).eq('student_id', session.user.id).is('deleted_at', null).maybeSingle(),
    db.from('classes').select('teacher_id').eq('id', data.class_id).is('deleted_at', null).maybeSingle(),
  ])

  const isEnrolledStudent = !!enrollment
  const isOwningTeacher = classRow?.teacher_id === session.user.id
  if (!isEnrolledStudent && !isOwningTeacher) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  return NextResponse.json({ ...data, config: normalizeAssignmentConfig(data.config) })
}
