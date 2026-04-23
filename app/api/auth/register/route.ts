import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import bcrypt from 'bcryptjs'

function adminDb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  const { email, name, password } = await req.json()
  if (!email || !name || !password) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }
  if (password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const db = adminDb()
  const { data: existing } = await db
    .from('profiles')
    .select('id')
    .eq('email', email.toLowerCase().trim())
    .maybeSingle()

  if (existing) {
    return NextResponse.json({ error: 'An account with this email already exists' }, { status: 400 })
  }

  const hash = await bcrypt.hash(password, 12)
  const { error } = await db.from('profiles').insert({
    email: email.toLowerCase().trim(),
    name: name.trim(),
    password_hash: hash,
    role: 'student',
  })

  if (error) return NextResponse.json({ error: 'Registration failed. Please try again.' }, { status: 500 })
  return NextResponse.json({ ok: true })
}