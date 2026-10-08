import { roleAtLeast } from '@/lib/roles'
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/auth'
import { adminDb } from '@/lib/db.server'
import { softDeleteClass, softDeleteEnrollment } from '@/lib/retention'
import { buildDefaultLocks } from '@/lib/class-defaults.server'
import { LEVELS } from '@/app/tools/code-lab/python/levels'
import { classRoleFor, teacherCanAccessClass, teacherOwnsClass } from '@/lib/class-access.server'

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const db = adminDb()

  const role = await classRoleFor(db, session.user.id, classId)
  if (!role) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const [{ data: classData }, { data: assignData }, { data: enrollData }, { data: lockData }] = await Promise.all([
    db.from('classes').select('*').eq('id', classId).is('deleted_at', null).single(),
    db.from('assignments').select('*').eq('class_id', classId).order('level_id'),
    db.from('enrollments').select('student_id').eq('class_id', classId).is('deleted_at', null),
    db.from('lesson_locks').select('*').eq('class_id', classId),
  ])

  if (!classData) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  const studentIds = (enrollData ?? []).map((e: { student_id: string }) => e.student_id)
  let students: unknown[] = []

  if (studentIds.length) {
    const { data: profiles } = await db
      .from('profiles')
      .select('id, name, email, username')
      .in('id', studentIds)
      .is('deleted_at', null)

    const totalChallenges = (assignData ?? []).reduce((sum: number, a: { level_id: number }) => {
      const level = LEVELS[a.level_id]
      return sum + (level?.challenges.length ?? 0)
    }, 0)

    students = await Promise.all(
      (profiles ?? []).map(async (p: { id: string; name: string; email: string | null; username: string | null }) => {
        const { count } = await db
          .from('user_progress')
          .select('*', { count: 'exact', head: true })
          .eq('user_id', p.id)
          .eq('completed', true)
          .not('challenge_idx', 'is', null)
          .is('deleted_at', null)
        return { id: p.id, name: p.name, email: p.email, username: p.username, completedChallenges: count ?? 0, totalChallenges }
      })
    )
  }

  return NextResponse.json({ class: classData, role, assignments: assignData ?? [], locks: lockData ?? [], students, studentIds })
}

// PATCH /api/teacher/classes/[id]  { name } → rename class
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const db = adminDb()
  if (!(await teacherCanAccessClass(db, session.user.id, classId)))
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { name, leaderboardEnabled, joinCode } = await req.json()
  const patch: { name?: string; leaderboard_enabled?: boolean; join_code?: string } = {}
  if (name !== undefined) {
    if (!name?.trim()) return NextResponse.json({ error: 'Name required' }, { status: 400 })
    patch.name = name.trim()
  }
  // Custom class code (Charlie, 2026-10-08): friendlier than the random six
  // characters for makerspaces and libraries. Stored uppercase — every join
  // path already matches case-insensitively against live classes.
  if (joinCode !== undefined) {
    const code = String(joinCode ?? '').trim().toUpperCase()
    if (!/^[A-Z0-9][A-Z0-9-]{2,13}[A-Z0-9]$/.test(code))
      return NextResponse.json({ error: 'Class codes are 4–15 letters, numbers, or dashes (no spaces), like MAKER-24 or LIBRARY1.' }, { status: 400 })
    const { data: taken } = await db
      .from('classes')
      .select('id')
      .ilike('join_code', code)
      .is('deleted_at', null)
      .neq('id', classId)
      .limit(1)
    if (taken?.length)
      return NextResponse.json({ error: `“${code}” is already in use by another class — try a different one.` }, { status: 409 })
    patch.join_code = code
  }
  if (leaderboardEnabled !== undefined) {
    if (typeof leaderboardEnabled !== 'boolean')
      return NextResponse.json({ error: 'leaderboardEnabled must be a boolean' }, { status: 400 })
    patch.leaderboard_enabled = leaderboardEnabled
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })

  const { data, error } = await db
    .from('classes').update(patch).eq('id', classId).is('deleted_at', null).select().single()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json(data)
}

