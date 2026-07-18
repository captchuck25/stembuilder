import { NextRequest, NextResponse } from 'next/server'
import { adminDb } from '@/lib/db.server'

// GET /api/cron/purge — fallback scheduler for the 30-day retention purge.
//
// Primary scheduling is Supabase pg_cron (db/migrations/0006). This route
// exists for projects/environments where pg_cron isn't enabled: vercel.json
// invokes it daily. Both paths call the same purge_soft_deleted() SQL
// function, which is idempotent — double-running purges nothing extra and
// each run logs per-table counts to retention_purge_log.
//
// Guarded by CRON_SECRET: Vercel sends `Authorization: Bearer <CRON_SECRET>`
// automatically on cron invocations when the env var is set.
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    return NextResponse.json({ error: 'CRON_SECRET is not configured' }, { status: 500 })
  }
  if (req.headers.get('authorization') !== `Bearer ${secret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data, error } = await adminDb().rpc('purge_soft_deleted')
  if (error) {
    console.error('[cron/purge] purge_soft_deleted failed:', error.message)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const rows = (data ?? []) as { tbl: string; purged: number }[]
  const total = rows.reduce((sum, r) => sum + Number(r.purged), 0)
  console.log(`[cron/purge] purged ${total} rows`, Object.fromEntries(rows.map(r => [r.tbl, r.purged])))
  return NextResponse.json({ ok: true, total, purged: rows })
}
