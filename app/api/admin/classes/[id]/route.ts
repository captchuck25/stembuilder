import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isAdmin } from '@/lib/roles'

// DELETE /api/admin/classes/[id]
// Cascade-deletes a class plus its enrollments, assignments, and lesson_locks.
// Mirrors the teacher-side delete in app/api/teacher/classes/[id]/route.ts.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  const db = adminDb()

  await Promise.all([
    db.from('enrollments').delete().eq('class_id', id),
    db.from('assignments').delete().eq('class_id', id),
    db.from('lesson_locks').delete().eq('class_id', id),
  ])
  const { error } = await db.from('classes').delete().eq('id', id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
