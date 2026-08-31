import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { teacherSharesClassWithStudent } from '@/lib/teacher-access'

// GET /api/teacher/student-work/blueprint-lab?designId=X
// GET /api/teacher/student-work/blueprint-lab?submissionId=X
// Returns a student's saved design — or a frozen assignment submission (for
// the in-tool grading view) — in the same { design, student } shape.
// Permission: designId → teacher shares a class with the owner;
// submissionId → teacher owns the submission's assignment.
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
    .from('blueprint_lab_designs')
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
    .from('blueprint_submissions')
    .select('id, assignment_id, student_id, doc_json, status, auto_tiers, teacher_scores, grade_total, submitted_at')
    .eq('id', submissionId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!sub) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Ownership chain: submission → assignment → teacher.
  const { data: assignment } = await db
    .from('blueprint_assignments')
    .select('id, teacher_id, title, brief_id, config')
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
      name: `${assignment.title} — submission`,
      units: 'imperial',
      doc_json: sub.doc_json,
      thumbnail: null,
      updated_at: sub.submitted_at,
    },
    student: profile ?? { id: sub.student_id, name: '', email: '' },
    submission: {
      id: sub.id,
      status: sub.status,
      autoTiers: sub.auto_tiers,
      teacherScores: sub.teacher_scores,
      gradeTotal: sub.grade_total,
      submittedAt: sub.submitted_at,
    },
    assignment: {
      id: assignment.id,
      title: assignment.title,
      briefId: assignment.brief_id,
      config: assignment.config,
    },
  })
}
