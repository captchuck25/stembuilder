import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adminDb } from '@/lib/db.server';

// GET /api/student/locks?tool=code-lab
// Returns: { level_idx, challenge_idx }[] — challenges locked in any of the student's enrolled classes.
// Returns [] if not enrolled or no locks exist (no restriction = nothing blocked).
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json([]);

  const tool = new URL(req.url).searchParams.get('tool');
  if (!tool) return NextResponse.json([]);

  const db = adminDb();
  const { data: enrollments } = await db
    .from('enrollments')
    .select('class_id')
    .eq('student_id', session.user.id);

  if (!enrollments?.length) return NextResponse.json([]);

  const classIds = enrollments.map((e: { class_id: string }) => e.class_id);
  const { data: locks } = await db
    .from('lesson_locks')
    .select('level_idx, challenge_idx')
    .eq('tool', tool)
    .in('class_id', classIds);

  if (!locks?.length) return NextResponse.json([]);

  // Deduplicate — union of all locks across all enrolled classes
  const seen = new Set<string>();
  const unique = locks.filter((l: { level_idx: number; challenge_idx: number }) => {
    const k = `${l.level_idx}:${l.challenge_idx}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return NextResponse.json(unique);
}
