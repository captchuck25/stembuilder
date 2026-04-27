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

  const assignedLevelIds = (assignData ?? []).map((a: { level_id: number }) => a.level_id);

  function getLevelInfo(li: number): { challengesTotal: number; quizTotal: number } {
    if (tool === 'code-lab') {
      return { challengesTotal: LEVELS[li]?.challenges.length ?? 0, quizTotal: LEVELS[li]?.quiz.length ?? 6 };
    }
    if (tool === 'block-lab') {
      return { challengesTotal: UNITS[li]?.challenges.length ?? 0, quizTotal: UNITS[li]?.quiz.length ?? 5 };
    }
    return { challengesTotal: 0, quizTotal: 0 };
  }

  // Build per-student per-level progress map from a single bulk query
  const progMap: Record<string, Record<number, { done: number; quizScore: number | null }>> = {};
  for (const row of (allProgress ?? [])) {
    if (!progMap[row.user_id]) progMap[row.user_id] = {};
    const li = row.level_idx;
    if (!progMap[row.user_id][li]) progMap[row.user_id][li] = { done: 0, quizScore: null };
    if (row.challenge_idx !== null && row.challenge_idx >= 0 && row.completed) {
      progMap[row.user_id][li].done++;
    }
    if ((row.challenge_idx === null || row.challenge_idx < 0) && row.quiz_score !== null) {
      progMap[row.user_id][li].quizScore = row.quiz_score;
    }
  }

  const students = (profiles ?? []).map((p: { id: string; name: string; email: string }) => {
    const levels: Record<number, { challengesDone: number; challengesTotal: number; quizScore: number | null; quizTotal: number }> = {};
    for (const li of assignedLevelIds) {
      const { challengesTotal, quizTotal } = getLevelInfo(li);
      const prog = progMap[p.id]?.[li];
      levels[li] = { challengesDone: prog?.done ?? 0, challengesTotal, quizScore: prog?.quizScore ?? null, quizTotal };
    }
    return { id: p.id, name: p.name, email: p.email, levels };
  });

  return NextResponse.json({ students, assignedLevelIds });
}
