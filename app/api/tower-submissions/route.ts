import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { recordAssignmentCompletion, findOwnDesign } from '@/lib/assignmentRecords.server'

// POST /api/tower-submissions  { assignmentId, cost, passed }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignmentId, cost, passed } = await req.json()
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })

  const db = adminDb()

  // Verify assignment exists and student is enrolled
  const { data: assignment } = await db
    .from('tower_assignments')
    .select('class_id, max_cost, title')
    .eq('id', assignmentId)
    .single()
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('class_id', assignment.class_id)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .single()
  if (!enrollment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await db
    .from('tower_submissions')
    .upsert(
      { assignment_id: assignmentId, student_id: session.user.id, cost, passed, submitted_at: new Date().toISOString(), deleted_at: null },
      { onConflict: 'assignment_id,student_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Student's durable copy of the outcome (best-effort; never blocks the submit).
  const designId = await findOwnDesign(db, 'tower_designs', session.user.id, assignmentId)
  await recordAssignmentCompletion(db, {
    studentId: session.user.id, tool: 'tower', assignmentId,
    title: assignment.title ?? 'Tower Assignment', classId: assignment.class_id,
    passed: !!passed,
    summary: `$${Math.round(Number(cost) || 0).toLocaleString()} · ${passed ? 'passed' : 'not passed'}`,
    result: { cost, maxCost: assignment.max_cost },
    designRef: designId ? { tool: 'tower', id: designId } : null,
  })
  return NextResponse.json(data)
}
