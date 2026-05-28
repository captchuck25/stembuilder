import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'

const ADMIN_ID = 'user_3CPUWnRGbb5UjjJRoKQx2nVQGyu'

// GET /api/admin/users?role=teacher|student
// Returns the full list of users for the given role, plus per-user counts the
// admin UI uses for context (classes owned for teachers, enrollments for students).
export async function GET(req: NextRequest) {
  const session = await auth()
  if (session?.user?.id !== ADMIN_ID) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const role = new URL(req.url).searchParams.get('role')
  if (role !== 'teacher' && role !== 'student') {
    return NextResponse.json({ error: 'role must be teacher or student' }, { status: 400 })
  }

  const db = adminDb()
  const { data: users, error } = await db
    .from('profiles')
    .select('id, name, email, role, created_at')
    .eq('role', role)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = await Promise.all(
    (users ?? []).map(async (u: { id: string; name: string; email: string; role: string; created_at: string }) => {
      if (role === 'teacher') {
        const { count } = await db
          .from('classes').select('*', { count: 'exact', head: true }).eq('teacher_id', u.id)
        return { ...u, classCount: count ?? 0 }
      }
      const { count } = await db
        .from('enrollments').select('*', { count: 'exact', head: true }).eq('student_id', u.id)
      return { ...u, enrollmentCount: count ?? 0 }
    })
  )

  return NextResponse.json(result)
}
