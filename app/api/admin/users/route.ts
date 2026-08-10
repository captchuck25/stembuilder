import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { isAdmin } from '@/lib/roles'
import { effectivePlan, type TeacherPlan } from '@/lib/plan'

// GET /api/admin/users?role=teacher|student
// Returns the full list of users for the given role, plus per-user counts the
// admin UI uses for context (classes owned for teachers, enrollments for
// students). Teacher rows also carry plan state (free / pro_trial / pro,
// institutional exemption, trial end) for the plan badge + trial controls.
export async function GET(req: NextRequest) {
  const session = await auth()
  if (!isAdmin(session?.user?.role)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const role = new URL(req.url).searchParams.get('role')
  if (role !== 'teacher' && role !== 'student') {
    return NextResponse.json({ error: 'role must be teacher or student' }, { status: 400 })
  }

  const db = adminDb()
  const { data: users, error } = await db
    .from('profiles')
    .select('id, name, email, role, created_at, plan, pro_trial_ends_at, district_id')
    .eq('role', role)
    .is('deleted_at', null)
    .order('created_at', { ascending: false })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const result = await Promise.all(
    (users ?? []).map(async (u: { id: string; name: string; email: string; role: string; created_at: string; plan: string | null; pro_trial_ends_at: string | null; district_id: string | null }) => {
      const { plan, pro_trial_ends_at, district_id, ...base } = u
      if (role === 'teacher') {
        const { count } = await db
          .from('classes').select('*', { count: 'exact', head: true }).eq('teacher_id', u.id).is('deleted_at', null)
        const p = (plan ?? 'free') as TeacherPlan
        return {
          ...base,
          classCount: count ?? 0,
          plan: p,
          effectivePlan: effectivePlan(p, pro_trial_ends_at),
          trialEndsAt: pro_trial_ends_at,
          institutional: district_id !== null,
        }
      }
      const { count } = await db
        .from('enrollments').select('*', { count: 'exact', head: true }).eq('student_id', u.id).is('deleted_at', null)
      return { ...base, enrollmentCount: count ?? 0 }
    })
  )

  return NextResponse.json(result)
}
