import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherSharesClassWithStudent } from '@/lib/teacher-access'

// GET /api/teacher/student-work/stem-sketch?designId=X
// GET /api/teacher/student-work/stem-sketch?submissionId=X
// Returns a student's saved STEM Sketch design — or a frozen assignment
// submission — in the same { design, student } shape, so the read-only
// teacher demo view opens both without caring which it got.
// Permission: designId — the teacher must share a class with the design's
// owner; submissionId — the teacher must own the class of the submission's
// assignment.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const submissionId = req.nextUrl.searchParams.get('submissionId')
  if (submissionId) return getSubmission(session.user.id, submissionId)

  const designId = req.nextUrl.searchParams.get('designId')
  if (!designId) return NextResponse.json({ error: 'Missing designId or submissionId' }, { status: 400 })

  const db = adminDb()

  const { data: design } = await db
    .from('stem_sketch_designs')
    .select('id, user_id, name, units, doc_json, thumbnail, updated_at')
    .eq('id', designId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!design) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  if (!(await teacherSharesClassWithStudent(db, session.user.id, design.user_id)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: profile } = await db
    .from('profiles')
    .select('id, name, email')
    .eq('id', design.user_id)
    .is('deleted_at', null)
    .single()

  return NextResponse.json({
    design: {
      id: design.id,
      name: design.name,
      units: design.units,
      doc_json: design.doc_json,
      thumbnail: design.thumbnail,
      updated_at: design.updated_at,
    },
    student: profile ?? { id: design.user_id, name: '', email: '' },
  })
}

async function getSubmission(teacherId: string, submissionId: string) {
  const db = adminDb()

  const { data: sub } = await db
    .from('stem_sketch_submissions')
    .select('id, assignment_id, student_id, units, doc_json, thumbnail, passed, created_at')
    .eq('id', submissionId)
    .is('deleted_at', null)
    .maybeSingle()

  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Ownership chain: submission → assignment → teacher.
  const { data: assignment } = await db
    .from('stem_sketch_assignments')
    .select('teacher_id, title')
    .eq('id', sub.assignment_id)
    .single()
  if (!assignment || assignment.teacher_id !== teacherId)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: profile } = await db
    .from('profiles')
    .select('id, name, email')
    .eq('id', sub.student_id)
    .is('deleted_at', null)
    .single()

  return NextResponse.json({
    design: {
      id: String(sub.id),
      name: `${assignment.title} — ${sub.passed ? 'passed' : 'attempt'}`,
      units: sub.units,
      doc_json: sub.doc_json,
      thumbnail: sub.thumbnail,
      updated_at: sub.created_at,
    },
    student: profile ?? { id: sub.student_id, name: '', email: '' },
  })
}
