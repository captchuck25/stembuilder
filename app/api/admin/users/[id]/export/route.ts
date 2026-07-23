import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/db.server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// GET /api/admin/users/[id]/export
// Data-return export: everything StemBuilder holds for one user, as JSON
// (privacy-request / end-of-trial data return). The gather runs on the
// service role AFTER an explicit tenant scope check, and the access itself
// is audited — viewing a student's data is a logged admin action.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const db = adminDb()
  const { data: profile } = await db.from('profiles')
    .select('id, name, email, username, role, account_origin, district_id, school_id, created_at')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (!profile) return NextResponse.json({ error: 'User not found' }, { status: 404 })
  if (ctx.role === 'district_admin' && profile.district_id !== ctx.districtId) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 }) // no cross-tenant existence leak
  }

  const [enrollments, progress, bridges, turtles, sketches, blueprints] = await Promise.all([
    db.from('enrollments').select('class_id, enrolled_at').eq('student_id', id).is('deleted_at', null),
    db.from('user_progress').select('tool, level_idx, challenge_idx, completed, quiz_score, saved_code, updated_at')
      .eq('user_id', id).is('deleted_at', null),
    db.from('bridge_designs').select('*').eq('user_id', id).is('deleted_at', null),
    db.from('turtle_submissions').select('*').eq('user_id', id).is('deleted_at', null),
    db.from('stem_sketch_designs').select('*').eq('user_id', id).is('deleted_at', null),
    db.from('blueprint_lab_designs').select('*').eq('user_id', id).is('deleted_at', null),
  ])

  await ctx.audit({
    action: 'user.export', targetType: 'profile', targetId: id,
    districtId: profile.district_id,
  })

  return new NextResponse(JSON.stringify({
    exportedAt: new Date().toISOString(),
    profile,
    enrollments: enrollments.data ?? [],
    progress: progress.data ?? [],
    bridgeDesigns: bridges.data ?? [],
    turtleSubmissions: turtles.data ?? [],
    stemSketchDesigns: sketches.data ?? [],
    blueprintLabDesigns: blueprints.data ?? [],
  }, null, 2), {
    headers: {
      'Content-Type': 'application/json',
      'Content-Disposition': `attachment; filename="stembuilder-export-${id}.json"`,
    },
  })
}
