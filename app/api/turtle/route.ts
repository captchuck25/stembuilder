import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { CHALLENGES } from '@/app/tools/code-lab/turtle/challenges'

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const db = adminDb()
  const { data } = await db
    .from('turtle_submissions')
    .select('*')
    .eq('user_id', session.user.id)
    .is('deleted_at', null)

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const { challengeId, code, imageData, submit } = body

  const db = adminDb()

  // Server-side lock enforcement: if the student's teacher has locked this turtle item,
  // refuse the write so they can't slip in a save/submit/completion by having the editor
  // open from before the lock was applied or by hand-crafting a request.
  const levelIdx = CHALLENGES.findIndex(c => c.id === challengeId)
  if (levelIdx >= 0) {
    const { data: enrollments } = await db
      .from('enrollments')
      .select('class_id')
      .eq('student_id', session.user.id)
      .is('deleted_at', null)
    const classIds = (enrollments ?? []).map((e: { class_id: string }) => e.class_id)
    if (classIds.length > 0) {
      const { data: lockRows } = await db
        .from('lesson_locks')
        .select('id')
        .eq('tool', 'turtle')
        .eq('level_idx', levelIdx)
        .eq('challenge_idx', -1)
        .in('class_id', classIds)
      if (lockRows && lockRows.length > 0) {
        return NextResponse.json({ error: 'This activity is locked by your teacher.' }, { status: 403 })
      }
    }
  }

  const record: Record<string, unknown> = {
    user_id: session.user.id,
    challenge_id: challengeId,
    code,
    image_data: imageData,
    updated_at: new Date().toISOString(),
    deleted_at: null,
  }
  if (submit) record.submitted_at = new Date().toISOString()

  const { error } = await db
    .from('turtle_submissions')
    .upsert(record, { onConflict: 'user_id,challenge_id' })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
