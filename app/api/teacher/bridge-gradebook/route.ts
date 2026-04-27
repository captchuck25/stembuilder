import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/teacher/bridge-gradebook?classId=X
// Returns all bridge submissions for all assignments in the class
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()

  // Verify teacher owns this class
  const { data: cls } = await db
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('teacher_id', session.user.id)
    .single()
  if (!cls) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  // Get all bridge assignments for this class
  const { data: assignments } = await db
    .from('bridge_assignments')
    .select('id')
    .eq('class_id', classId)

  if (!assignments?.length) return NextResponse.json([])

  const assignmentIds = assignments.map((a: { id: string }) => a.id)

  const { data: submissions } = await db
    .from('bridge_submissions')
    .select('assignment_id, student_id, cost, passed, submitted_at')
    .in('assignment_id', assignmentIds)

  return NextResponse.json(submissions ?? [])
}
