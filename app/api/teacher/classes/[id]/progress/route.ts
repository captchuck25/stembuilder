import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adminDb } from '@/lib/db.server';
import { LEVELS } from '@/app/tools/code-lab/python/levels';
import { UNITS } from '@/app/tools/block-lab/units';

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { id: classId } = await params;
  const tool = req.nextUrl.searchParams.get('tool');
  if (!tool) return NextResponse.json({ error: 'Missing tool' }, { status: 400 });

  const db = adminDb();

  const { data: classData } = await db
    .from('classes').select('teacher_id').eq('id', classId).single();
  if (!classData || classData.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data: enrollData } = await db
    .from('enrollments').select('student_id').eq('class_id', classId);

  if (!enrollData?.length) return NextResponse.json({ students: [], assignedLevelIds: [] });

  const studentIds = enrollData.map((e: { student_id: string }) => e.student_id);

  // Map the frontend tool key to the actual tool name stored in user_progress
  const progressTool = tool === 'code-lab' ? 'code-lab-python' : tool;

  const [{ data: profiles }, { data: assignData }, { data: allProgress }] = await Promise.all([
    db.from('profiles').select('id, name, email').in('id', studentIds).order('name', { ascending: true }),
    db.from('assignments').select('level_id').eq('class_id', classId).eq('tool', tool).order('level_id'),
    db.from('user_progress')
      .select('user_id, level_idx, challenge_idx, completed, quiz_score')
      .eq('tool', progressTool)
      .in('user_id', studentIds),
  ]);

  const assignedLevelIds: number[] = (assignData ?? []).map((a: { level_id: number }) => a.level_id);

  function getLevelInfo(li: number): { challengesTotal: number; quizTotal: number } {
    if (tool === 'code-lab') {
      return { challengesTotal: LEVELS[li]?.challenges.length ?? 0, quizTotal: LEVELS[li]?.quiz.length ?? 6 };
    }
    if (tool === 'block-lab') {
      return { challengesTotal: UNITS[li]?.challenges.length ?? 0, quizTotal: UNITS[li]?.quiz.length ?? 5 };
    }
    return { challengesTotal: 0, quizTotal: 0 };
  }

  // Build per-student per-level progress map from a single bulk query.
  // Two kinds of rows live in user_progress for a (user, level):
  //   - per-challenge:  challenge_idx >= 0, completed=true when that challenge is done
  //   - per-level:      challenge_idx === -1 (or null); completed=true is set when the student
  //     finishes EVERY challenge in the level, and quiz_score is set when they take the quiz.
  // We count per-challenge rows for the running tally, but the per-level "completed=true"
  // row is independent evidence that ALL challenges were finished — it covers the case
  // where one per-challenge save failed silently (network blip / tab close mid-save) and
  // we'd otherwise show e.g. 9/10 even though the student really finished all 10.
  const progMap: Record<string, Record<number, { done: number; quizScore: number | null; levelMarkedComplete: boolean }>> = {};
  const activeLevelSet = new Set<number>();
  for (const row of (allProgress ?? [])) {
    if (!progMap[row.user_id]) progMap[row.user_id] = {};
    const li = row.level_idx;
    if (!progMap[row.user_id][li]) progMap[row.user_id][li] = { done: 0, quizScore: null, levelMarkedComplete: false };
    if (row.challenge_idx !== null && row.challenge_idx >= 0 && row.completed) {
      progMap[row.user_id][li].done++;
      activeLevelSet.add(li);
    }
    if (row.challenge_idx === null || row.challenge_idx < 0) {
      if (row.quiz_score !== null) {
        progMap[row.user_id][li].quizScore = row.quiz_score;
        activeLevelSet.add(li);
      }
      if (row.completed) {
        progMap[row.user_id][li].levelMarkedComplete = true;
        activeLevelSet.add(li);
      }
    }
  }

  // Visible columns = currently-assigned levels OR levels with any student activity.
  // This way, a teacher who locks a level after a deadline still sees who completed it.
  const visibleLevelIds = Array.from(new Set([...assignedLevelIds, ...activeLevelSet])).sort((a, b) => a - b);

  const students = (profiles ?? []).map((p: { id: string; name: string; email: string }) => {
    const levels: Record<number, { challengesDone: number; challengesTotal: number; quizScore: number | null; quizTotal: number }> = {};
    for (const li of visibleLevelIds) {
      const { challengesTotal, quizTotal } = getLevelInfo(li);
      const prog = progMap[p.id]?.[li];
      // If the per-level "completed" marker is present, the student finished every challenge
      // even if one of the per-challenge writes silently failed. Treat done as the max in that case.
      const done = prog?.levelMarkedComplete ? challengesTotal : (prog?.done ?? 0);
      levels[li] = { challengesDone: done, challengesTotal, quizScore: prog?.quizScore ?? null, quizTotal };
    }
    return { id: p.id, name: p.name, email: p.email, levels };
  });

  // Keep `assignedLevelIds` as the legacy field the client expects so existing UI keeps working.
  // Levels that appear in students[].levels but NOT in assignedLevelIds are "history columns":
  // students completed them while assigned, but the level has since been locked/opened.
  return NextResponse.json({ students, assignedLevelIds: visibleLevelIds, currentlyAssignedLevelIds: assignedLevelIds });
}
