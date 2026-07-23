import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// GET /api/admin/districts/[id]/users?role=teacher|student&schoolId=…
// District member listing for the drill-down. Tenant client: a district_admin
// asking about a foreign district gets an empty result from RLS, surfaced as
// 404 via the district existence check.
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const url = new URL(req.url)
  const role = url.searchParams.get('role')
  const schoolId = url.searchParams.get('schoolId')
  if (role !== 'teacher' && role !== 'student') {
    return NextResponse.json({ error: 'role must be teacher or student' }, { status: 400 })
  }

  const { data: district } = await ctx.db.from('districts').select('id')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (!district) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  let query = ctx.db.from('profiles')
    .select('id, name, email, username, school_id, account_origin, created_at')
    .eq('district_id', id).eq('role', role).is('deleted_at', null)
    .order('name')
    .limit(500)
  if (schoolId) query = query.eq('school_id', schoolId)

  const { data: users, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = await Promise.all((users ?? []).map(async u => {
    if (role === 'teacher') {
      const { count } = await ctx.db.from('classes').select('*', { count: 'exact', head: true })
        .eq('teacher_id', u.id).is('deleted_at', null)
      return { ...u, classCount: count ?? 0 }
    }
    const { count } = await ctx.db.from('enrollments').select('*', { count: 'exact', head: true })
      .eq('student_id', u.id).is('deleted_at', null)
    return { ...u, enrollmentCount: count ?? 0 }
  }))

  return NextResponse.json(rows)
}
