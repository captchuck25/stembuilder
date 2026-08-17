import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { getChallenge, PRECISION_LABEL } from '@/lib/stem-sketch/challenges'

// GET /api/student/stem-sketch-assignments
// STEM Sketch assignments for every class the student is enrolled in, with the
// caller's own progress merged in (passed, attempt count).
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

  const [{ data: assignments }, { data: submissions }] = await Promise.all([
    db.from('stem_sketch_assignments')
      .select('*, classes(name)')
      .in('class_id', classIds)
      .order('created_at', { ascending: false }),
    db.from('stem_sketch_submissions')
      .select('assignment_id, passed')
      .eq('student_id', session.user.id)
      .is('deleted_at', null),
  ])

  const mine = new Map<string, { passed: boolean; attemptCount: number }>()
  for (const s of submissions ?? []) {
    const prev = mine.get(s.assignment_id)
    if (!prev) mine.set(s.assignment_id, { passed: s.passed, attemptCount: 1 })
    else {
      prev.attemptCount += 1
      prev.passed = prev.passed || s.passed
    }
  }

  const result = (assignments ?? [])
    .map((a: Record<string, unknown>) => {
      const challenge = getChallenge(a.challenge_id as string)
      if (!challenge) return null // challenge retired from the library
      const m = mine.get(a.id as string)
      return {
        id: a.id,
        class_id: a.class_id,
        class_name: (a.classes as { name: string } | null)?.name ?? '',
        title: a.title,
        challenge_id: challenge.id,
        challenge_title: challenge.title,
        precision: challenge.precision,
        precision_label: PRECISION_LABEL[challenge.precision],
        passed: m?.passed ?? false,
        attemptCount: m?.attemptCount ?? 0,
      }
    })
    .filter(Boolean)

  return NextResponse.json(result)
}
