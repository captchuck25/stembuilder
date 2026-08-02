import { NextRequest, NextResponse } from 'next/server'
import { jwtVerify } from 'jose'
import { googleClassroomClientId, googleClassroomClientSecret, GC_COOKIE } from '@/lib/roster/google'

// GET /api/admin/roster/google/callback?code=…&state=…
// Exchanges the OAuth code for a one-hour access token, kept in an httpOnly
// cookie scoped to the Google roster API paths only, then returns the user to
// where they connected from. No refresh token is requested — a sync is a
// deliberate, attended action; reconnecting later takes two clicks.
//
// SHARED by both flows (Google requires exactly-registered redirect URIs, so
// there is one): the signed state says which flow this is —
//   admin   { districtId }        → cookie for /api/admin/roster/google,
//                                    back to the district's Roster tab
//   teacher { flow: 'teacher' }   → cookie for /api/teacher/roster/google,
//                                    back to the teacher dashboard
export async function GET(req: NextRequest) {
  const url = new URL(req.url)
  const code = url.searchParams.get('code')
  const state = url.searchParams.get('state') ?? ''

  let districtId: string | undefined
  let teacherFlow = false
  try {
    const { payload } = await jwtVerify(state, new TextEncoder().encode(process.env.AUTH_SECRET!))
    teacherFlow = payload.flow === 'teacher'
    districtId = payload.districtId as string | undefined
  } catch {
    return NextResponse.redirect(new URL('/admin/districts', url.origin))
  }

  const back = (qs: string) =>
    NextResponse.redirect(new URL(
      teacherFlow ? `/teachers/dashboard?${qs}` : `/admin/districts/${districtId}?${qs}`,
      url.origin))

  if (!code) return back('google=denied')

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: googleClassroomClientId()!,
      client_secret: googleClassroomClientSecret()!,
      redirect_uri: `${url.origin}/api/admin/roster/google/callback`,
      grant_type: 'authorization_code',
    }),
  })
  if (!res.ok) {
    console.error('[roster:google] token exchange failed', res.status, (await res.text()).slice(0, 300))
    return back('google=error')
  }
  const token = await res.json() as { access_token: string; expires_in?: number }

  const response = back('google=connected')
  response.cookies.set(GC_COOKIE, token.access_token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax',
    path: teacherFlow ? '/api/teacher/roster/google' : '/api/admin/roster/google',
    maxAge: Math.min(token.expires_in ?? 3600, 3600) - 60,
  })
  return response
}
