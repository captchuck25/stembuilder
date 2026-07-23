import { SignJWT } from 'jose'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'

// Tenant-scoped Supabase client for the admin consoles.
//
// Unlike adminDb() (service role, bypasses RLS), this client presents a
// short-lived JWT signed with the project's JWT secret. PostgREST maps its
// `role: 'authenticated'` claim to the `authenticated` PG role, and the RLS
// policies from migration 0011 read the custom claims:
//
//   app_role    'admin' | 'district_admin'
//   district_id the admin's district scope ('' for platform admins)
//
// So even if a query forgets a .eq('district_id', ...) filter, Postgres
// itself refuses to return another district's rows. Claims are derived from
// the server-side session/profile (lib/admin-guard.server.ts) — never from
// request input.
//
// Env: SUPABASE_JWT_SECRET is the project's JWT secret
// (Supabase dashboard → Settings → API → JWT Settings).

export interface TenantClaims {
  userId: string
  role: 'admin' | 'district_admin'
  districtId: string | null // null only for platform admins
}

export async function tenantDb(claims: TenantClaims): Promise<SupabaseClient> {
  const secret = process.env.SUPABASE_JWT_SECRET
  if (!secret) throw new Error('SUPABASE_JWT_SECRET is not set — required for admin tenant queries')

  const jwt = await new SignJWT({
    role: 'authenticated',
    aud: 'authenticated',
    app_role: claims.role,
    district_id: claims.districtId ?? '',
  })
    .setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setSubject(claims.userId)
    .setIssuedAt()
    .setExpirationTime('2m') // one request's worth of life
    .sign(new TextEncoder().encode(secret))

  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      global: { headers: { Authorization: `Bearer ${jwt}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    }
  )
}
