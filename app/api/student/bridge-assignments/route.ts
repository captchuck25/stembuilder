import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/student/bridge-assignments
// Returns bridge assignments for all classes the student is enrolled in,
// with a `submitted` flag indicating whether they already passed.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json([])

  const db = adminDb()
  const { data: enrollments } = await db
    .from('enrollments')
    .select('class_id')
    .eq('student_id', session.user.id)

  if (!enrollments?.length) return NextResponse.json([])

  const classIds = enrollments.map((e: { class_id: string }) => e.class_id)

  const [{ data: assignments }, { data: submissions }] = await Promise.all([
    db.from('bridge_assignments')
      .select('*, classes(name)')
      .in('class_id', classIds)
      .order('created_at', { ascending: false }),
    db.from('bridge_submissions')
      .select('assignment_id, passed')
      .eq('student_id', session.user.id),
  ])

  const subMap = new Map((submissions ?? []).map((s: { assignment_id: string; passed: boolean }) => [s.assignment_id, s.passed]))

  const result = (assignments ?? []).map((a: Record<string, unknown>) => ({
    ...a,
    submitted: subMap.has(a.id as string),
    passed: subMap.get(a.id as string) ?? false,
  }))

  return NextResponse.json(result)
}
