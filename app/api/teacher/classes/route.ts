import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

function generateJoinCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase()
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
  return NextResponse.json(data)
}
