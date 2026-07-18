import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isAdmin } from '@/lib/roles'

// GET /api/admin/classes
// All classes across the site, with teacher name/email and enrollment count.
export async function GET() {
  const session = await auth()
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const db = adminDb()
  const { data: classes, error } = await db
    .from('classes')
    .select('id, name, join_code, teacher_id, created_at')
    .is('deleted_at', null)
    .order('created_at', { ascending: false })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const teacherIds = Array.from(new Set((classes ?? []).map((c: { teacher_id: string }) => c.teacher_id)))
  const teacherMap: Record<string, { name: string; email: string }> = {}
  if (teacherIds.length) {
    const { data: teachers } = await db
      .from('profiles').select('id, name, email').in('id', teacherIds).is('deleted_at', null)
    for (const t of teachers ?? []) teacherMap[t.id] = { name: t.name, email: t.email }
  }

  const result = await Promise.all(
    (classes ?? []).map(async (c: { id: string; name: string; join_code: string; teacher_id: string; created_at: string }) => {
      const { count } = await db
        .from('enrollments').select('*', { count: 'exact', head: true }).eq('class_id', c.id).is('deleted_at', null)
      return {
        ...c,
        studentCount: count ?? 0,
        teacherName: teacherMap[c.teacher_id]?.name ?? 'Unknown',
        teacherEmail: teacherMap[c.teacher_id]?.email ?? '',
      }
    })
  )

  return NextResponse.json(result)
}
