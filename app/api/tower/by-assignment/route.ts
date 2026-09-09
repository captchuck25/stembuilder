import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/tower/by-assignment?assignmentId=X
// Returns the student's saved tower design for a specific assignment.
// Strategy 1: name = 'asgn_<id>' (deterministic save key the tool writes)
// Strategy 2: assignment_id column match
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json(null)

  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!assignmentId) return NextResponse.json(null)

  const db = adminDb()
  const userId = session.user.id

  const { data: byKey } = await db
    .from('tower_designs')
    .select('*')
    .eq('user_id', userId)
    .eq('name', `asgn_${assignmentId}`)
    .is('deleted_at', null)
    .maybeSingle()
  if (byKey) return NextResponse.json(byKey)

  const { data: byId } = await db
    .from('tower_designs')
    .select('*')
    .eq('user_id', userId)
    .eq('assignment_id', assignmentId)
    .is('deleted_at', null)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (byId) return NextResponse.json(byId)

  return NextResponse.json(null)
}
