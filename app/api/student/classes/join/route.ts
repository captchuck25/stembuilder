import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { classHasCapacity } from '@/lib/plan.server'
import { isCapError, STUDENT_JOIN_BLOCKED_MESSAGE } from '@/lib/plan'

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { code } = await req.json()
  if (!code) return NextResponse.json({ error: 'Missing code' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db
    .from('classes')
    .select('*')
    .eq('join_code', code.trim().toUpperCase())
    .is('deleted_at', null)
    .single()

  if (!cls) return NextResponse.json({ error: 'Class not found. Check the code and try again.' }, { status: 404 })

  const { data: existing } = await db
    .from('enrollments')
    .select('id')
    .eq('class_id', cls.id)
    .eq('student_id', session.user.id)
    .is('deleted_at', null)
    .single()

  if (existing) return NextResponse.json({ error: 'You are already enrolled in this class.' }, { status: 409 })

  // Teacher plan cap: friendly pre-check here, atomically re-enforced by the
  // 0018 DB trigger on the upsert below.
  if (!(await classHasCapacity(cls.id, session.user.id))) {
    return NextResponse.json({ error: STUDENT_JOIN_BLOCKED_MESSAGE, code: 'class_full' }, { status: 403 })
  }

  const { error: enrollError } = await db
    .from('enrollments')
    .upsert({ class_id: cls.id, student_id: session.user.id, deleted_at: null }, { onConflict: 'class_id,student_id' })
  if (enrollError) {
    if (isCapError(enrollError.message)) {
      return NextResponse.json({ error: STUDENT_JOIN_BLOCKED_MESSAGE, code: 'class_full' }, { status: 403 })
    }
    return NextResponse.json({ error: 'Could not join the class. Please try again.' }, { status: 500 })
  }

  // Membership follows the teacher: joining a district class pulls the student
  // into that district — but only if they aren't in one already (a student is
  // never silently moved between districts). account_origin is untouched.
  if (cls.district_id) {
    await db.from('profiles')
      .update({ district_id: cls.district_id, school_id: cls.school_id ?? null })
      .eq('id', session.user.id)
      .is('district_id', null)
  }
  return NextResponse.json({ ok: true })
}
