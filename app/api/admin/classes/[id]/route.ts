import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { isAdmin } from '@/lib/roles'
import { softDeleteClass } from '@/lib/retention'

// DELETE /api/admin/classes/[id]
// SOFT-deletes a class (30-day retention window): sets deleted_at on the
// class, its enrollments, and its assignments' submissions. Assignments and
// lesson_locks stay in place (unreachable) and are hard-deleted with the
// class by the daily purge job 30 days later.
// Mirrors the teacher-side delete in app/api/teacher/classes/[id]/route.ts.
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id } = await params
  try {
    await softDeleteClass(id)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
