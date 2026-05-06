import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

// GET /api/teacher/turtle-assignments?classId=X
// Returns: string[] of assigned challenge_ids
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data } = await db
    .from('turtle_assignments')
    .select('challenge_id')
    .eq('class_id', classId)

  return NextResponse.json((data ?? []).map((r: { challenge_id: string }) => r.challenge_id))
}

// POST /api/teacher/turtle-assignments  body: { classId, challengeId }
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { classId, challengeId } = await req.json()
  if (!classId || !challengeId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db
    .from('turtle_assignments')
    .upsert({ class_id: classId, challenge_id: challengeId }, { onConflict: 'class_id,challenge_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

// DELETE /api/teacher/turtle-assignments?classId=X&challengeId=Y
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  const challengeId = req.nextUrl.searchParams.get('challengeId')
  if (!classId || !challengeId) return NextResponse.json({ error: 'Missing fields' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db
    .from('turtle_assignments')
    .delete()
    .eq('class_id', classId)
    .eq('challenge_id', challengeId)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
