import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/student/assignment-records
// The caller's durable assignment history (see lib/assignmentRecords.server.ts):
// every finished assignment across tools, newest first, independent of whether
// the class still exists. Read-only; My Work renders it.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json([])

  const db = adminDb()
  const { data, error } = await db
    .from('student_assignment_records')
    .select('id, tool, assignment_id, assignment_title, class_id, class_name, attempt_no, passed, summary, result, design_ref, submitted_at')
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .order('submitted_at', { ascending: false })
    .limit(500)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data ?? [])
}
