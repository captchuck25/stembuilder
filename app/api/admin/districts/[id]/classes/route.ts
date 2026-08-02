import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// GET /api/admin/districts/[id]/classes
// Read-only district class overview: every class whose teacher belongs to
// the district — however it was created (teacher "+ New Class", CSV, Google).
// Admins OBSERVE classes; creating/rostering them is the teacher's job.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const { data: district } = await ctx.db.from('districts').select('id')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (!district) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  const { data: classes, error } = await ctx.db.from('classes')
    .select('id, name, join_code, teacher_id, school_id, roster_provider, created_at')
    .eq('district_id', id).is('deleted_at', null)
    .order('created_at', { ascending: false })
    .limit(500)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const teacherIds = [...new Set((classes ?? []).map(c => c.teacher_id))]
  const { data: teachers } = teacherIds.length
    ? await ctx.db.from('profiles').select('id, name').in('id', teacherIds)
    : { data: [] }
  const teacherName = new Map((teachers ?? []).map(t => [t.id, t.name]))

  const rows = await Promise.all((classes ?? []).map(async c => {
    const { count } = await ctx.db.from('enrollments')
      .select('*', { count: 'exact', head: true })
      .eq('class_id', c.id).is('deleted_at', null)
    return {
      id: c.id,
      name: c.name,
      joinCode: c.join_code,
      teacherName: teacherName.get(c.teacher_id) ?? '—',
      schoolId: c.school_id,
      source: c.roster_provider ?? 'manual',
      studentCount: count ?? 0,
      createdAt: c.created_at,
    }
  }))

  return NextResponse.json(rows)
}
