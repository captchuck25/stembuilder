// STEM Sketch assignments — server-side plan gate. Hiding the Assignments
// section in the class page is cosmetic; every stem-sketch assignment API
// route independently enforces this (defense in depth, same pattern as
// lib/quiz.server.ts).

import { getTeacherPlanUsage } from '@/lib/plan.server';

export async function stemSketchAssignmentsAllowed(teacherId: string): Promise<boolean> {
  const usage = await getTeacherPlanUsage(teacherId);
  return !!usage?.includesStemSketchAssignments;
}
