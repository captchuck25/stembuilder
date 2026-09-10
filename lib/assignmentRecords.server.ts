import type { SupabaseClient } from '@supabase/supabase-js'

// Durable, account-scoped record of every assignment a student finishes.
//
// Why this exists: submissions/attempts are CLASS-scoped grade records — they
// are soft-deleted with the class and purged 30 days later. A student who
// looks back a year later would find nothing. This table is the student's own
// copy of the outcome (title, class, score, date, pointer to their design) and
// only dies with the account. It is READ by My Work and WRITTEN here, from the
// submit routes, best-effort: a failure never blocks or fails the submission,
// and nothing in grading reads it.

export type RecordTool = 'bridge' | 'tower' | 'measurement' | 'quiz' | 'stem-sketch' | 'blueprint'

export interface DesignRef { tool: RecordTool; id: string }

export interface RecordInput {
  studentId: string
  tool: RecordTool
  assignmentId: string
  title: string
  classId: string | null
  /** null = not graded at submit time (score-only mode, teacher-graded work). */
  passed: boolean | null
  /** Short human-readable outcome, e.g. "17/20", "$1,180 · passed". */
  summary: string
  result?: Record<string, unknown> | null
  designRef?: DesignRef | null
}

export async function recordAssignmentCompletion(db: SupabaseClient, input: RecordInput): Promise<void> {
  try {
    const [{ data: cls }, { count }] = await Promise.all([
      input.classId
        ? db.from('classes').select('name').eq('id', input.classId).maybeSingle()
        : Promise.resolve({ data: null as { name: string } | null }),
      db.from('student_assignment_records')
        .select('id', { count: 'exact', head: true })
        .eq('student_id', input.studentId)
        .eq('assignment_id', input.assignmentId)
        .is('deleted_at', null),
    ])
    const { error } = await db.from('student_assignment_records').insert({
      student_id: input.studentId,
      tool: input.tool,
      assignment_id: input.assignmentId,
      assignment_title: (input.title || '').slice(0, 120) || 'Assignment',
      class_id: input.classId,
      class_name: (cls?.name ?? '').slice(0, 120),
      attempt_no: (count ?? 0) + 1,
      passed: input.passed,
      summary: input.summary.slice(0, 120),
      result: input.result ?? null,
      design_ref: input.designRef ?? null,
    })
    if (error) console.warn('[assignment-records] insert skipped:', error.message)
  } catch (e) {
    console.warn('[assignment-records] skipped:', (e as Error).message)
  }
}

/**
 * The student's own saved design for this assignment (bridge/tower designs
 * carry assignment_id when saved from inside an assignment). Newest wins.
 */
export async function findOwnDesign(
  db: SupabaseClient,
  table: 'bridge_designs' | 'tower_designs',
  userId: string,
  assignmentId: string,
): Promise<string | null> {
  try {
    const { data } = await db
      .from(table)
      .select('id')
      .eq('user_id', userId)
      .eq('assignment_id', assignmentId)
      .is('deleted_at', null)
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    return data?.id ? String(data.id) : null
  } catch {
    return null
  }
}
