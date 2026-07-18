import NextAuth from 'next-auth'
import Google from 'next-auth/providers/google'
import Credentials from 'next-auth/providers/credentials'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

declare module 'next-auth' {
  interface Session {
    user: { id: string; email: string; name: string; role: 'teacher' | 'student' | 'admin'; username?: string; image?: string }
  }
  interface User {
    role?: 'teacher' | 'student' | 'admin'
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
          .select('id, email, name, role, username, password_hash')
          .eq(column, identifier)
          .is('deleted_at', null) // soft-deleted accounts cannot sign in
          .maybeSingle()
        if (!profile?.password_hash) return null
        const valid = await bcrypt.compare(credentials.password as string, profile.password_hash)
        if (!valid) return null
        return { id: profile.id, email: profile.email ?? '', name: profile.name, role: profile.role, username: profile.username ?? undefined }
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
          .select('id, role, deleted_at')
          .or(`google_id.eq.${account.providerAccountId},email.eq.${user.email}`)
          .maybeSingle()

        if (existing?.deleted_at) return false

        if (existing) {
          await db.from('profiles').update({ google_id: account.providerAccountId }).eq('id', existing.id)
          user.id = existing.id
          user.role = existing.role
        } else {
          const { data: created } = await db
            .from('profiles')
            .insert({
              email: user.email!,
              name: user.name ?? user.email!.split('@')[0],
              google_id: account.providerAccountId,
              role: 'student',
            })
            .select('id, role')
            .single()
          if (created) { user.id = created.id; user.role = created.role }
        }
      }
      return true
    },
    async jwt({ token, user }) {
      if (user) { token.id = user.id; token.role = user.role ?? 'student'; token.picture = user.image; token.username = user.username }
      return token
    },
    async session({ session, token }) {
      session.user.id = token.id as string
      session.user.role = token.role as 'teacher' | 'student' | 'admin'
      session.user.image = token.picture as string | undefined
      session.user.username = token.username as string | undefined
      return session
    },
  },
  pages: { signIn: '/sign-in' },
  session: { strategy: 'jwt' },
})