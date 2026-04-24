import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adminDb } from '@/lib/db.server';

export async function POST(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { classId, tool, levelIdx, challengeIdx } = await req.json();
  const db = adminDb();

  // Verify teacher owns this class
  const { data: classData } = await db
    .from('classes').select('teacher_id').eq('id', classId).single();
  if (!classData || classData.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const { data, error } = await db
    .from('lesson_locks')
    .insert({ class_id: classId, tool, level_idx: levelIdx, challenge_idx: challengeIdx })
    .select()
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json(data);
}

export async function DELETE(req: NextRequest) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  const id = req.nextUrl.searchParams.get('id');
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 });

  const db = adminDb();

  // Verify teacher owns the class this lock belongs to
  const { data: lock } = await db.from('lesson_locks').select('class_id').eq('id', id).single();
  if (lock) {
    const { data: classData } = await db
      .from('classes').select('teacher_id').eq('id', lock.class_id).single();
    if (!classData || classData.teacher_id !== session.user.id)
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }

  const { error } = await db.from('lesson_locks').delete().eq('id', id);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
