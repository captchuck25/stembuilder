import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { normalizeAssignmentConfig } from '@/app/tools/measurement-lab/constants'

// GET /api/student/measurement-assignments
// Measurement assignments for every class the student is enrolled in, with the
// caller's own progress merged in (best score, attempt count, passed).
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json([])

  const db = adminDb()
  const { data: enrollments } = await db
    .from('enrollments')
    .select('class_id')
    .eq('student_id', session.user.id)
    .is('deleted_at', null)

  if (!enrollments?.length) return NextResponse.json([])

  const classIds = enrollments.map((e: { class_id: string }) => e.class_id)

  // measurement_assignments.class_id has no FK to classes (0015), so a
  // PostgREST embed (`classes(name)`) errors — fetch the names separately.
  const [{ data: assignments, error: aErr }, { data: attempts }, { data: classRows }] = await Promise.all([
    db.from('measurement_assignments')
      .select('*')
      .in('class_id', classIds)
      .order('created_at', { ascending: false }),
    db.from('measurement_attempts')
      .select('assignment_id, correct')
      .eq('student_id', session.user.id)
      .is('deleted_at', null),
    db.from('classes')
      .select('id, name')
      .in('id', classIds),
  ])
  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 500 })
  const className = new Map((classRows ?? []).map((c: { id: string; name: string }) => [c.id, c.name]))

  const best = new Map<string, { bestCorrect: number; attemptCount: number }>()
  for (const at of attempts ?? []) {
    const prev = best.get(at.assignment_id)
    if (!prev) best.set(at.assignment_id, { bestCorrect: at.correct, attemptCount: 1 })
    else {
      prev.attemptCount += 1
      prev.bestCorrect = Math.max(prev.bestCorrect, at.correct)
    }
  }

  const result = (assignments ?? []).map((a: Record<string, unknown>) => {
    const cfg = normalizeAssignmentConfig(a.config as Record<string, unknown>)
    const mine = best.get(a.id as string)
    return {
      id: a.id,
      class_id: a.class_id,
      class_name: className.get(a.class_id as string) ?? '',
      title: a.title,
      tool: a.tool,
      config: cfg,
      bestCorrect: mine?.bestCorrect ?? null,
      attemptCount: mine?.attemptCount ?? 0,
      passed: cfg.scoring === "score" ? (mine?.attemptCount ?? 0) > 0 : (mine?.bestCorrect ?? -1) >= cfg.passThreshold,
    }
  })

  return NextResponse.json(result)
}
