import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/bridge/by-assignment?assignmentId=X
// Returns the student's saved bridge design for a specific assignment, if one exists.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json(null)

  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!assignmentId) return NextResponse.json(null)

  const db = adminDb()
  const { data } = await db
    .from('bridge_designs')
    .select('*')
    .eq('user_id', session.user.id)
    .eq('assignment_id', assignmentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  return NextResponse.json(data ?? null)
}
