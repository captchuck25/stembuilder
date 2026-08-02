import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { roleAtLeast } from '@/lib/roles'

// Guard for the teacher self-serve roster routes (/api/teacher/roster/*).
// Self-serve import is a DISTRICT-PLAN feature: the teacher must belong to a
// district (profile.district_id), hold teacher rank or above, and have a
// verified email (same bar as class creation) — all read fresh from the DB.
// Freemium teachers get 403 { code: 'no_district' }, which the dashboard
// renders as the upsell teaser instead of an error.

export interface TeacherRosterContext {
  userId: string
  email: string
  districtId: string
  schoolId: string | null
  role: string
}

export async function requireDistrictTeacher(): Promise<TeacherRosterContext | NextResponse> {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Not signed in' }, { status: 401 })

  const { data: profile, error } = await adminDb()
    .from('profiles')
    .select('id, email, role, district_id, school_id, email_verified_at, google_id')
    .eq('id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (error) return NextResponse.json({ error: 'Profile lookup failed' }, { status: 500 })
  if (!profile || !roleAtLeast(profile.role, 'teacher')) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  if (!profile.district_id) {
    return NextResponse.json(
      { error: 'Roster import is part of StemBuilder for Districts', code: 'no_district' },
      { status: 403 },
    )
  }
  if (!profile.email) {
    return NextResponse.json({ error: 'Your account needs an email address for roster import' }, { status: 403 })
  }
  if (!profile.email_verified_at && !profile.google_id) {
    return NextResponse.json({ error: 'Verify your email before importing rosters', code: 'email_unverified' }, { status: 403 })
  }

  return {
    userId: profile.id,
    email: profile.email.toLowerCase(),
    districtId: profile.district_id,
    schoolId: profile.school_id ?? null,
    role: profile.role,
  }
}

export function isTeacherGuardError(ctx: TeacherRosterContext | NextResponse): ctx is NextResponse {
  return ctx instanceof NextResponse
}
