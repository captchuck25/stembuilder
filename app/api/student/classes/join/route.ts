import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

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
    .single()

  if (!cls) return NextResponse.json({ error: 'Class not found. Check the code and try again.' }, { status: 404 })

  const { data: existing } = await db
    .from('enrollments')
    .select('id')
    .eq('class_id', cls.id)
    .eq('student_id', session.user.id)
    .single()

  if (existing) return NextResponse.json({ error: 'You are already enrolled in this class.' }, { status: 409 })

  await db.from('enrollments').insert({ class_id: cls.id, student_id: session.user.id })
  return NextResponse.json({ ok: true })
}
