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
