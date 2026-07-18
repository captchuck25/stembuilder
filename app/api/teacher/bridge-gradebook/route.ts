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
    .is('deleted_at', null)
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
    .is('deleted_at', null)

  type Sub = { assignment_id: string; student_id: string; cost: number; passed: boolean; submitted_at: string }
  const subs = (submissions ?? []) as Sub[]

  // Pull every bridge_designs row whose name matches one of this class's assignment save keys.
  // These are the autosaved / manually-saved in-progress designs.
  const designNames = assignmentIds.map(id => `asgn_${id}`)
  const { data: designs } = await db
    .from('bridge_designs')
    .select('user_id, name, cost, passed, thumbnail, updated_at')
    .in('name', designNames)
    .is('deleted_at', null)
  type Design = { user_id: string; name: string; cost: number | null; passed: boolean | null; thumbnail: string | null; updated_at: string }
  const designRows = (designs ?? []) as Design[]

  // Thumbnail map (used for both submissions and drafts)
  const thumbMap: Record<string, string> = {}
  for (const d of designRows) {
    if (!d.thumbnail) continue
    const aid = d.name.startsWith('asgn_') ? d.name.slice(5) : d.name
    thumbMap[`${d.user_id}:${aid}`] = d.thumbnail
  }

  // Drafts = designs without a corresponding submission for the same (student, assignment).
  const submittedKeys = new Set(subs.map(s => `${s.student_id}:${s.assignment_id}`))
  const drafts = designRows
    .map(d => {
      const aid = d.name.startsWith('asgn_') ? d.name.slice(5) : d.name
      return {
        assignment_id: aid,
        student_id: d.user_id,
        cost: d.cost ?? 0,
        passed: d.passed ?? false,
        thumbnail: d.thumbnail ?? null,
        updated_at: d.updated_at,
      }
    })
    .filter(d => !submittedKeys.has(`${d.student_id}:${d.assignment_id}`))

  const result = subs.map(s => ({ ...s, thumbnail: thumbMap[`${s.student_id}:${s.assignment_id}`] ?? null }))
  return NextResponse.json({ submissions: result, drafts })
}
