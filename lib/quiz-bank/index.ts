// Quiz Builder — curriculum bank entry point (M0). All three launch banks are
// live: Electronics (7 units), Block Lab (5 units), Python (5 levels).

import { BankQuestion, QuizLab } from './types';
import { ELECTRONICS_BANK } from './electronics';
import { BLOCK_BANK } from './block';
import { PYTHON_BANK } from './python';

export type { BankQuestion, QuizLab } from './types';

const BANKS: Record<QuizLab, BankQuestion[]> = {
  'electronics-lab': ELECTRONICS_BANK,
  'block-lab': BLOCK_BANK,
  'code-lab-python': PYTHON_BANK,
};

export function getBank(lab: QuizLab, unitIdx?: number): BankQuestion[] {
  const bank = BANKS[lab] ?? [];
  return unitIdx === undefined ? bank : bank.filter((q) => q.unitIdx === unitIdx);
}

/** Multi-unit quizzes: the bank across every selected unit, in unit order. */
export function getBankForUnits(lab: QuizLab, unitIdxs: number[]): BankQuestion[] {
  const wanted = new Set(unitIdxs);
  return (BANKS[lab] ?? []).filter((q) => wanted.has(q.unitIdx));
}

/** Distinct topics for a unit, in first-appearance order — builder filter UI. */
export function getTopics(lab: QuizLab, unitIdx: number): string[] {
  return [...new Set(getBank(lab, unitIdx).map((q) => q.topic))];
}
