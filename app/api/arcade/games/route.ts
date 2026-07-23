import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adminDb } from '@/lib/db.server';
import { classIdsFor, canAccessClass, closedArcadeClassIds, nameMap } from '../shared';
import { validDims } from '@/app/tools/arcade-lab/engine/types';
import { sanitizeBot } from '@/app/tools/arcade-lab/engine/bot';

// GET /api/arcade/games — all published games in the caller's classes,
// with creator names, play counts, the record run, and the caller's best.
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const db = adminDb();
  const role = session.user.role ?? 'student';
  let classIds = await classIdsFor(db, session.user.id, role);
  if (classIds.length === 0) return NextResponse.json({ games: [], role });

  // Students only see arcades their teacher hasn't locked
  let closed = false;
  if (role === 'student') {
    const closedIds = await closedArcadeClassIds(db, classIds);
    classIds = classIds.filter(id => !closedIds.has(id));
    closed = classIds.length === 0;
  }
  if (classIds.length === 0) return NextResponse.json({ games: [], role, closed });

  const { data: games } = await db
    .from('arcade_games')
    .select('id, owner_id, class_id, title, bot, plays, updated_at')
    .in('class_id', classIds)
    .order('updated_at', { ascending: false });

  if (!games?.length) return NextResponse.json({ games: [], role, closed: false });

  const gameIds = games.map((g: { id: string }) => g.id);
  const { data: runs } = await db
    .from('arcade_runs')
    .select('game_id, player_id, best_ms')
    .in('game_id', gameIds);

  const names = await nameMap(db, [
    ...games.map((g: { owner_id: string }) => g.owner_id),
    ...(runs ?? []).map((r: { player_id: string }) => r.player_id),
  ]);

  type RunRow = { game_id: string; player_id: string; best_ms: number };
  const allRuns = (runs ?? []) as RunRow[];

  const result = games.map((g: { id: string; owner_id: string; class_id: string; title: string; bot: unknown; plays: number; updated_at: string }) => {
    const gameRuns = allRuns.filter(r => r.game_id === g.id);
    let record: RunRow | null = null;
    for (const r of gameRuns) if (!record || r.best_ms < record.best_ms) record = r;
    const mine = gameRuns.find(r => r.player_id === session.user.id) ?? null;
    return {
      id: g.id,
      title: g.title,
      classId: g.class_id,
      plays: g.plays,
      updatedAt: g.updated_at,
      bot: g.bot ?? null,
      ownerId: g.owner_id,
      ownerName: names[g.owner_id] ?? 'Student',
      record: record ? { ms: record.best_ms, name: names[record.player_id] ?? 'Student' } : null,
      myBestMs: mine?.best_ms ?? null,
    };
  });

  return NextResponse.json({ games: result, role });
}

// POST /api/arcade/games — publish (or republish) the caller's game.
// Republishing replaces the level and clears its leaderboard.
export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await req.json();
  const data = body?.data;
  const title = String(body?.title ?? '').trim().slice(0, 60) || 'My Arcade Game';

  if (!data || !Array.isArray(data.objects) || !validDims(data.cols, data.rows) ||
      typeof data.scripts !== 'object' || data.objects.length > 4000) {
    return NextResponse.json({ error: 'Invalid game data' }, { status: 400 });
  }

  const db = adminDb();
  const role = session.user.role ?? 'student';
  const classIds = await classIdsFor(db, session.user.id, role);
  if (classIds.length === 0) {
    return NextResponse.json({ error: 'not_enrolled', message: 'Join a class to publish to its arcade.' }, { status: 412 });
  }
  const classId = classIds.includes(String(body?.classId)) ? String(body.classId) : classIds[0];

  // Teacher lock: students can't publish while the class arcade is closed
  if (role === 'student') {
    const closedIds = await closedArcadeClassIds(db, [classId]);
    if (closedIds.has(classId)) {
      return NextResponse.json({ error: 'arcade_closed', message: 'Your teacher has closed the Class Arcade right now.' }, { status: 403 });
    }
  }

  // Certified beatable: the author must have beaten this save slot's level
  const slot = Number.isInteger(body?.slot) && body.slot >= 0 && body.slot < 6 ? body.slot : 0;
  const { data: beaten } = await db
    .from('user_progress')
    .select('completed')
    .eq('user_id', session.user.id)
    .eq('tool', 'arcade-lab')
    .eq('level_idx', 0)
    .eq('challenge_idx', slot)
    .maybeSingle();
  if (!beaten?.completed) {
    return NextResponse.json({ error: 'not_beaten', message: 'Beat your own level in ▶ Play before publishing — every arcade game must be winnable!' }, { status: 412 });
  }

  const bot = sanitizeBot(body?.bot) ?? null;

  const { data: game, error } = await db
    .from('arcade_games')
    .upsert(
      {
        owner_id: session.user.id,
        class_id: classId,
        title,
        data,
        bot,
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'owner_id,class_id' },
    )
    .select('id')
    .single();
  if (error || !game) return NextResponse.json({ error: error?.message ?? 'Publish failed' }, { status: 500 });

  // Fresh level → fresh leaderboard
  await db.from('arcade_runs').delete().eq('game_id', game.id);

  return NextResponse.json({ ok: true, id: game.id });
}

// DELETE /api/arcade/games?id=... — owner unpublishes, or teacher/admin takedown.
export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const db = adminDb();
  const { data: game } = await db.from('arcade_games').select('id, owner_id, class_id').eq('id', id).single();
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const role = session.user.role ?? 'student';
  const isOwner = game.owner_id === session.user.id;
  const isTeacherOfClass = role !== 'student' &&
    (await canAccessClass(db, session.user.id, role, game.class_id));
  if (!isOwner && !isTeacherOfClass) return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { error } = await db.from('arcade_games').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
