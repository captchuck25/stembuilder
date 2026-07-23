import { NextResponse } from 'next/server'
import type { SupabaseClient } from '@supabase/supabase-js'
import { auth } from '@/auth'
import { adminDb } from './db.server'
import { tenantDb } from './tenant-db.server'
import { isAdmin, isAnyAdmin } from './roles'
import { writeAudit, type AuditEntry } from './audit.server'

// Shared server guard for every /api/admin route (and admin server pages).
//
// On EVERY request it re-reads the caller's profile row — role and district
// scope come from the database, never from the session cookie alone and never
// from client input. It then hands back a tenant-scoped Supabase client whose
// RLS claims match that fresh DB state, so app code and the RLS layer can
// never disagree about who is asking.
//
// Gates, in order:
//   1. signed in, with a live (not soft-deleted) profile
//   2. role is district_admin or admin in the DB (rank-gated; platform-only
//      surfaces pass { platform: true })
//   3. verified email — admins must have a verified address (Google sign-in
//      counts: Google verified it) before any admin surface loads
//   4. district_admin must actually have a district scope

export interface AdminContext {
  userId: string
  role: 'admin' | 'district_admin'
  /** The admin's tenant scope. null = platform admin (all districts). */
  districtId: string | null
  /** Tenant-scoped client — RLS enforces district isolation on every query. */
  db: SupabaseClient
  /** Convenience audit writer with actor fields pre-filled. */
  audit: (entry: Omit<AuditEntry, 'actorId' | 'actorRole'>) => Promise<void>
}

function forbidden(message: string) {
  return NextResponse.json({ error: message }, { status: 403 })
}

export async function requireAdmin(
  opts: { platform?: boolean } = {}
): Promise<AdminContext | NextResponse> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  // Fresh, authoritative role + scope straight from the DB.
  const { data: profile, error } = await adminDb()
    .from('profiles')
    .select('id, role, district_id, email_verified_at, google_id')
    .eq('id', userId)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Profile lookup failed' }, { status: 500 })
  if (!profile) return forbidden('Forbidden')

  if (!isAnyAdmin(profile.role)) return forbidden('Forbidden')
  if (opts.platform && !isAdmin(profile.role)) return forbidden('Requires platform admin')

  if (!profile.email_verified_at && !profile.google_id) {
    return forbidden('Admin access requires a verified email address')
  }

  const role = profile.role as 'admin' | 'district_admin'
  const districtId: string | null = role === 'district_admin' ? profile.district_id : null
  if (role === 'district_admin' && !districtId) {
    return forbidden('District admin account has no district assigned')
  }

  const db = await tenantDb({ userId, role, districtId })
  return {
    userId,
    role,
    districtId,
    db,
    audit: (entry) => writeAudit({ ...entry, actorId: userId, actorRole: role }),
  }
}

// Type guard so routes read cleanly:
//   const ctx = await requireAdmin()
//   if (isGuardError(ctx)) return ctx
export function isGuardError(ctx: AdminContext | NextResponse): ctx is NextResponse {
  return ctx instanceof NextResponse
}
