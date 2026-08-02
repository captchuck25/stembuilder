import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { normalizeAssignmentConfig } from '@/app/tools/measurement-lab/constants'

// POST /api/measurement-attempts
// Records one finished assignment attempt (append-only — every finish inserts
// a new row so teachers see attempt counts, not just bests).
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { assignmentId, correct, total, durationS, missed } = await req.json()
  if (!assignmentId) return NextResponse.json({ error: 'Missing assignmentId' }, { status: 400 })

  const db = adminDb()
  const { data: assignment } = await db
    .from('measurement_assignments')
    .select('id, class_id, config')
    .eq('id', assignmentId)
    .single()
  if (!assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('class_id', assignment.class_id)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!enrollment) return NextResponse.json({ error: 'Not enrolled in this class' }, { status: 403 })

  const cfg = normalizeAssignmentConfig(assignment.config)
  if (!Number.isInteger(correct) || !Number.isInteger(total) ||
      total !== cfg.questionCount || correct < 0 || correct > total)
    return NextResponse.json({ error: 'Invalid score' }, { status: 400 })

  const duration = Number.isInteger(durationS) && durationS > 0 ? Math.min(durationS, 7200) : null

  // Cap the missed-question payload: at most one entry per question, short strings.
  const cleanMissed = Array.isArray(missed)
    ? missed.slice(0, total).map((m: Record<string, unknown>) => ({
        q: Number.isInteger(m?.q) ? m.q : 0,
        target: String(m?.target ?? '').slice(0, 80),
        answer: String(m?.answer ?? '').slice(0, 80),
      }))
    : null

  const { error } = await db.from('measurement_attempts').insert({
    assignment_id: assignmentId,
    student_id: session.user.id,
    correct,
    total,
    duration_s: duration,
    missed: cleanMissed,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true }, { status: 201 })
}
