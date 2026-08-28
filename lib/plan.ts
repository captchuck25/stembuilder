// Teacher plan & student-cap logic — the PURE half (client-safe, unit-tested).
// Caps and prices come from lib/marketing/pricing.ts so the pricing page and
// the enforcement can never drift apart. Server-side reads/writes live in
// lib/plan.server.ts; the race-proof gate is the DB trigger in migration 0018.

import {
  FREE_STUDENT_CAP,
  PRO_STUDENT_CAP,
  OVERAGE_BLOCK_SIZE,
} from "@/lib/marketing/pricing";

export type TeacherPlan = "free" | "pro" | "pro_trial";

/** Substring the 0018 enrollment trigger raises — all cap errors carry it. */
export const CAP_ERROR_TOKEN = "teacher_student_cap";

/** Student-facing refusal (verbatim per spec). */
export const STUDENT_JOIN_BLOCKED_MESSAGE = "This class is full — ask your teacher.";

/** Teacher/roster-facing refusal. */
export const TEACHER_CAP_MESSAGE =
  "Student cap reached — upgrade or start a free Pro trial to add more students.";

export function isCapError(message: string | null | undefined): boolean {
  return !!message && message.includes(CAP_ERROR_TOKEN);
}

/** An expired trial behaves as free. */
export function effectivePlan(
  plan: TeacherPlan,
  proTrialEndsAt: string | null,
  now: Date = new Date(),
): TeacherPlan {
  if (plan !== "pro_trial") return plan;
  if (!proTrialEndsAt || new Date(proTrialEndsAt).getTime() < now.getTime()) return "free";
  return "pro_trial";
}

/** Max distinct active students for an individual (non-institutional) teacher. */
export function studentCap(effective: TeacherPlan, overageBlocks = 0): number {
  if (effective === "pro") return PRO_STUDENT_CAP + OVERAGE_BLOCK_SIZE * Math.max(0, overageBlocks);
  if (effective === "pro_trial") return PRO_STUDENT_CAP;
  return FREE_STUDENT_CAP;
}

/** True when `adding` more distinct students still fits under the cap. */
export function canAddStudents(currentDistinct: number, adding: number, cap: number): boolean {
  return currentDistinct + adding <= cap;
}

/**
 * Default free-trial end: the coming June 30 (end of the current school
 * year) — June 30 of this calendar year if it hasn't passed, else next
 * year's. Overridable via the PRO_TRIAL_ENDS_AT env (ISO date) server-side.
 */
export function defaultTrialEnd(now: Date = new Date()): Date {
  const year = now.getUTCFullYear();
  const juneThis = new Date(Date.UTC(year, 5, 30, 23, 59, 59));
  return now.getTime() <= juneThis.getTime()
    ? juneThis
    : new Date(Date.UTC(year + 1, 5, 30, 23, 59, 59));
}

export interface PlanUsage {
  plan: TeacherPlan;
  effective: TeacherPlan;
  /** District/school teachers inherit institutional access — no individual cap. */
  institutional: boolean;
  /** Distinct active students across the teacher's active classes. */
  count: number;
  /** null when institutional (uncapped at the individual level). */
  cap: number | null;
  atCap: boolean;
  trialUsed: boolean;
  trialEndsAt: string | null;
  overageBlocks: number;
  /**
   * Curriculum library access: paid Pro and institutional plans only. The
   * free Pro TRIAL deliberately excludes it — Pro caps, no curriculum.
   */
  includesCurriculum: boolean;
  /**
   * Quiz Builder access: paid Pro, institutional, AND the free Pro trial —
   * unlike curriculum, the trial deliberately includes it (experiencing the
   * workflow + accumulating a question bank is the conversion pressure).
   * Free teachers see no Quizzes tab at all; API routes 403 on this flag.
   */
  includesQuizBuilder: boolean;
  /**
   * STEM Sketch assignments (replication / puzzle challenges): same policy as
   * Quiz Builder — paid Pro, institutional, AND the free Pro trial (the trial
   * deliberately includes it; running the measure→model→verify workflow with a
   * real class is the conversion pressure). Free teachers see no Assignments
   * section in the STEM Sketch tab; API routes 403 on this flag.
   */
  includesStemSketchAssignments: boolean;
  /**
   * Whether Stripe checkout is currently open (BILLING_ENABLED kill switch).
   * Stamped onto the payload by the API route — buildUsage doesn't set it.
   * Treat absent as false: purchase UI must stay hidden unless explicitly on.
   */
  checkoutEnabled?: boolean;
}

export function buildUsage(args: {
  plan: TeacherPlan;
  proTrialStartedAt: string | null;
  proTrialEndsAt: string | null;
  overageBlocks: number;
  institutional: boolean;
  count: number;
  now?: Date;
}): PlanUsage {
  const effective = effectivePlan(args.plan, args.proTrialEndsAt, args.now);
  const cap = args.institutional ? null : studentCap(effective, args.overageBlocks);
  return {
    plan: args.plan,
    effective,
    institutional: args.institutional,
    count: args.count,
    cap,
    atCap: cap !== null && args.count >= cap,
    trialUsed: args.proTrialStartedAt !== null,
    trialEndsAt: args.proTrialEndsAt,
    overageBlocks: args.overageBlocks,
    includesCurriculum: args.institutional || effective === "pro",
    includesQuizBuilder: args.institutional || effective === "pro" || effective === "pro_trial",
    includesStemSketchAssignments: args.institutional || effective === "pro" || effective === "pro_trial",
  };
}
