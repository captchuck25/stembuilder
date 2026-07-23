import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import { SignJWT } from 'jose'
import { tenantDb } from '@/lib/tenant-db.server'

// THE cross-tenant proof: a district_admin's tenant client physically cannot
// read or write another district's rows — enforced by Postgres RLS (migration
// 0011), not app code. Runs against the live Supabase project; creates
// clearly-named throwaway rows and removes them afterwards.
//
// Requires env (loaded from .env.local): NEXT_PUBLIC_SUPABASE_URL,
// NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
// SUPABASE_JWT_SECRET. Skips (with a warning) when any is missing.
// Fails with a clear error if migration 0011 has not been applied yet.

const envReady = !!(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY &&
  process.env.SUPABASE_SERVICE_ROLE_KEY &&
  process.env.SUPABASE_JWT_SECRET
)
if (!envReady) console.warn('[rls-test] Supabase env vars missing — skipping RLS integration suite')

const TAG = `rls-test-${Date.now()}`

describe.skipIf(!envReady)('RLS tenant isolation (live Supabase)', () => {
  let svc: SupabaseClient
  let adminA: SupabaseClient   // district_admin scoped to district A
  let platform: SupabaseClient // platform admin
  let districtA: string, districtB: string
  let schoolA: string, schoolB: string
  let teacherA: string, teacherB: string
  let classB: string

  beforeAll(async () => {
    svc = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)

    const probe = await svc.from('districts').select('id').limit(1)
    if (probe.error) throw new Error(`districts table unavailable — run db/migrations/0011 first (${probe.error.message})`)

    const mk = async <T>(p: PromiseLike<{ data: T | null; error: { message: string } | null }>): Promise<T> => {
      const { data, error } = await p
      if (error || !data) throw new Error(`setup failed: ${error?.message}`)
      return data
    }

    districtA = (await mk(svc.from('districts').insert({ name: `${TAG}-A` }).select('id').single())).id
    districtB = (await mk(svc.from('districts').insert({ name: `${TAG}-B` }).select('id').single())).id
    schoolA = (await mk(svc.from('schools').insert({ district_id: districtA, name: `${TAG}-school-A` }).select('id').single())).id
    schoolB = (await mk(svc.from('schools').insert({ district_id: districtB, name: `${TAG}-school-B` }).select('id').single())).id
    await mk(svc.from('licenses').insert({ district_id: districtA, type: 'trial' }).select('id').single())
    await mk(svc.from('licenses').insert({ district_id: districtB, type: 'paid', seats: 100 }).select('id').single())
    teacherA = (await mk(svc.from('profiles').insert({
      name: `${TAG}-teacher-A`, email: `${TAG}-a@example.test`, role: 'teacher',
      district_id: districtA, school_id: schoolA,
    }).select('id').single())).id
    teacherB = (await mk(svc.from('profiles').insert({
      name: `${TAG}-teacher-B`, email: `${TAG}-b@example.test`, role: 'teacher',
      district_id: districtB, school_id: schoolB,
    }).select('id').single())).id
    classB = (await mk(svc.from('classes').insert({
      teacher_id: teacherB, name: `${TAG}-class-B`, join_code: TAG.slice(-8).toUpperCase(),
      district_id: districtB, school_id: schoolB,
    }).select('id').single())).id

    adminA = await tenantDb({ userId: `${TAG}-admin`, role: 'district_admin', districtId: districtA })
    platform = await tenantDb({ userId: `${TAG}-platform`, role: 'admin', districtId: null })
  })

  afterAll(async () => {
    if (!svc) return
    // Hard-delete throwaway rows; FK cascades cover schools/licenses.
    await svc.from('classes').delete().eq('id', classB)
    await svc.from('profiles').delete().in('id', [teacherA, teacherB].filter(Boolean))
    await svc.from('districts').delete().in('id', [districtA, districtB].filter(Boolean))
  })

  it('district_admin A can read their own district', async () => {
    const { data } = await adminA.from('districts').select('id, name').eq('id', districtA)
    expect(data).toHaveLength(1)
    expect(data![0].name).toBe(`${TAG}-A`)
  })

  it("district_admin A CANNOT read district B — not even that it exists", async () => {
    const direct = await adminA.from('districts').select('id').eq('id', districtB)
    expect(direct.data).toHaveLength(0)
    const all = await adminA.from('districts').select('id')
    expect((all.data ?? []).map(d => d.id)).not.toContain(districtB)
  })

  it("district_admin A cannot read district B's schools", async () => {
    const { data } = await adminA.from('schools').select('id').eq('district_id', districtB)
    expect(data).toHaveLength(0)
    const all = await adminA.from('schools').select('id')
    expect((all.data ?? []).map(s => s.id)).not.toContain(schoolB)
  })

  it("district_admin A cannot read district B's teachers/students", async () => {
    const { data } = await adminA.from('profiles').select('id').eq('id', teacherB)
    expect(data).toHaveLength(0)
    const own = await adminA.from('profiles').select('id').eq('id', teacherA)
    expect(own.data).toHaveLength(1)
  })

  it("district_admin A cannot read district B's license or classes (usage)", async () => {
    const lic = await adminA.from('licenses').select('id').eq('district_id', districtB)
    expect(lic.data).toHaveLength(0)
    const cls = await adminA.from('classes').select('id').eq('id', classB)
    expect(cls.data).toHaveLength(0)
  })

  it('district_admin A cannot create a school inside district B', async () => {
    const { error } = await adminA.from('schools')
      .insert({ district_id: districtB, name: `${TAG}-intruder` }).select('id').single()
    expect(error).toBeTruthy() // RLS WITH CHECK violation
  })

  it("district_admin A cannot update district B (write silently hits 0 rows)", async () => {
    const { data } = await adminA.from('districts')
      .update({ name: `${TAG}-hacked` }).eq('id', districtB).select('id')
    expect(data).toHaveLength(0)
    const check = await svc.from('districts').select('name').eq('id', districtB).single()
    expect(check.data!.name).toBe(`${TAG}-B`)
  })

  it('the tenant client cannot escalate a role — the role column is not writable at all', async () => {
    const { error } = await adminA.from('profiles')
      .update({ role: 'admin' }).eq('id', teacherA).select('id')
    expect(error).toBeTruthy() // column-level grant excludes `role`
    const check = await svc.from('profiles').select('role').eq('id', teacherA).single()
    expect(check.data!.role).toBe('teacher')
  })

  it('platform admin sees both districts', async () => {
    const { data } = await platform.from('districts').select('id').in('id', [districtA, districtB])
    expect(data).toHaveLength(2)
  })

  it('non-admin claims see nothing', async () => {
    const jwt = await new SignJWT({ role: 'authenticated', aud: 'authenticated', app_role: 'teacher', district_id: districtA })
      .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
      .setSubject(`${TAG}-teacher-claims`).setIssuedAt().setExpirationTime('2m')
      .sign(new TextEncoder().encode(process.env.SUPABASE_JWT_SECRET!))
    const teacherClient = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { global: { headers: { Authorization: `Bearer ${jwt}` } }, auth: { persistSession: false } })
    const { data } = await teacherClient.from('districts').select('id')
    expect(data ?? []).toHaveLength(0)
  })

  it('the bare anon key sees nothing', async () => {
    const anon = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!)
    const { data } = await anon.from('districts').select('id')
    expect(data ?? []).toHaveLength(0)
  })
})
