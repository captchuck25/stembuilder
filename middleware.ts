import { auth } from '@/auth'
import { NextResponse } from 'next/server'

const protectedRoutes = ['/dashboard', '/mywork', '/onboarding', '/teachers', '/student']

export default auth((req) => {
  const isProtected = protectedRoutes.some(r => req.nextUrl.pathname.startsWith(r))
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
  matcher: ['/dashboard(.*)', '/mywork(.*)', '/onboarding(.*)', '/teachers(.*)', '/student(.*)'],
}