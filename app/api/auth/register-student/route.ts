import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { adminDb } from '@/lib/db.server'

// Username: 3–20 chars, lowercase letters/numbers and . _ - (normalized to lower).
const USERNAME_RE = /^[a-z0-9._-]{3,20}$/

// POST /api/auth/register-student  { name, username, password, joinCode }
// Creates a username-only student account (no email) and enrolls it in the
// class identified by joinCode. The client then signs in with username+password.
export async function POST(req: NextRequest) {
  const { name, username, password, joinCode } = await req.json()

  if (!name?.trim() || !username || !password || !joinCode?.trim()) {
    return NextResponse.json({ error: 'All fields are required' }, { status: 400 })
  }

  const uname = String(username).toLowerCase().trim()
  if (!USERNAME_RE.test(uname)) {
    return NextResponse.json(
      { error: 'Username must be 3–20 characters: lowercase letters, numbers, dot, dash, or underscore.' },
      { status: 400 },
    )
  }
  if (typeof password !== 'string' || password.length < 8) {
    return NextResponse.json({ error: 'Password must be at least 8 characters' }, { status: 400 })
  }

  const db = adminDb()

  // Resolve the class first so a bad code never leaves an orphan account behind.
  const { data: cls } = await db
    .from('classes')
    .select('id')
    .eq('join_code', String(joinCode).trim().toUpperCase())
    .maybeSingle()
  if (!cls) {
    return NextResponse.json({ error: 'Class not found. Check the code with your teacher.' }, { status: 404 })
  }

  const { data: taken } = await db.from('profiles').select('id').eq('username', uname).maybeSingle()
  if (taken) {
    return NextResponse.json({ error: 'That username is taken. Try another.' }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 12)
  const { data: created, error } = await db
    .from('profiles')
    .insert({ name: name.trim(), username: uname, password_hash: hash, role: 'student' })
    .select('id')
    .single()

  // A unique-index violation here means the username was claimed in a race.
  if (error || !created) {
    return NextResponse.json({ error: 'That username is taken. Try another.' }, { status: 409 })
  }

  await db.from('enrollments').insert({ class_id: cls.id, student_id: created.id })

  return NextResponse.json({ ok: true, username: uname })
}
