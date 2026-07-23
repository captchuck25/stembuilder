import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { generateTempPassword } from '@/lib/reset.server'

const USERNAME_RE = /^[a-z0-9._-]{3,20}$/

// POST /api/teacher/classes/[id]/students  { name, username }
//
// Path A (rostered): the teacher provisions a username-only student account
// directly into their class — school-consent basis, so no age is collected
// and no email is required. Profile + enrollment are created atomically by
// the create_student_account RPC with account_origin = 'rostered'. Returns a
// one-time temporary password the teacher hands to the student (same pattern
// as the teacher-issued password reset).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const db = adminDb()

  // Same gate as class creation: only verified teachers may enroll students.
  const { data: me } = await db
    .from('profiles')
    .select('email_verified_at')
    .eq('id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!me?.email_verified_at) {
    return NextResponse.json(
      { error: 'Verify your email before adding students.', code: 'email_unverified' },
      { status: 403 },
    )
  }

  // The teacher must own this class; the RPC re-checks the class is live.
  const { data: cls } = await db
    .from('classes')
    .select('id')
    .eq('id', classId)
    .eq('teacher_id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!cls) return NextResponse.json({ error: 'Class not found' }, { status: 404 })

  const { name, username } = await req.json()
  if (!name?.trim() || !username) {
    return NextResponse.json({ error: 'Name and username are required' }, { status: 400 })
  }
  const uname = String(username).toLowerCase().trim()
  if (!USERNAME_RE.test(uname)) {
    return NextResponse.json(
      { error: 'Username must be 3–20 characters: lowercase letters, numbers, dot, dash, or underscore.' },
      { status: 400 },
    )
  }

  const tempPassword = generateTempPassword()
  const hash = await bcrypt.hash(tempPassword, 12)
  const { data: studentId, error } = await db.rpc('create_student_account', {
    p_name: String(name).trim(),
    p_email: null,
    p_username: uname,
    p_password_hash: hash,
    p_google_id: null,
    p_join_code: null,
    p_class_id: classId,
    p_origin: 'rostered',
  })

  if (error) {
    if (error.message.includes('identifier_taken')) {
      return NextResponse.json({ error: 'That username is taken. Try another.' }, { status: 409 })
    }
    if (error.message.includes('class_not_found')) {
      return NextResponse.json({ error: 'Class not found' }, { status: 404 })
    }
    return NextResponse.json({ error: 'Could not create the student account.' }, { status: 500 })
  }

  return NextResponse.json({ ok: true, id: studentId, username: uname, tempPassword })
}
