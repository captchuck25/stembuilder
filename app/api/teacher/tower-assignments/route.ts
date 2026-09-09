import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

const HEIGHTS = [20, 30, 40, 50, 60]
const FOOTPRINTS = [10, 15, 20]
const LOADS_LB = [16000, 30000, 60000]

// GET /api/teacher/tower-assignments?classId=X
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const classId = req.nextUrl.searchParams.get('classId')
  if (!classId) return NextResponse.json({ error: 'Missing classId' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data: assignments } = await db
    .from('tower_assignments')
    .select('*')
    .eq('class_id', classId)
    .order('created_at', { ascending: false })

  const result = await Promise.all((assignments ?? []).map(async (a: { id: string }) => {
    const { count } = await db
      .from('tower_submissions')
      .select('*', { count: 'exact', head: true })
      .eq('assignment_id', a.id)
      .eq('passed', true)
      .is('deleted_at', null)
    return { ...a, completionCount: count ?? 0 }
  }))

  return NextResponse.json(result)
}

// POST /api/teacher/tower-assignments
export async function POST(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { classId, title, heightFeet, footprintFeet, loadLb, maxCost } = await req.json()
  if (!classId || !heightFeet || !footprintFeet || !loadLb || !maxCost)
    return NextResponse.json({ error: 'Missing fields' }, { status: 400 })
  if (!HEIGHTS.includes(Number(heightFeet)) || !FOOTPRINTS.includes(Number(footprintFeet)) || !LOADS_LB.includes(Number(loadLb)))
    return NextResponse.json({ error: 'Invalid height, footprint, or load' }, { status: 400 })

  const db = adminDb()
  const { data: cls } = await db.from('classes').select('teacher_id').eq('id', classId).is('deleted_at', null).single()
  if (!cls || cls.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { data, error } = await db
    .from('tower_assignments')
    .insert({
      class_id: classId,
      teacher_id: session.user.id,
      title: title?.trim() || 'Tower Assignment',
      height_feet: Number(heightFeet),
      footprint_feet: Number(footprintFeet),
      load_lb: Number(loadLb),
      max_cost: maxCost,
    })
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ...data, completionCount: 0 })
}

// DELETE /api/teacher/tower-assignments?id=X
export async function DELETE(req: NextRequest) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const id = req.nextUrl.searchParams.get('id')
  if (!id) return NextResponse.json({ error: 'Missing id' }, { status: 400 })

  const db = adminDb()
  const { data: a } = await db.from('tower_assignments').select('teacher_id').eq('id', id).single()
  if (!a || a.teacher_id !== session.user.id)
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { error } = await db.from('tower_assignments').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
