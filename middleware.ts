import { auth } from '@/auth'
import { NextResponse } from 'next/server'

const protectedRoutes = ['/dashboard', '/mywork', '/onboarding', '/teachers', '/student']

export default auth((req) => {
  const isProtected = protectedRoutes.some(r => req.nextUrl.pathname.startsWith(r))
  if (isProtected && !req.auth) {
    return NextResponse.redirect(new URL('/sign-in', req.url))
  }
})

export const config = {
  matcher: ['/dashboard(.*)', '/mywork(.*)', '/onboarding(.*)', '/teachers(.*)', '/student(.*)'],
}