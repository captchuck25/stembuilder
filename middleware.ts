import { auth } from '@/auth'
import { NextResponse } from 'next/server'

// /admin/invite is deliberately NOT protected: invite acceptance happens
// before the recipient has an account. Everything else under /admin requires
// a session here, and the real role/scope gate is server-side in
// lib/admin-guard.server.ts on every API call.
const protectedRoutes = ['/dashboard', '/mywork', '/onboarding', '/teachers', '/student', '/admin']

export default auth((req) => {
  const path = req.nextUrl.pathname
  const isProtected = protectedRoutes.some(r => path.startsWith(r)) && !path.startsWith('/admin/invite')
  if (isProtected && !req.auth) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }
  // Authenticated via Google but no profile yet: every protected page funnels
  // to onboarding until they pick a role and path (which creates the profile).
  if (isProtected && req.auth?.user?.needsOnboarding && !req.nextUrl.pathname.startsWith('/onboarding')) {
    return NextResponse.redirect(new URL('/onboarding', req.url))
  }
})

export const config = {
  matcher: ['/dashboard(.*)', '/mywork(.*)', '/onboarding(.*)', '/teachers(.*)', '/student(.*)', '/admin(.*)'],
}