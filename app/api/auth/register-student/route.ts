import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { adminDb } from '@/lib/db.server'

// Username: 3–20 chars, lowercase letters/numbers and . _ - (normalized to lower).
const USERNAME_RE = /^[a-z0-9._-]{3,20}$/

// POST /api/auth/register-student  { name, username, password, joinCode }
//
// Path B (class code): school-consent basis, so no age is collected — any age
// is allowed. The create_student_account RPC validates the class and creates
// profile + enrollment in ONE transaction (account_origin = 'class_code'), so
// an invalid code creates nothing and a created account always has its class.
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

  // Deliberately NOT filtered by deleted_at: a soft-deleted account keeps its
  // username reserved during the 30-day retention window. The RPC's unique
  // index enforces this anyway — the pre-check just gives a clean early error.
  const { data: taken } = await db.from('profiles').select('id').eq('username', uname).maybeSingle()
  if (taken) {
    return NextResponse.json({ error: 'That username is taken. Try another.' }, { status: 409 })
  }

  const hash = await bcrypt.hash(password, 12)
  const { error } = await db.rpc('create_student_account', {
    p_name: name.trim(),
    p_email: null,
    p_username: uname,
    p_password_hash: hash,
    p_google_id: null,
    p_join_code: String(joinCode),
    p_class_id: null,
    p_origin: 'class_code',
  })

  if (error) {
    if (error.message.includes('class_not_found')) {
      return NextResponse.json(
        { error: "That code didn't match a class. Ask your teacher for your class code." },
        { status: 404 },
      )
    }
    if (error.message.includes('identifier_taken')) {
      return NextResponse.json({ error: 'That username is taken. Try another.' }, { status: 409 })
    }
    return NextResponse.json({ error: 'Could not create the account. Please try again.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, username: uname })
}
