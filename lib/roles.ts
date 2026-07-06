// Role ladder for StemBuilder.
//
// Access is gated by RANK, not string equality, so new tiers slot in without
// touching call sites. The planned hierarchy (only `admin` — the STEMbuilder.io
// platform tier — is issued today; the middle tier is reserved for the district
// rollout and can be added here + granted in the DB with no code changes elsewhere):
//
//   student (0)  →  teacher (10)  →  district_admin (50)  →  admin / platform (100)
//
// Gates should call isAdmin()/roleAtLeast() rather than comparing to a literal,
// so that a future district_admin automatically sits below the platform admin.

export type Role = 'student' | 'teacher' | 'admin'

export const ROLE_RANK: Record<string, number> = {
  student: 0,
  teacher: 10,
  district_admin: 50, // reserved — not granted yet
  admin: 100,         // STEMbuilder.io platform admin (top tier)
}

export function roleRank(role?: string | null): number {
  return ROLE_RANK[role ?? ''] ?? -1
}

// True when `role` sits at or above `min` on the ladder.
export function roleAtLeast(role: string | null | undefined, min: keyof typeof ROLE_RANK): boolean {
  return roleRank(role) >= (ROLE_RANK[min] ?? Infinity)
}

// Platform admin gate — use for everything under /admin and /api/admin.
export function isAdmin(role?: string | null): boolean {
  return roleAtLeast(role, 'admin')
}
