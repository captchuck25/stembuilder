import { NextRequest, NextResponse } from 'next/server'
import { SignJWT } from 'jose'
import { requireAdmin, isGuardError } from '@/lib/admin-guard.server'
import { GOOGLE_CLASSROOM_SCOPES, googleClassroomClientId } from '@/lib/roster/google'

// GET /api/admin/roster/google/connect?districtId=…
// Starts the Google Classroom OAuth flow. The redirect URI is a FIXED path
// (Google requires exact registration), so the district travels in a short-
// lived signed state token — never trusted from the raw query on return.
export async function GET(req: NextRequest) {
  const ctx = await requireAdmin()
  if (isGuardError(ctx)) return ctx

  const districtId = new URL(req.url).searchParams.get('districtId') ?? ''
  if (!districtId) return NextResponse.json({ error: 'districtId required' }, { status: 400 })
  if (ctx.role === 'district_admin' && ctx.districtId !== districtId) {
    return NextResponse.json({ error: 'District not found' }, { status: 404 })
  }

  const clientId = googleClassroomClientId()
  if (!clientId) {
    return NextResponse.json(
      { error: 'Google Classroom is not configured yet — see docs/google-classroom-setup.md' },
      { status: 503 },
    )
  }

  const state = await new SignJWT({ districtId, uid: ctx.userId })
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
  url.searchParams.set('access_type', 'online') // one-hour token; reconnect to re-sync later
  url.searchParams.set('prompt', 'select_account')

  return NextResponse.redirect(url)
}
