import type { adminDb } from '@/lib/db.server'

// Returns true if the teacher owns at least one class the student is enrolled in.
// Used to gate teacher access to a student's saved work across tools.
export async function teacherSharesClassWithStudent(
  db: ReturnType<typeof adminDb>,
  teacherId: string,
  studentId: string,
): Promise<boolean> {
  const { data: teacherClasses } = await db
    .from('classes')
    .select('id')
    .eq('teacher_id', teacherId)

  const classIds = (teacherClasses ?? []).map((c: { id: string }) => c.id)
  if (classIds.length === 0) return false

  const { count } = await db
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .in('class_id', classIds)

  return (count ?? 0) > 0
}
