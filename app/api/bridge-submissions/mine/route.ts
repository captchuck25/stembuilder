import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/bridge-submissions/mine?assignmentId=X
// Returns the current student's submission for a given assignment, or null.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json(null)

  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!assignmentId) return NextResponse.json(null)

  const db = adminDb()
  const { data } = await db
    .from('bridge_submissions')
    .select('assignment_id, cost, passed, submitted_at')
    .eq('assignment_id', assignmentId)
    .eq('student_id', session.user.id)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}
