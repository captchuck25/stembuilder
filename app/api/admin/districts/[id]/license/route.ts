import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'
import { licenseSummary, effectiveStatus, type LicenseRow } from '@/lib/license.server'

// PUT /api/admin/districts/[id]/license
// { type: 'trial'|'paid', seats?: number|null, startsAt?: iso, endsAt?: iso|null }
// Platform admin only — a district can never set its own license terms.
// Upserts the district's single current license (latest row wins everywhere).
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin({ platform: true })
  if (isGuardError(ctx)) return ctx
  const { id } = await params

  const body = await req.json().catch(() => null)
  const type = body?.type
  if (type !== 'trial' && type !== 'paid') {
    return NextResponse.json({ error: "type must be 'trial' or 'paid'" }, { status: 400 })
  }
  const seats = body.seats == null ? null : Number(body.seats)
  if (seats !== null && (!Number.isInteger(seats) || seats < 1)) {
    return NextResponse.json({ error: 'seats must be a positive integer or null (unlimited)' }, { status: 400 })
  }
  const startsAt = body.startsAt ? new Date(body.startsAt) : new Date()
  const endsAt = body.endsAt ? new Date(body.endsAt) : null
  if (isNaN(startsAt.getTime()) || (endsAt && isNaN(endsAt.getTime()))) {
    return NextResponse.json({ error: 'Invalid startsAt/endsAt date' }, { status: 400 })
  }
  if (endsAt && endsAt <= startsAt) {
    return NextResponse.json({ error: 'endsAt must be after startsAt' }, { status: 400 })
  }

  // Verify the district exists (RLS: platform admin sees all).
  const { data: district } = await ctx.db.from('districts').select('id')
    .eq('id', id).is('deleted_at', null).maybeSingle()
  if (!district) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  const row = {
    district_id: id,
    type,
    seats,
    starts_at: startsAt.toISOString(),
    ends_at: endsAt ? endsAt.toISOString() : null,
    status: effectiveStatus(endsAt ? endsAt.toISOString() : null),
  }

  // Latest-row-wins model: update the newest license if one exists, else insert.
  const { data: existing } = await ctx.db.from('licenses').select('id')
    .eq('district_id', id).order('created_at', { ascending: false }).limit(1).maybeSingle()

  const result = existing
    ? await ctx.db.from('licenses').update(row).eq('id', existing.id)
        .select('type, seats, starts_at, ends_at, status').single()
    : await ctx.db.from('licenses').insert(row)
        .select('type, seats, starts_at, ends_at, status').single()
  if (result.error) return NextResponse.json({ error: result.error.message }, { status: 500 })

  await ctx.audit({
    action: existing ? 'license.update' : 'license.create',
    targetType: 'license', targetId: id, districtId: id,
    metadata: { type, seats, endsAt: row.ends_at },
  })
  return NextResponse.json(licenseSummary(result.data as LicenseRow, 0))
}
