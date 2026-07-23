import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'
import { licenseSummary } from '@/lib/license.server'

// GET /api/admin/districts
// Lists districts with headline counts + license/trial summary.
// Platform admins see every district; a district_admin's tenant client can
// only read their own (RLS), so this same route powers both consoles.
export async function GET() {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx

  const { data: districts, error } = await ctx.db
    .from('districts')
    .select('id, name, state, created_at')
    .is('deleted_at', null)
    .order('name')
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = await Promise.all((districts ?? []).map(async d => {
    const [schools, teachers, students, licenses] = await Promise.all([
      ctx.db.from('schools').select('*', { count: 'exact', head: true })
        .eq('district_id', d.id).is('deleted_at', null),
      ctx.db.from('profiles').select('*', { count: 'exact', head: true })
        .eq('district_id', d.id).eq('role', 'teacher').is('deleted_at', null),
      ctx.db.from('profiles').select('*', { count: 'exact', head: true })
        .eq('district_id', d.id).eq('role', 'student').is('deleted_at', null),
      ctx.db.from('licenses').select('type, seats, starts_at, ends_at, status')
        .eq('district_id', d.id).order('created_at', { ascending: false }).limit(1),
    ])
    return {
      ...d,
      schoolCount: schools.count ?? 0,
      teacherCount: teachers.count ?? 0,
      studentCount: students.count ?? 0,
      license: licenseSummary(licenses.data?.[0] ?? null, students.count ?? 0),
    }
  }))

  return NextResponse.json(rows)
}

// POST /api/admin/districts  { name, state? }
// Platform admin only. Creates the district; the trial/license is attached
// separately via PUT /api/admin/districts/[id]/license.
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin({ platform: true })
  if (isGuardError(ctx)) return ctx

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const state = typeof body?.state === 'string' ? body.state.trim() || null : null
  if (!name) return NextResponse.json({ error: 'District name is required' }, { status: 400 })

  const { data: district, error } = await ctx.db
    .from('districts')
    .insert({ name, state })
    .select('id, name, state, created_at')
    .single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  await ctx.audit({ action: 'district.create', targetType: 'district', targetId: district.id, districtId: district.id, metadata: { name } })
  return NextResponse.json(district, { status: 201 })
}
