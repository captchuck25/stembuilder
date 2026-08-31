import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import {
  computeAutoTiers, resolveAssignmentBrief, resolveGradingRubric, rubricForDeliverables,
} from '@/app/tools/blueprint-lab/engine/gradingRubric'
import type { Level, Project } from '@/app/tools/blueprint-lab/engine/types'

// POST /api/blueprint-assignments/<id>/submit   { docJson }
// Student submits (or RE-submits after a teacher return): upserts the one
// active submission row for (assignment, student) with a FROZEN doc snapshot
// and engine-computed auto tiers. Teacher draft scores survive resubmission.
//
// GET /api/blueprint-assignments/<id>/submit
// The student's own submission (full row incl. doc) — drives the locked
// read-only state and the "view submitted version" experience.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json().catch(() => null)
  const doc = body?.docJson as Project | undefined
  if (!doc || !Array.isArray(doc.levels)) return NextResponse.json({ error: 'Missing docJson' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db
    .from('blueprint_assignments')
    .select('id, class_id, teacher_id, title, brief_id, config, status')
    .eq('id', id)
    .maybeSingle()
  if (!a) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // Must be enrolled in the class (the owning teacher may also submit — that
  // covers teacher-preview test submissions).
  if (a.teacher_id !== session.user.id) {
    const { data: enrollment } = await db
      .from('enrollments')
      .select('student_id')
      .eq('class_id', a.class_id)
      .eq('student_id', session.user.id)
      .is('deleted_at', null)
      .maybeSingle()
    if (!enrollment) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Engine-suggested tiers, frozen alongside the doc.
  const level: Level | undefined = doc.levels.find(l => l.id === doc.activeLevelId) ?? doc.levels[0]
  const brief = resolveAssignmentBrief(a.brief_id, a.title, a.config)
  const rubric = rubricForDeliverables(resolveGradingRubric(a.config), brief.deliverables)
  const autoTiers = level ? computeAutoTiers(level, brief, rubric) : {}

  const { data: existing } = await db
    .from('blueprint_submissions')
    .select('id, teacher_scores')
    .eq('assignment_id', id)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()

  const now = new Date().toISOString()
  if (existing) {
    const { error } = await db
      .from('blueprint_submissions')
      .update({
        doc_json: doc,
        auto_tiers: autoTiers,
        status: 'submitted',
        submitted_at: now,
        updated_at: now,
        // teacher_scores intentionally untouched — draft feedback survives.
      })
      .eq('id', existing.id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, id: existing.id, status: 'submitted' })
  }

  const { data, error } = await db
    .from('blueprint_submissions')
    .insert({
      assignment_id: id,
      student_id: session.user.id,
      doc_json: doc,
      auto_tiers: autoTiers,
      status: 'submitted',
      submitted_at: now,
      updated_at: now,
    })
    .select('id')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, id: data?.id, status: 'submitted' })
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const { data } = await adminDb()
    .from('blueprint_submissions')
    .select('id, status, doc_json, auto_tiers, teacher_scores, grade_total, submitted_at')
    .eq('assignment_id', id)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()

  return NextResponse.json({ submission: data ?? null })
}
