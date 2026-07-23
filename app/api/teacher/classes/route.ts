import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { generateJoinCode, buildDefaultLocks } from '@/lib/class-defaults.server'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminDb()
  const { data: classes } = await db
    .from('classes')
    .select('*')
    .eq('teacher_id', session.user.id)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  const result = await Promise.all(
    (classes ?? []).map(async (cls: { id: string }) => {
      const { count } = await db
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', cls.id)
        .is('deleted_at', null)
      return { ...cls, studentCount: count ?? 0 }
    })
  )

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const db = adminDb()

  // Teachers must verify their email before they can create classes (and thus
  // enroll students). Google-created accounts are verified at creation.
  const { data: me } = await db
    .from('profiles')
    .select('email_verified_at')
    .eq('id', session.user.id)
    .is('deleted_at', null)
    .maybeSingle()
  if (!me?.email_verified_at) {
    return NextResponse.json(
      { error: 'Verify your email to create classes — check your inbox for the link.', code: 'email_unverified' },
      { status: 403 },
    )
  }
  const { data, error } = await db
    .from('classes')
    .insert({ teacher_id: session.user.id, name: name.trim(), join_code: generateJoinCode() })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Insert default locks for every level in every lockable tool. Failures here are
  // non-fatal — the teacher can re-lock manually — so we don't roll back the class.
  const lockRows = buildDefaultLocks(data.id)
  if (lockRows.length > 0) {
    const { error: lockError } = await db.from('lesson_locks').insert(lockRows)
    if (lockError) console.error('Failed to seed default locks for new class', data.id, lockError)
  }

  return NextResponse.json(data)
}
