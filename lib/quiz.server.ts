// Quiz Builder — server-side plan gate. Hiding the Quizzes tab is cosmetic;
// every quiz API route independently enforces this (defense in depth, same
// pattern as the student-cap trigger backing classHasCapacity).

import { getTeacherPlanUsage } from '@/lib/plan.server';

export async function quizBuilderAllowed(teacherId: string): Promise<boolean> {
  const usage = await getTeacherPlanUsage(teacherId);
  return !!usage?.includesQuizBuilder;
}
