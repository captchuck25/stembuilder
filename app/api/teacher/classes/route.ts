import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { LEVELS } from '@/app/tools/code-lab/python/levels'
import { UNITS } from '@/app/tools/block-lab/units'
import { CHALLENGES as TURTLE_CHALLENGES } from '@/app/tools/code-lab/turtle/challenges'

function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
}

// Default a new class to "all levels locked" for every lockable tool so students
// can't access content until a teacher explicitly assigns or opens it.
// Important for turtle: the teacher dashboard 3-state UI keys each item by its
// position in the FULL CHALLENGES array (tutorials + challenges), so the
// auto-lock indexes must match that — otherwise the wrong items end up locked.
function buildDefaultLocks(classId: string) {
  const rows: Array<{ class_id: string; tool: string; level_idx: number; challenge_idx: number }> = []
  for (let i = 0; i < LEVELS.length; i++) rows.push({ class_id: classId, tool: 'code-lab', level_idx: i, challenge_idx: -1 })
  for (let i = 0; i < UNITS.length; i++) rows.push({ class_id: classId, tool: 'block-lab', level_idx: i, challenge_idx: -1 })
  for (let i = 0; i < TURTLE_CHALLENGES.length; i++) rows.push({ class_id: classId, tool: 'turtle', level_idx: i, challenge_idx: -1 })
  return rows
}

export async function GET() {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminDb()
  const { data: classes } = await db
    .from('classes')
    .select('*')
    .eq('teacher_id', session.user.id)
    .order('created_at', { ascending: false })

  const result = await Promise.all(
    (classes ?? []).map(async (cls: { id: string }) => {
      const { count } = await db
        .from('enrollments')
        .select('*', { count: 'exact', head: true })
        .eq('class_id', cls.id)
      return { ...cls, studentCount: count ?? 0 }
    })
  )

  return NextResponse.json(result)
}

export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (session.user.role !== 'teacher') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name } = await req.json()
  if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })

  const db = adminDb()
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
