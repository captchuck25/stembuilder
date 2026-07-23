// Role ladder for StemBuilder.
//
// Access is gated by RANK, not string equality, so new tiers slot in without
// touching call sites:
//
//   student (0)  →  teacher (10)  →  district_admin (50)  →  admin / platform (100)
//
// 'admin' is the stored value for the STEMbuilder.io platform tier (the UI
// labels it "Super Admin"). 'district_admin' is scoped to exactly one district
// via profiles.district_id — see lib/admin-guard.server.ts, which resolves
// role + scope server-side on every admin request (never from client input).
//
// Gates should call isAdmin()/isAnyAdmin()/roleAtLeast() rather than comparing
// to a literal.

export type Role = 'student' | 'teacher' | 'district_admin' | 'admin'

export const ROLE_RANK: Record<string, number> = {
  student: 0,
  teacher: 10,
  district_admin: 50, // scoped to one district (profiles.district_id)
  admin: 100,         // STEMbuilder.io platform admin ("Super Admin")
}

export function roleRank(role?: string | null): number {
  return ROLE_RANK[role ?? ''] ?? -1
}

// True when `role` sits at or above `min` on the ladder.
export function roleAtLeast(role: string | null | undefined, min: keyof typeof ROLE_RANK): boolean {
  return roleRank(role) >= (ROLE_RANK[min] ?? Infinity)
}

// Platform ("super") admin gate — platform-wide surfaces: create districts,
// manage licenses, grant district admins, global search.
export function isAdmin(role?: string | null): boolean {
  return roleAtLeast(role, 'admin')
}

// Any-admin gate — surfaces both tiers share (/admin consoles). District
// admins are additionally scoped to their own district by RLS + the guard.
export function isAnyAdmin(role?: string | null): boolean {
  return roleAtLeast(role, 'district_admin')
}

// Human label for UI chips.
export function roleLabel(role?: string | null): string {
  switch (role) {
    case 'admin': return 'Super Admin'
    case 'district_admin': return 'District Admin'
    case 'teacher': return 'Teacher'
    case 'student': return 'Student'
    default: return 'Unknown'
  }
}
