import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import bcrypt from 'bcryptjs'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { generateTempPassword } from '@/lib/reset.server'

// POST /api/teacher/students/[id]/reset-password
// A teacher resets one of their own students' passwords to a fresh temporary
// password, returned once so the teacher can hand it to the student. Used for
// students who can't reach their own email — or have no email at all (username
// accounts). The student can change it later once signed in.
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: studentId } = await params
  const db = adminDb()

  // The student must be enrolled in a class this teacher owns.
  const { data: teacherClasses } = await db.from('classes').select('id').eq('teacher_id', session.user.id).is('deleted_at', null)
  const classIds = (teacherClasses ?? []).map((c: { id: string }) => c.id)
  if (!classIds.length) return NextResponse.json({ error: 'That student is not in one of your classes.' }, { status: 403 })

  const { data: enrollment } = await db
    .from('enrollments')
    .select('id')
    .eq('student_id', studentId)
    .in('class_id', classIds)
    .is('deleted_at', null)
    .limit(1)
    .maybeSingle()
  if (!enrollment) return NextResponse.json({ error: 'That student is not in one of your classes.' }, { status: 403 })

  const { data: student } = await db
    .from('profiles')
    .select('id, name, role, username, email')
    .eq('id', studentId)
    .is('deleted_at', null)
    .maybeSingle()
  if (!student) return NextResponse.json({ error: 'Student not found.' }, { status: 404 })
  if (student.role !== 'student') return NextResponse.json({ error: 'You can only reset student passwords.' }, { status: 400 })

  const tempPassword = generateTempPassword()
  const hash = await bcrypt.hash(tempPassword, 12)
  // password_changed_at makes auth.ts reject the student's existing sessions.
  const { error } = await db
    .from('profiles')
    .update({ password_hash: hash, password_changed_at: new Date().toISOString() })
    .eq('id', studentId)
    .is('deleted_at', null)
  if (error) return NextResponse.json({ error: 'Could not reset password. Please try again.' }, { status: 500 })

  // Invalidate any outstanding self-service reset links for this student.
  await db
    .from('password_reset_tokens')
    .update({ used_at: new Date().toISOString() })
    .eq('user_id', studentId)
    .is('used_at', null)

  return NextResponse.json({
    ok: true,
    tempPassword,
    loginId: student.username || student.email || student.name,
  })
}
