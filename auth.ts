import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

declare module 'next-auth' {
  interface Session {
    user: {
      id: string
      email: string
      name: string
      // null while a first-time Google user has authenticated but not yet
      // completed onboarding (no profile row exists yet).
      role: 'teacher' | 'student' | 'district_admin' | 'admin' | null
      // District scope for district_admin (and org linkage for anyone else).
      // Sourced from profiles.district_id server-side — never client input.
      districtId?: string | null
      username?: string
      image?: string
      needsOnboarding?: boolean
      // Google account id, present so /api/onboarding/complete can attach the
      // Google identity to the profile it creates.
      googleSub?: string
    }
  }
  interface User {
    role?: 'teacher' | 'student' | 'district_admin' | 'admin' | null
    districtId?: string | null
    username?: string
  }
}

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    Google({
      clientId: process.env.AUTH_GOOGLE_ID!,
      clientSecret: process.env.AUTH_GOOGLE_SECRET!,
    }),
    Credentials({
      credentials: {
        email: { label: 'Email', type: 'email' },
        password: { label: 'Password', type: 'password' },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null
        // The "email" field is really an identifier: an email for adults, a
        // username for students who joined with a class code and have no email.
        const identifier = (credentials.email as string).toLowerCase().trim()
        const column = identifier.includes('@') ? 'email' : 'username'
        const db = adminDb()
        const { data: profile } = await db
          .from('profiles')
          .select('id, email, name, role, username, password_hash, district_id')
          .eq(column, identifier)
          .is('deleted_at', null) // soft-deleted accounts cannot sign in
          .maybeSingle()
        if (!profile?.password_hash) return null
        const valid = await bcrypt.compare(credentials.password as string, profile.password_hash)
        if (!valid) return null
        return { id: profile.id, email: profile.email ?? '', name: profile.name, role: profile.role, username: profile.username ?? undefined, districtId: profile.district_id ?? null }
      },
    }),
  ],
  callbacks: {
    async signIn({ user, account }) {
      if (account?.provider === 'google') {
        const db = adminDb()
        // Look up WITHOUT the deleted_at filter: a soft-deleted account must
        // be denied outright — filtering it out here would instead create a
        // fresh duplicate profile for the same Google identity.
        const { data: existing } = await db
          .from('profiles')
          .select('id, role, deleted_at, district_id')
          .or(`google_id.eq.${account.providerAccountId},email.eq.${user.email}`)
          .maybeSingle()

        if (existing?.deleted_at) return false

        if (existing) {
          await db.from('profiles').update({ google_id: account.providerAccountId }).eq('id', existing.id)
          user.id = existing.id
          user.role = existing.role
          user.districtId = existing.district_id ?? null
        }
        // First Google login: deliberately NO profile creation. The user is
        // authenticated but must pick a role and onboarding path first —
        // /api/onboarding/complete creates the profile (with the correct
        // account_origin / affirmation / age gate), so an abandoned onboarding
        // leaves no orphaned rows. user.role stays undefined, which the jwt
        // callback below turns into needsOnboarding.
      }
      return true
    },
    async jwt({ token, user, account, trigger }) {
      if (account?.provider === 'google') token.googleSub = account.providerAccountId

      if (user) {
        if (user.role) {
          token.id = user.id
          token.role = user.role
          token.districtId = user.districtId ?? null
          token.needsOnboarding = false
        } else {
          token.id = undefined
          token.role = null
          token.needsOnboarding = true
        }
        token.picture = user.image
        token.username = user.username
        token.authTime = Math.floor(Date.now() / 1000)
        token.revalidatedAt = Date.now()
        return token
      }

      // Onboarding just completed (client called useSession().update()):
      // adopt the freshly created profile into this session's token.
      if (trigger === 'update' && token.needsOnboarding) {
        const filters = [
          token.googleSub ? `google_id.eq.${token.googleSub}` : null,
          token.email ? `email.eq.${token.email}` : null,
        ].filter(Boolean).join(',')
        if (filters) {
          const { data: profile } = await adminDb()
            .from('profiles')
            .select('id, role, username, district_id')
            .or(filters)
            .is('deleted_at', null)
            .maybeSingle()
          if (profile) {
            token.id = profile.id
            token.role = profile.role
            token.districtId = profile.district_id ?? null
            token.username = profile.username ?? undefined
            token.needsOnboarding = false
            token.authTime = Math.floor(Date.now() / 1000)
            token.revalidatedAt = Date.now()
          }
        }
        return token
      }

      // Sessions are stateless JWTs, so a password reset can't delete them.
      // Instead, every REVALIDATE_MS we re-check the profile and reject the
      // token if the account was soft-deleted or the password changed after
      // this session was issued (see migration 0007). Returning null signs
      // the user out; staleness is bounded by the re-check interval.
      // The same re-check refreshes role + district scope, so granting or
      // REVOKING admin/district_admin takes effect within REVALIDATE_MS
      // without requiring the user to sign out.
      const REVALIDATE_MS = 5 * 60 * 1000
      const last = (token.revalidatedAt as number | undefined) ?? 0
      if (Date.now() - last > REVALIDATE_MS && token.id) {
        const { data: profile, error } = await adminDb()
          .from('profiles')
          .select('deleted_at, password_changed_at, role, district_id')
          .eq('id', token.id as string)
          .maybeSingle()
        // On a transient DB error keep the session; only reject on a
        // definitive answer (row gone, deleted, or password changed).
        if (!error) {
          if (!profile || profile.deleted_at) return null
          if (profile.password_changed_at) {
            const changedAt = Math.floor(new Date(profile.password_changed_at).getTime() / 1000)
            if (changedAt > ((token.authTime as number | undefined) ?? 0)) return null
          }
          token.role = profile.role
          token.districtId = profile.district_id ?? null
          token.revalidatedAt = Date.now()
        }
      }
      return token
    },
    async session({ session, token }) {
      // id is '' (matches no profile row) until onboarding creates the profile.
      session.user.id = (token.id as string | undefined) ?? ''
      session.user.role = (token.role as 'teacher' | 'student' | 'district_admin' | 'admin' | null) ?? null
      session.user.districtId = (token.districtId as string | null | undefined) ?? null
      session.user.image = token.picture as string | undefined
      session.user.username = token.username as string | undefined
      session.user.needsOnboarding = token.needsOnboarding === true
      session.user.googleSub = token.googleSub as string | undefined
      return session
    },
  },
  pages: { signIn: '/sign-in' },
  session: { strategy: 'jwt' },
})