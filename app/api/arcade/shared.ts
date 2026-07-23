// Shared access helpers for the Class Arcade API.
// A user "belongs to" a class if they are a live-enrolled student in it,
// the teacher who owns it, or an admin (admins may access any class).

import { adminDb } from '@/lib/db.server';

type Db = ReturnType<typeof adminDb>;
type Role = 'teacher' | 'student' | 'admin' | 'district_admin';

export async function classIdsFor(db: Db, userId: string, role: Role): Promise<string[]> {
  if (role !== 'student') {
    const { data } = await db
      .from('classes')
      .select('id')
      .eq('teacher_id', userId)
      .is('deleted_at', null);
    return (data ?? []).map((c: { id: string }) => String(c.id));
  }
  const { data } = await db
    .from('enrollments')
    .select('class_id')
    .eq('student_id', userId)
    .is('deleted_at', null);
  return (data ?? []).map((e: { class_id: string }) => String(e.class_id));
}

export async function canAccessClass(db: Db, userId: string, role: Role, classId: string): Promise<boolean> {
  if (role === 'admin' || role === 'district_admin') return true;
  const ids = await classIdsFor(db, userId, role);
  return ids.includes(String(classId));
}

/** Of the given class ids, which have their Class Arcade locked by the teacher
 *  (lesson_locks row: tool 'arcade-lab', level_idx 2, challenge_idx -1). */
export async function closedArcadeClassIds(db: Db, classIds: string[]): Promise<Set<string>> {
  if (classIds.length === 0) return new Set();
  const { data } = await db
    .from('lesson_locks')
    .select('class_id')
    .eq('tool', 'arcade-lab')
    .eq('level_idx', 2)
    .eq('challenge_idx', -1)
    .in('class_id', classIds);
  return new Set((data ?? []).map((r: { class_id: string }) => String(r.class_id)));
}

/** Look up display names for a set of profile ids → { id: name } */
export async function nameMap(db: Db, ids: string[]): Promise<Record<string, string>> {
  if (ids.length === 0) return {};
  const { data } = await db
    .from('profiles')
    .select('id, name, username')
    .in('id', [...new Set(ids)]);
  const map: Record<string, string> = {};
  for (const p of data ?? []) map[p.id] = p.name || p.username || 'Student';
  return map;
}
