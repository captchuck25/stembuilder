import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'

// GET /api/admin/search?q=…
// Global admin search across districts, schools, teachers, students, and
// classes. Runs entirely on the tenant client: for a district_admin, RLS
// silently narrows every arm to their own district — same route, same code.
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx

  const q = (new URL(req.url).searchParams.get('q') ?? '').trim()
  if (q.length < 2) return NextResponse.json({ error: 'Query must be at least 2 characters' }, { status: 400 })
  // Escape PostgREST ilike wildcards in user input.
  const pattern = `%${q.replace(/[%_]/g, m => '\\' + m)}%`

  const [districts, schools, people, classes] = await Promise.all([
    ctx.db.from('districts').select('id, name, state')
      .ilike('name', pattern).is('deleted_at', null).limit(10),
    ctx.db.from('schools').select('id, name, district_id')
      .ilike('name', pattern).is('deleted_at', null).limit(10),
    ctx.db.from('profiles').select('id, name, email, username, role, district_id, school_id')
      .or(`name.ilike.${pattern},email.ilike.${pattern},username.ilike.${pattern}`)
      .is('deleted_at', null).limit(20),
    ctx.db.from('classes').select('id, name, join_code, teacher_id, district_id')
      .ilike('name', pattern).is('deleted_at', null).limit(10),
  ])

  return NextResponse.json({
    districts: districts.data ?? [],
    schools: schools.data ?? [],
    users: people.data ?? [],
    classes: classes.data ?? [],
  })
}
