import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'
import { adminDb } from '@/lib/db.server'
import { csvToRoster, CSV_TEMPLATE } from '@/lib/roster/csv'
import { applyRoster } from '@/lib/roster/import.server'

// POST /api/admin/districts/[id]/roster/csv
// { csv: string, dryRun?: boolean, schoolId?: string }
//
// CSV roster upload for one district. dryRun=true validates and reports what
// WOULD happen (no writes) — the console always dry-runs first and shows the
// preview before the admin confirms the real import.
//
// The importer runs on the service role, so the tenant scope is enforced
// explicitly here: a district_admin may only import into their own district.
// Every run (including dry runs) is recorded in roster_imports and the real
// runs are audit-logged.
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id: districtId } = await params

  if (ctx.role === 'district_admin' && ctx.districtId !== districtId) {
    return NextResponse.json({ error: 'District not found' }, { status: 404 })
  }
  const { data: district } = await adminDb().from('districts').select('id')
    .eq('id', districtId).is('deleted_at', null).maybeSingle()
  if (!district) return NextResponse.json({ error: 'District not found' }, { status: 404 })

  const body = await req.json().catch(() => null)
  const csv = typeof body?.csv === 'string' ? body.csv : ''
  const dryRun = body?.dryRun !== false // default to the safe path
  const schoolId = typeof body?.schoolId === 'string' && body.schoolId ? body.schoolId : null
  if (!csv.trim()) return NextResponse.json({ error: 'No CSV content received' }, { status: 400 })
  if (csv.length > 2_000_000) return NextResponse.json({ error: 'File too large (2 MB max)' }, { status: 413 })

  if (schoolId) {
    const { data: school } = await ctx.db.from('schools').select('id')
      .eq('id', schoolId).eq('district_id', districtId).is('deleted_at', null).maybeSingle()
    if (!school) return NextResponse.json({ error: 'School not found in this district' }, { status: 404 })
  }

  const data = csvToRoster(csv)
  const summary = await applyRoster({
    db: adminDb(),
    districtId,
    defaultSchoolId: schoolId,
    data,
    dryRun,
  })

  // Parse-level errors join the report so the admin sees every bad row.
  for (const e of data.parseErrors) {
    summary.counts.errors++
    summary.results.push({ kind: 'student', key: `row:${e.row ?? '?'}`, label: `Row ${e.row ?? '?'}`, action: 'error', message: e.message, row: e.row })
  }

  await adminDb().from('roster_imports').insert({
    district_id: districtId,
    school_id: schoolId,
    actor_id: ctx.userId,
    provider: 'csv',
    dry_run: dryRun,
    counts: summary.counts,
    // Credentials are NEVER persisted — they are returned to the admin once.
    report: summary.results,
  })

  if (!dryRun) {
    await ctx.audit({
      action: 'roster.import', targetType: 'district', targetId: districtId, districtId,
      metadata: { provider: 'csv', ...summary.counts },
    })
  }

  return NextResponse.json(summary)
}

// GET /api/admin/districts/[id]/roster/csv → the CSV template (download link).
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx
  const { id: districtId } = await params
  if (ctx.role === 'district_admin' && ctx.districtId !== districtId) {
    return NextResponse.json({ error: 'District not found' }, { status: 404 })
  }
  return new NextResponse(CSV_TEMPLATE, {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': 'attachment; filename="stembuilder-roster-template.csv"',
    },
  })
}
