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

  const [{ data: assignments }, { data: attempts }] = await Promise.all([
    db.from('measurement_assignments')
      .select('*, classes(name)')
      .in('class_id', classIds)
      .order('created_at', { ascending: false }),
    db.from('measurement_attempts')
      .select('assignment_id, correct')
      .eq('student_id', session.user.id)
      .is('deleted_at', null),
  ])

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
      class_name: (a.classes as { name: string } | null)?.name ?? '',
      title: a.title,
      tool: a.tool,
      config: cfg,
      bestCorrect: mine?.bestCorrect ?? null,
      attemptCount: mine?.attemptCount ?? 0,
      passed: (mine?.bestCorrect ?? -1) >= cfg.passThreshold,
    }
  })

  return NextResponse.json(result)
}
