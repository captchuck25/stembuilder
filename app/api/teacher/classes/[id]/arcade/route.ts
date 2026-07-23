import { roleAtLeast } from '@/lib/roles';
import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adminDb } from '@/lib/db.server';
import { ARCADE_MISSIONS, ARCADE_QUIZ } from '@/app/tools/arcade-lab/unit';

// GET /api/teacher/classes/:id/arcade
// Per-student Arcade Lab progress (missions / quiz / certification / free build)
// plus every game published to this class's arcade.
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: classId } = await params;
  const db = adminDb();

  const { data: classData } = await db
    .from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single();
  if (!classData || classData.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: enrollData } = await db
    .from('enrollments').select('student_id').eq('class_id', classId).is('deleted_at', null);
  const studentIds = (enrollData ?? []).map((e: { student_id: string }) => e.student_id);

  const [{ data: profiles }, { data: progress }, { data: games }] = await Promise.all([
    studentIds.length
      ? db.from('profiles').select('id, name, email, username').in('id', studentIds).is('deleted_at', null).order('name')
      : Promise.resolve({ data: [] }),
    studentIds.length
      ? db.from('user_progress')
          .select('user_id, level_idx, challenge_idx, completed, quiz_score')
          .eq('tool', 'arcade-lab')
          .in('user_id', studentIds)
          .is('deleted_at', null)
      : Promise.resolve({ data: [] }),
    db.from('arcade_games')
      .select('id, owner_id, title, bot, plays, updated_at')
      .eq('class_id', classId)
      .order('updated_at', { ascending: false }),
  ]);

  const gameIds = (games ?? []).map((g: { id: string }) => g.id);
  const { data: runs } = gameIds.length
    ? await db.from('arcade_runs').select('game_id, player_id, best_ms').in('game_id', gameIds)
    : { data: [] };

  type ProgRow = { user_id: string; level_idx: number; challenge_idx: number | null; completed: boolean; quiz_score: number | null };
  const rows = (progress ?? []) as ProgRow[];

  const students = (profiles ?? []).map((p: { id: string; name: string; email: string | null; username: string | null }) => {
    const mine = rows.filter(r => r.user_id === p.id);
    const missionsDone = mine.filter(r => r.level_idx === 1 && r.challenge_idx !== null && r.challenge_idx >= 0 && r.completed).length;
    const unitRow = mine.find(r => r.level_idx === 1 && (r.challenge_idx === null || r.challenge_idx < 0));
    const freeBuild = mine.find(r => r.level_idx === 0 && r.challenge_idx === 0);
    const game = (games ?? []).find((g: { owner_id: string }) => g.owner_id === p.id) ?? null;
    return {
      id: p.id,
      name: p.name,
      email: p.email,
      username: p.username,
      missionsDone,
      missionsTotal: ARCADE_MISSIONS.length,
      quizScore: unitRow?.quiz_score ?? null,
      quizTotal: ARCADE_QUIZ.length,
      certified: unitRow?.completed ?? false,
      freeBuildBeaten: freeBuild?.completed ?? false,
      gameId: game ? (game as { id: string }).id : null,
    };
  });

  type RunRow = { game_id: string; player_id: string; best_ms: number };
  const allRuns = (runs ?? []) as RunRow[];
  const nameOf: Record<string, string> = {};
  for (const p of profiles ?? []) nameOf[p.id] = p.name || p.username || 'Student';

  const gameList = (games ?? []).map((g: { id: string; owner_id: string; title: string; bot: unknown; plays: number; updated_at: string }) => {
    const gameRuns = allRuns.filter(r => r.game_id === g.id);
    let record: RunRow | null = null;
    for (const r of gameRuns) if (!record || r.best_ms < record.best_ms) record = r;
    return {
      id: g.id,
      title: g.title,
      bot: g.bot ?? null,
      plays: g.plays,
      updatedAt: g.updated_at,
      ownerId: g.owner_id,
      ownerName: nameOf[g.owner_id] ?? 'Student',
      runCount: gameRuns.length,
      record: record ? { ms: record.best_ms, name: nameOf[record.player_id] ?? 'Student' } : null,
    };
  });

  return NextResponse.json({ students, games: gameList });
}
