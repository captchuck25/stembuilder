import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { stemSketchAssignmentsAllowed } from '@/lib/stem-sketch.server'
import { getChallenge } from '@/lib/stem-sketch/challenges'

// POST /api/teacher/stem-sketch-grade
// Body: { submissionId, scores: { [rubricRowId]: number } }
// Saves level 3 rubric scores on a submission. Scores are validated against
// the challenge's code-defined rubric (row ids + allowed band values).
// Re-grading is allowed — later saves overwrite.
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!(await stemSketchAssignmentsAllowed(session.user.id)))
    return NextResponse.json({ error: 'STEM Sketch assignments require a Pro plan' }, { status: 403 })

  const { submissionId, scores } = await req.json()
  if (!submissionId || !scores || typeof scores !== 'object')
    return NextResponse.json({ error: 'Missing submissionId or scores' }, { status: 400 })

  const db = adminDb()
  const { data: sub } = await db
    .from('stem_sketch_submissions')
    .select('id, assignment_id')
    .eq('id', submissionId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const { data: assignment } = await db
    .from('stem_sketch_assignments')
    .select('teacher_id, challenge_id')
    .eq('id', sub.assignment_id)
    .single()
  if (!assignment || assignment.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const challenge = getChallenge(assignment.challenge_id)
  if (!challenge?.rubric)
    return NextResponse.json({ error: 'This challenge has no rubric' }, { status: 400 })

  // Validate: every scored row exists in the rubric and its value is one of
  // the row's band scores. Rows may be omitted (partial grading is fine).
  const clean: Record<string, { score: number }> = {}
  for (const [rowId, val] of Object.entries(scores)) {
    const row = challenge.rubric.find(r => r.id === rowId)
    if (!row) return NextResponse.json({ error: `Unknown rubric row: ${rowId}` }, { status: 400 })
    const score = Number(val)
    if (!row.bandScores.includes(score))
      return NextResponse.json({ error: `Invalid score ${val} for ${rowId}` }, { status: 400 })
    clean[rowId] = { score }
  }

  const { error } = await db
    .from('stem_sketch_submissions')
    .update({
      rubric_scores: clean,
      graded_at: new Date().toISOString(),
      graded_by: session.user.id,
    })
    .eq('id', submissionId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const total = Object.values(clean).reduce((s, r) => s + r.score, 0)
  const max = challenge.rubric.reduce((s, r) => s + r.bandScores[0], 0)
  return NextResponse.json({ ok: true, total, max })
}
