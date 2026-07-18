import { adminDb } from '@/lib/db.server'

// Soft-delete helpers backing the 30-day retention window (Privacy Policy).
// Each wraps a SQL function from db/migrations/0005_soft_delete_retention.sql
// that sets deleted_at = now() on the row AND its dependents in one
// transaction. Rows stay recoverable (deleted_at = null) until the daily
// purge job hard-deletes anything tombstoned more than 30 days ago.

async function rpc(fn: string, args: Record<string, string>) {
  const { error } = await adminDb().rpc(fn, args)
  if (error) throw new Error(`${fn} failed: ${error.message}`)
}

// Account (teacher or student). Teachers cascade to their classes,
// enrollments, and class-scoped student work; students cascade to their
// enrollments, progress, and saved work. Reset tokens are removed outright.
export function softDeleteUser(userId: string) {
  return rpc('soft_delete_user', { p_user_id: userId })
}

// Class: cascades to its enrollments and its assignments' submissions.
// Assignments/locks stay in place (unreachable) so a restore is complete.
export function softDeleteClass(classId: string) {
  return rpc('soft_delete_class', { p_class_id: classId })
}

// Remove one student from one class (the enrollment row is personal data).
export function softDeleteEnrollment(classId: string, studentId: string) {
  return rpc('soft_delete_enrollment', { p_class_id: classId, p_student_id: studentId })
}
