import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { getTutorial } from '@/lib/stem-sketch/tutorials'

// GET /api/student/stem-sketch-tutorials
// Assigned tutorial sets for every enrolled class + the caller's own
// completions. No plan gate — tutorials are free; the teacher's plan gated
// the ASSIGNING, and an assigned row existing is all the student needs.
export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ classes: [], completed: [] })

  const db = adminDb()
  const { data: enrollments } = await db
    .from('enrollments')
    .select('class_id')
    .eq('student_id', session.user.id)
    .is('deleted_at', null)

  if (!enrollments?.length) return NextResponse.json({ classes: [], completed: [] })
  const classIds = enrollments.map((e: { class_id: string }) => e.class_id)

  const [{ data: rows }, { data: progress }] = await Promise.all([
    db.from('stem_sketch_tutorial_assignments')
      .select('class_id, tutorial_ids, classes(name)')
      .in('class_id', classIds),
    db.from('stem_sketch_tutorial_progress')
      .select('tutorial_id')
      .eq('user_id', session.user.id),
  ])

  const classes = (rows ?? [])
    .map((r: Record<string, unknown>) => {
      // Supabase types the relation as object-or-array depending on FK shape.
      const rel = r.classes as { name?: string } | { name?: string }[] | null
      return {
        class_id: r.class_id as string,
        class_name: (Array.isArray(rel) ? rel[0]?.name : rel?.name) ?? '',
        // Drop ids retired from the library so stale assignments can't 404.
        tutorialIds: (Array.isArray(r.tutorial_ids) ? (r.tutorial_ids as string[]) : []).filter(id => !!getTutorial(id)),
      }
    })
    .filter(r => r.tutorialIds.length > 0)

  return NextResponse.json({
    classes,
    completed: (progress ?? []).map((p: { tutorial_id: string }) => p.tutorial_id),
  })
}
