import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adminDb } from '@/lib/db.server';
import { CHALLENGES as TURTLE_CHALLENGES } from '@/app/tools/code-lab/turtle/challenges';

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
    .eq('student_id', session.user.id)
    .is('deleted_at', null);

  if (!enrollments?.length) return NextResponse.json([]);

  const classIds = enrollments.map((e: { class_id: string }) => e.class_id);
  const { data: locks } = await db
    .from('lesson_locks')
    .select('level_idx, challenge_idx')
    .eq('tool', tool)
    .in('class_id', classIds);

  if (!locks?.length) return NextResponse.json([]);

  // Build the override set — assignments explicitly grant access regardless of lock.
  // Code Lab / Block Lab use the `assignments` table indexed by level_id.
  // Turtle uses `turtle_assignments` keyed by challenge_id (string), so we have to
  // translate those to the level_idx positions used by lesson_locks.
  const assignedLevelIds = new Set<number>();
  const { data: assignments } = await db
    .from('assignments')
    .select('level_id')
    .eq('tool', tool)
    .in('class_id', classIds);
  for (const a of (assignments ?? []) as Array<{ level_id: number }>) {
    assignedLevelIds.add(a.level_id);
  }
  if (tool === 'turtle') {
    const { data: turtleAssignments } = await db
      .from('turtle_assignments')
      .select('challenge_id')
      .in('class_id', classIds);
    for (const a of (turtleAssignments ?? []) as Array<{ challenge_id: string }>) {
      const idx = TURTLE_CHALLENGES.findIndex(c => c.id === a.challenge_id);
      if (idx >= 0) assignedLevelIds.add(idx);
    }
  }

  // Deduplicate and remove locks for explicitly assigned levels
  const seen = new Set<string>();
  const unique = locks.filter((l: { level_idx: number; challenge_idx: number }) => {
    if (l.challenge_idx === -1 && assignedLevelIds.has(l.level_idx)) return false;
    const k = `${l.level_idx}:${l.challenge_idx}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });

  return NextResponse.json(unique);
}
