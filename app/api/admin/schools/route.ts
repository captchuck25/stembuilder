import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// POST /api/admin/schools  { districtId, name }
// Both admin tiers. RLS is the enforcement: a district_admin inserting with a
// foreign districtId violates the schools_own_district WITH CHECK and the
// insert is refused by Postgres — the guard's districtId just makes the
// common case convenient.
export async function POST(req: NextRequest) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  const districtId = ctx.role === 'district_admin' ? ctx.districtId : body?.districtId
  if (!name) return NextResponse.json({ error: 'School name is required' }, { status: 400 })
  if (!districtId) return NextResponse.json({ error: 'districtId is required' }, { status: 400 })

  const { data, error } = await ctx.db.from('schools')
    .insert({ district_id: districtId, name })
    .select('id, district_id, name, created_at')
    .single()
  if (error) {
    const status = /row-level security/i.test(error.message) ? 403 : 500
    return NextResponse.json({ error: error.message }, { status })
  }

  await ctx.audit({ action: 'school.create', targetType: 'school', targetId: data.id, districtId, metadata: { name } })
  return NextResponse.json(data, { status: 201 })
}
