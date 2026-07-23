import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// PATCH /api/admin/schools/[id]  { name } — rename, within RLS scope.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const body = await req.json().catch(() => null)
  const name = typeof body?.name === 'string' ? body.name.trim() : ''
  if (!name) return NextResponse.json({ error: 'School name is required' }, { status: 400 })

  // RLS: a foreign school is simply not visible → 404, never a data leak.
  const { data, error } = await ctx.db.from('schools').update({ name })
    .eq('id', id).is('deleted_at', null)
    .select('id, district_id, name').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  await ctx.audit({ action: 'school.update', targetType: 'school', targetId: id, districtId: data.district_id, metadata: { name } })
  return NextResponse.json(data)
}

// DELETE /api/admin/schools/[id] — soft delete (30-day window). Members keep
// their accounts; their school_id pointer is cleared so nothing dangles.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const { data, error } = await ctx.db.from('schools')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).is('deleted_at', null)
    .select('id, district_id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'School not found' }, { status: 404 })

  // Detach members from the tombstoned school (they stay in the district).
  await ctx.db.from('profiles').update({ school_id: null }).eq('school_id', id)

  await ctx.audit({ action: 'school.delete', targetType: 'school', targetId: id, districtId: data.district_id })
  return NextResponse.json({ ok: true })
}
