import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/bridge/by-assignment?assignmentId=X
// Returns the student's saved bridge design for a specific assignment.
// Strategy 1: look for name = 'asgn_<id>'  (deterministic save key, no extra column needed)
// Strategy 2: look for assignment_id column match (if the column has been added)
// Strategy 3: look for name matching the assignment title + span/load (legacy fallback)
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json(null)

  const assignmentId = req.nextUrl.searchParams.get('assignmentId')
  if (!assignmentId) return NextResponse.json(null)

  const db = adminDb()
  const userId = session.user.id

  // Strategy 1: deterministic save key
  const saveName = `asgn_${assignmentId}`
  const { data: byKey } = await db
    .from('bridge_designs')
    .select('*')
    .eq('user_id', userId)
    .eq('name', saveName)
    .maybeSingle()

  if (byKey) return NextResponse.json(byKey)

  // Strategy 2: assignment_id column (if it exists — Supabase returns error if missing, data is null)
  const { data: byId } = await db
    .from('bridge_designs')
    .select('*')
    .eq('user_id', userId)
    .eq('assignment_id', assignmentId)
    .order('updated_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (byId) return NextResponse.json(byId)

  // Strategy 3: legacy — name matches assignment title + same span/load
  const { data: assignment } = await db
    .from('bridge_assignments')
    .select('title, span_feet, load_lb')
    .eq('id', assignmentId)
    .single()

  if (assignment) {
    const legacyName = assignment.title || 'Bridge Assignment'
    const { data: byLegacy } = await db
      .from('bridge_designs')
      .select('*')
      .eq('user_id', userId)
      .eq('name', legacyName)
      .eq('span_feet', assignment.span_feet)
      .eq('load_lb', assignment.load_lb)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (byLegacy) return NextResponse.json(byLegacy)
  }

  return NextResponse.json(null)
}
