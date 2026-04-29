import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { adminDb } from '@/lib/db.server';

// GET /api/student/assignments?tool=block-lab
// Returns null  → not enrolled in any class (no restriction)
// Returns null  → enrolled but teacher hasn't configured this tool (no restriction)
// Returns number[] → teacher has set up assignments; only these level_ids are open
export async function GET(req: Request) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json(null);

  const tool = new URL(req.url).searchParams.get('tool');
  if (!tool) return NextResponse.json(null);

  const db = adminDb();
  const { data: enrollments } = await db
    .from('enrollments')
    .select('class_id')
    .eq('student_id', session.user.id);

  if (!enrollments?.length) return NextResponse.json(null);

  const classIds = enrollments.map((e: { class_id: string }) => e.class_id);
  const { data: assignments } = await db
    .from('assignments')
    .select('level_id')
    .eq('tool', tool)
    .in('class_id', classIds);

  // Teacher hasn't assigned anything → all units locked by default for enrolled students
  if (!assignments?.length) return NextResponse.json([]);

  const levelIds = [...new Set(assignments.map((a: { level_id: number }) => a.level_id))];
  return NextResponse.json(levelIds);
}
