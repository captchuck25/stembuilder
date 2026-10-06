import type { SupabaseClient } from '@supabase/supabase-js'

// Who may act on a class.
//
//   owner      — classes.teacher_id (created the class)
//   co-teacher — a live row in class_teachers (added by the owner)
//
// Both get the same everyday view: students, assignments, submissions,
// grades, shared designs. Only the owner deletes the class or manages
// co-teachers. Every teacher route should gate through these helpers rather
// than comparing classes.teacher_id to the session directly — that older
// check is what hid a class from everyone but its creator.
//
// A missing class_teachers table (migration 0033 not yet run) is treated as
// "no co-teachers", so the app can deploy ahead of the migration.

export type ClassRole = 'owner' | 'co-teacher'

type Db = SupabaseClient

async function coTaughtClassIds(db: Db, teacherId: string): Promise<string[]> {
  const { data, error } = await db
    .from('class_teachers')
    .select('class_id')
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
  if (error) {
    if (!/class_teachers/.test(error.message)) console.warn('[class-access] co-teacher lookup failed:', error.message)
    return []
  }
  return (data ?? []).map((r: { class_id: string }) => r.class_id)
}

// Every live class this teacher owns or co-teaches.
export async function teacherClassIds(db: Db, teacherId: string): Promise<string[]> {
  const [{ data: owned }, co] = await Promise.all([
    db.from('classes').select('id').eq('teacher_id', teacherId).is('deleted_at', null),
    coTaughtClassIds(db, teacherId),
  ])
  const ids = new Set<string>((owned ?? []).map((c: { id: string }) => c.id))
  if (co.length) {
    // Co-taught ids may point at classes since deleted — keep only live ones.
    const { data: live } = await db.from('classes').select('id').in('id', co).is('deleted_at', null)
    for (const c of (live ?? []) as { id: string }[]) ids.add(c.id)
  }
  return [...ids]
}

// The teacher's role on one class, or null when they have no access (or the
// class is gone).
export async function classRoleFor(db: Db, teacherId: string, classId: string): Promise<ClassRole | null> {
  const { data: cls } = await db
    .from('classes')
    .select('teacher_id')
    .eq('id', classId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!cls) return null
  if (cls.teacher_id === teacherId) return 'owner'
  const { data, error } = await db
    .from('class_teachers')
    .select('id')
    .eq('class_id', classId)
    .eq('teacher_id', teacherId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return null
  return data ? 'co-teacher' : null
}

export async function teacherCanAccessClass(db: Db, teacherId: string, classId: string): Promise<boolean> {
  return (await classRoleFor(db, teacherId, classId)) !== null
}

export async function teacherOwnsClass(db: Db, teacherId: string, classId: string): Promise<boolean> {
  return (await classRoleFor(db, teacherId, classId)) === 'owner'
}

// Access to a class-scoped assignment row (bridge_assignments,
// stem_sketch_assignments, …): the teacher may act on it when they can act
// on its class — not only when they personally created it.
export async function teacherCanAccessAssignment(
  db: Db,
  teacherId: string,
  table: string,
  assignmentId: string | number,
): Promise<boolean> {
  const { data: a } = await db.from(table).select('class_id').eq('id', assignmentId).maybeSingle()
  if (!a?.class_id) return false
  return teacherCanAccessClass(db, teacherId, String(a.class_id))
}

// True when the teacher owns or co-teaches at least one class the student is
// enrolled in — the gate for opening a student's saved work.
export async function teacherSharesClassWithStudent(db: Db, teacherId: string, studentId: string): Promise<boolean> {
  const classIds = await teacherClassIds(db, teacherId)
  if (!classIds.length) return false
  const { count } = await db
    .from('enrollments')
    .select('*', { count: 'exact', head: true })
    .eq('student_id', studentId)
    .in('class_id', classIds)
    .is('deleted_at', null)
  return (count ?? 0) > 0
}
