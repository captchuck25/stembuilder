// Teacher plan & cap — server half. Reads plan state + live student counts
// and answers "can this teacher take another student?" for route pre-checks.
// Never trust client input for any of this: everything derives from the
// session + database, and the 0018 DB trigger is the final race-proof gate.

import { adminDb } from "./db.server";
import { buildUsage, defaultTrialEnd, type PlanUsage, type TeacherPlan } from "./plan";

interface PlanProfileRow {
  plan: TeacherPlan | null;
  pro_trial_started_at: string | null;
  pro_trial_ends_at: string | null;
  pro_overage_blocks: number | null;
  district_id: string | null;
}

/** Distinct non-deleted students across the teacher's non-deleted classes. */
export async function countActiveStudents(teacherId: string): Promise<number> {
  const db = adminDb();
  const { data: classes } = await db
    .from("classes")
    .select("id")
    .eq("teacher_id", teacherId)
    .is("deleted_at", null);
  const classIds = (classes ?? []).map((c) => c.id);
  if (classIds.length === 0) return 0;

  const { data: enrollments } = await db
    .from("enrollments")
    .select("student_id")
    .in("class_id", classIds)
    .is("deleted_at", null);
  return new Set((enrollments ?? []).map((e) => e.student_id)).size;
}

export async function getTeacherPlanUsage(teacherId: string): Promise<PlanUsage | null> {
  const db = adminDb();
  const { data: profile } = await db
    .from("profiles")
    .select("plan, pro_trial_started_at, pro_trial_ends_at, pro_overage_blocks, district_id")
    .eq("id", teacherId)
    .is("deleted_at", null)
    .single<PlanProfileRow>();
  if (!profile) return null;

  const count = await countActiveStudents(teacherId);
  return buildUsage({
    plan: (profile.plan ?? "free") as TeacherPlan,
    proTrialStartedAt: profile.pro_trial_started_at,
    proTrialEndsAt: profile.pro_trial_ends_at,
    overageBlocks: profile.pro_overage_blocks ?? 0,
    institutional: profile.district_id !== null,
    count,
  });
}

/**
 * Friendly pre-check for join routes: would enrolling `studentId` into this
 * teacher's classes exceed the cap? (A student already enrolled with the
 * teacher occupies no new seat.) The DB trigger re-checks atomically — this
 * exists to answer BEFORE any account/enrollment work happens.
 */
export async function classHasCapacity(classId: string, studentId?: string): Promise<boolean> {
  const db = adminDb();
  const { data: cls } = await db
    .from("classes")
    .select("teacher_id")
    .eq("id", classId)
    .is("deleted_at", null)
    .single();
  if (!cls?.teacher_id) return true; // orphan class — let the trigger decide

  const usage = await getTeacherPlanUsage(cls.teacher_id);
  if (!usage || usage.cap === null) return true; // institutional / unknown → uncapped here
  if (!usage.atCap) return true;

  // At cap — still fine if this student already counts toward it.
  if (studentId) {
    const { data: classes } = await db
      .from("classes")
      .select("id")
      .eq("teacher_id", cls.teacher_id)
      .is("deleted_at", null);
    const ids = (classes ?? []).map((c) => c.id);
    if (ids.length > 0) {
      const { data: existing } = await db
        .from("enrollments")
        .select("id")
        .in("class_id", ids)
        .eq("student_id", studentId)
        .is("deleted_at", null)
        .limit(1);
      if (existing && existing.length > 0) return true;
    }
  }
  return false;
}

/** Trial end: PRO_TRIAL_ENDS_AT env (ISO date) overrides the June-30 default. */
export function trialEndDate(now: Date = new Date()): Date {
  const configured = process.env.PRO_TRIAL_ENDS_AT;
  if (configured) {
    const d = new Date(configured);
    if (!Number.isNaN(d.getTime()) && d.getTime() > now.getTime()) return d;
  }
  return defaultTrialEnd(now);
}