// DELETE /api/teacher/classes/[id]              → delete entire class
// DELETE /api/teacher/classes/[id]?studentId=X  → remove one student enrollment
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!roleAtLeast(session.user.role, 'teacher')) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const { id: classId } = await params
  const db = adminDb()
  const sp = new URL(req.url).searchParams
  const studentId = sp.get('studentId')
  // ?reset=year — "start a new school year": drop every student, erase every
  // assignment (their submissions cascade, exactly as deleting an assignment
  // does), re-lock every tool to the new-class defaults, archive shared
  // designs — but keep the class, its code, and its co-teachers. Owner-only,
  // like deleting the class. Students keep their own account-scoped work.
  // Charlie, 2026-10-08.
  const clearRoster = sp.get('reset') === 'year'

  // Any teacher on the class may drop a student; only the owner deletes the
  // class or empties the roster.
  const allowed = studentId && !clearRoster
    ? await teacherCanAccessClass(db, session.user.id, classId)
    : await teacherOwnsClass(db, session.user.id, classId)
  if (!allowed)
    return NextResponse.json({ error: studentId && !clearRoster ? 'Forbidden' : 'Only the class owner can do that.' }, { status: 403 })

  try {
    if (clearRoster) {
      // 1. Students — same per-enrollment soft delete (30-day retention) as
      //    removing one student, applied to everyone currently enrolled.
      const { data: rows } = await db
        .from('enrollments')
        .select('student_id')
        .eq('class_id', classId)
        .is('deleted_at', null)
      const ids = [...new Set((rows ?? []).map((r: { student_id: string }) => r.student_id))]
      for (const sid of ids) await softDeleteEnrollment(classId, sid)

      // 2. Assignments, every tool — hard delete like each tool's own Delete
      //    button; submissions/attempts cascade with them. A table that
      //    doesn't exist yet (migration not run) is skipped.
      const assignmentTables = [
        'assignments', 'turtle_assignments', 'bridge_assignments', 'tower_assignments',
        'measurement_assignments', 'quiz_assignments', 'stem_sketch_assignments',
        'blueprint_assignments', 'stem_sketch_tutorial_assignments',
      ]
      const erased: Record<string, number> = {}
      for (const table of assignmentTables) {
        const { data, error } = await db.from(table).delete().eq('class_id', classId).select('class_id')
        if (error) {
          if (!/relation|does not exist/i.test(error.message)) throw new Error(`${table}: ${error.message}`)
          continue
        }
        erased[table] = data?.length ?? 0
      }

      // 3. Locks back to the new-class default: everything locked.
      await db.from('lesson_locks').delete().eq('class_id', classId)
      const lockRows = buildDefaultLocks(classId)
      if (lockRows.length) {
        const { error: lockError } = await db.from('lesson_locks').insert(lockRows)
        if (lockError) console.error('Year reset: re-seeding default locks failed for class', classId, lockError)
      }

      // 4. Shared STEM Sketch designs — out of the inbox (archived, not deleted:
      //    students keep their design and the feedback). Column from 0035.
      const { error: shareErr } = await db
        .from('stem_sketch_shares')
        .update({ archived_at: new Date().toISOString(), archived_by: session.user.id })
        .eq('class_id', classId)
        .is('deleted_at', null)
        .is('archived_at', null)
      if (shareErr && !/archived_at|archived_by|stem_sketch_shares/.test(shareErr.message))
        console.error('Year reset: archiving shares failed for class', classId, shareErr)

      return NextResponse.json({ ok: true, removed: ids.length, erased, locksReset: lockRows.length })
    }
    if (studentId) {
      // Remove one student from the class (soft delete — 30-day retention)
      await softDeleteEnrollment(classId, studentId)
      return NextResponse.json({ ok: true })
    }

    // Soft-delete the entire class: deleted_at cascades to enrollments and
    // this class's submissions; assignments/locks stay (unreachable) and are
    // hard-deleted with the class by the daily purge job 30 days later.
    await softDeleteClass(classId)
  } catch (e) {
    return NextResponse.json({ error: (e as Error).message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
