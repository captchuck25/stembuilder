import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'
import { adminDb } from '@/lib/db.server'
import { licenseSummary, type LicenseRow } from '@/lib/license.server'

// GET /api/admin/districts/[id]
// Full drill-down payload for one district: schools (with counts), teachers,
// license summary, district admins, headline counts. A district_admin calling
// this for a FOREIGN id gets 404 — the RLS layer simply returns no row.
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const { data: district, error } = await ctx.db
    .from('districts')
    .select('id, name, state, created_at')
    .eq('id', id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!district) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  const [schoolsRes, teachersRes, adminsRes, licenseRes, studentCountRes, classCountRes] = await Promise.all([
    ctx.db.from('schools').select('id, name, created_at')
      .eq('district_id', id).is('deleted_at', null).order('name'),
    ctx.db.from('profiles').select('id, name, email, school_id, created_at')
      .eq('district_id', id).eq('role', 'teacher').is('deleted_at', null).order('name'),
    ctx.db.from('profiles').select('id, name, email, created_at')
      .eq('district_id', id).eq('role', 'district_admin').is('deleted_at', null).order('name'),
    ctx.db.from('licenses').select('type, seats, starts_at, ends_at, status')
      .eq('district_id', id).order('created_at', { ascending: false }).limit(1),
    ctx.db.from('profiles').select('*', { count: 'exact', head: true })
      .eq('district_id', id).eq('role', 'student').is('deleted_at', null),
    ctx.db.from('classes').select('*', { count: 'exact', head: true })
      .eq('district_id', id).is('deleted_at', null),
  ])

  const schools = schoolsRes.data ?? []
  const studentCount = studentCountRes.count ?? 0

  // Per-school counts.
  const schoolRows = await Promise.all(schools.map(async s => {
    const [t, st] = await Promise.all([
      ctx.db.from('profiles').select('*', { count: 'exact', head: true })
        .eq('school_id', s.id).eq('role', 'teacher').is('deleted_at', null),
      ctx.db.from('profiles').select('*', { count: 'exact', head: true })
        .eq('school_id', s.id).eq('role', 'student').is('deleted_at', null),
    ])
    return { ...s, teacherCount: t.count ?? 0, studentCount: st.count ?? 0 }
  }))

  // Pending invites are service-role-only data; show them to admins of this
  // district (both tiers see who has been invited).
  const { data: invites } = await adminDb()
    .from('district_admin_invites')
    .select('id, email, expires_at, created_at')
    .eq('district_id', id)
    .is('used_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })

  return NextResponse.json({
    ...district,
    schools: schoolRows,
    teachers: teachersRes.data ?? [],
    admins: adminsRes.data ?? [],
    pendingInvites: invites ?? [],
    license: licenseSummary((licenseRes.data?.[0] as LicenseRow | undefined) ?? null, studentCount),
    counts: {
      schools: schools.length,
      teachers: (teachersRes.data ?? []).length,
      students: studentCount,
      classes: classCountRes.count ?? 0,
    },
  })
}

// PATCH /api/admin/districts/[id]  { name?, state? } — platform admin only.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin({ platform: true })
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const body = await req.json().catch(() => null)
  const update: { name?: string; state?: string | null } = {}
  if (typeof body?.name === 'string' && body.name.trim()) update.name = body.name.trim()
  if ('state' in (body ?? {})) update.state = typeof body.state === 'string' ? body.state.trim() || null : null
  if (Object.keys(update).length === 0) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await ctx.db.from('districts').update(update)
    .eq('id', id).is('deleted_at', null).select('id, name, state').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  await ctx.audit({ action: 'district.update', targetType: 'district', targetId: id, districtId: id, metadata: update })
  return NextResponse.json(data)
}

// DELETE /api/admin/districts/[id] — platform admin only. Soft delete
// (30-day window, consistent with the retention system). Member accounts are
// NOT deleted — they lose org linkage semantics only when purged; actual
// account deletion stays an explicit per-user action.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin({ platform: true })
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const { data, error } = await ctx.db.from('districts')
    .update({ deleted_at: new Date().toISOString() })
    .eq('id', id).is('deleted_at', null).select('id').maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  if (!data) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  await ctx.audit({ action: 'district.delete', targetType: 'district', targetId: id, districtId: id })
  return NextResponse.json({ ok: true })
}
