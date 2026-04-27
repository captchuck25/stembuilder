import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// POST /api/bridge-submissions  { assignmentId, cost, passed }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignmentId, cost, passed } = await req.json()
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })

  const db = adminDb()

  // Verify assignment exists and student is enrolled
  const { data: assignment } = await db
    .from('bridge_assignments')
    .select('class_id, max_cost')
    .eq('id', assignmentId)
    .single()
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('class_id', assignment.class_id)
    .eq('student_id', session.user.id)
    .single()
  if (!enrollment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await db
    .from('bridge_submissions')
    .upsert(
      { assignment_id: assignmentId, student_id: session.user.id, cost, passed, submitted_at: new Date().toISOString() },
      { onConflict: 'assignment_id,student_id' }
    )
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}
