import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/blueprint-assignments/<id>
// Fetches one Blueprint Lab assignment for the tool (teacher preview now;
// the student assignment flow will use the same endpoint).
// Permission: the owning teacher, or a student enrolled in the class.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const db = adminDb()

  const { data: a } = await db
    .from('blueprint_assignments')
    .select('id, class_id, teacher_id, title, brief_id, config, shell_mode, shell_ids, status')
    .eq('id', id)
    .maybeSingle()

  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (a.teacher_id !== session.user.id) {
    const { data: enrollment } = await db
      .from('enrollments')
      .select('student_id')
      .eq('class_id', a.class_id)
      .eq('student_id', session.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!enrollment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    // Students only see assigned work; teachers can preview drafts.
    if (a.status !== 'assigned') return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  return NextResponse.json({
    id: a.id,
    title: a.title,
    briefId: a.brief_id,
    config: a.config,
    shellMode: a.shell_mode,
    shellIds: a.shell_ids,
    status: a.status,
  })
}
