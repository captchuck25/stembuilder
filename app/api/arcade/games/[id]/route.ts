import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adminDb } from '@/lib/db.server';
import { canAccessClass, nameMap } from '../../shared';

async function loadGame(db: ReturnType<typeof adminDb>, id: string) {
  const { data } = await db
    .from('arcade_games')
    .select('id, owner_id, class_id, title, data, bot, plays')
    .eq('id', id)
    .single();
  return data;
}

async function topRuns(db: ReturnType<typeof adminDb>, gameId: string, meId: string) {
  const { data: runs } = await db
    .from('arcade_runs')
    .select('player_id, best_ms')
    .eq('game_id', gameId)
    .order('best_ms', { ascending: true })
    .limit(10);
  const names = await nameMap(db, (runs ?? []).map((r: { player_id: string }) => r.player_id));
  return (runs ?? []).map((r: { player_id: string; best_ms: number }) => ({
    name: names[r.player_id] ?? 'Student',
    ms: r.best_ms,
    mine: r.player_id === meId,
  }));
}

// GET /api/arcade/games/:id — the full game (for playing) + leaderboard.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const db = adminDb();
  const game = await loadGame(db, id);
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const role = session.user.role ?? 'student';
  if (!(await canAccessClass(db, session.user.id, role, game.class_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const names = await nameMap(db, [game.owner_id]);
  const runs = await topRuns(db, id, session.user.id);
  const { data: myRun } = await db
    .from('arcade_runs')
    .select('best_ms')
    .eq('game_id', id)
    .eq('player_id', session.user.id)
    .maybeSingle();

  return NextResponse.json({
    game: {
      id: game.id,
      title: game.title,
      data: game.data,
      bot: game.bot ?? null,
      plays: game.plays,
      ownerId: game.owner_id,
      ownerName: names[game.owner_id] ?? 'Student',
      isMine: game.owner_id === session.user.id,
      canRemove: game.owner_id === session.user.id || role !== 'student',
    },
    runs,
    myBestMs: myRun?.best_ms ?? null,
  });
}

// POST /api/arcade/games/:id — { type: 'play' } counts a play;
// { type: 'run', ms } records a finish time (kept only if it beats your best).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  const body = await req.json();
  const db = adminDb();
  const game = await loadGame(db, id);
  if (!game) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const role = session.user.role ?? 'student';
  if (!(await canAccessClass(db, session.user.id, role, game.class_id))) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  if (body?.type === 'play') {
    await db.from('arcade_games').update({ plays: (game.plays ?? 0) + 1 }).eq('id', id);
    return NextResponse.json({ ok: true });
  }

  if (body?.type === 'run') {
    const ms = Math.round(Number(body?.ms));
    if (!Number.isFinite(ms) || ms < 500 || ms > 60 * 60 * 1000) {
      return NextResponse.json({ error: 'Invalid time' }, { status: 400 });
    }
    const { data: existing } = await db
      .from('arcade_runs')
      .select('best_ms')
      .eq('game_id', id)
      .eq('player_id', session.user.id)
      .maybeSingle();

    const improved = !existing || ms < existing.best_ms;
    if (improved) {
      await db.from('arcade_runs').upsert(
        { game_id: id, player_id: session.user.id, best_ms: ms, updated_at: new Date().toISOString() },
        { onConflict: 'game_id,player_id' },
      );
    }
    const runs = await topRuns(db, id, session.user.id);
    return NextResponse.json({
      ok: true,
      improved,
      myBestMs: improved ? ms : existing?.best_ms ?? ms,
      runs,
    });
  }

  return NextResponse.json({ error: 'Unknown action' }, { status: 400 });
}
