import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { GOOGLE_CLASSROOM_SCOPES, googleClassroomClientId } from '@/lib/roster/google'
import { requireDistrictTeacher, isTeacherGuardError } from '@/lib/roster/teacher-guard.server'

// GET /api/teacher/roster/google/connect
// Teacher self-serve Google Classroom connect (district-plan feature). Uses
// the SAME registered redirect URI as the admin flow; the signed state's
// flow marker routes the callback back to the teacher dashboard.
export async function GET(req: NextRequest) {
  const ctx = await requireDistrictTeacher()
  if (isTeacherGuardError(ctx)) return ctx

  const clientId = googleClassroomClientId()
  if (!clientId) {
    return NextResponse.json({ error: 'Google Classroom is not configured', code: 'unconfigured' }, { status: 503 })
  }

  const state = await new SignJWT({ flow: 'teacher', uid: ctx.userId })
    .setProtectedHeader({ alg: 'HS256' })
    .setIssuedAt()
    .setExpirationTime('10m')
    .sign(new TextEncoder().encode(process.env.AUTH_SECRET!))

  const origin = new URL(req.url).origin
  const url = new URL('https://accounts.google.com/o/oauth2/v2/auth')
  url.searchParams.set('client_id', clientId)
  url.searchParams.set('redirect_uri', `${origin}/api/admin/roster/google/callback`)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', GOOGLE_CLASSROOM_SCOPES)
  url.searchParams.set('state', state)
  url.searchParams.set('access_type', 'online')
  url.searchParams.set('prompt', 'select_account')

  return NextResponse.redirect(url)
}
