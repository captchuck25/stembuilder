// Quiz Builder — shared pure helpers (client-safe).
// Server-side gate lives in lib/quiz.server.ts; tables in migration 0020.

import type { QuizLab } from '@/lib/quiz-bank';

export const QUIZ_LABS: { id: QuizLab; label: string; icon: string; unitNoun: string }[] = [
  { id: 'electronics-lab', label: 'Electronics Lab', icon: '💡', unitNoun: 'Unit' },
  { id: 'block-lab', label: 'Block Lab', icon: '🧩', unitNoun: 'Unit' },
  { id: 'code-lab-python', label: 'Python Code Lab', icon: '🐍', unitNoun: 'Level' },
];

export function isQuizLab(v: unknown): v is QuizLab {
  return v === 'electronics-lab' || v === 'block-lab' || v === 'code-lab-python';
}

/** One question inside a quiz's frozen snapshot (also the teacher_questions
 *  `question` jsonb shape). `sourceId` tracks provenance: a curriculum bank id
 *  (elec-u0-b3), a teacher_questions uuid, or absent for written-inline. */
export interface QuizQuestion {
  question: string;
  options: [string, string, string, string];
  answer: 0 | 1 | 2 | 3;
  explanation: string;
  blocksFigure?: string;
  topic: string;
  difficulty: 1 | 2 | 3;
  sourceId?: string;
}

/** Validate + normalize an untrusted question payload; null when unusable. */
export function sanitizeQuestion(raw: unknown): QuizQuestion | null {
  if (!raw || typeof raw !== 'object') return null;
  const q = raw as Record<string, unknown>;
  if (typeof q.question !== 'string' || !q.question.trim()) return null;
  if (!Array.isArray(q.options) || q.options.length !== 4) return null;
  const options = q.options.map((o) => (typeof o === 'string' ? o.trim() : ''));
  if (options.some((o) => !o)) return null;
  const answer = q.answer;
  if (answer !== 0 && answer !== 1 && answer !== 2 && answer !== 3) return null;
  const difficulty = q.difficulty === 1 || q.difficulty === 2 || q.difficulty === 3 ? q.difficulty : 2;
  const out: QuizQuestion = {
    question: q.question.trim(),
    options: options as [string, string, string, string],
    answer,
    explanation: typeof q.explanation === 'string' ? q.explanation.trim() : '',
    topic: typeof q.topic === 'string' && q.topic.trim() ? q.topic.trim() : 'General',
    difficulty,
  };
  if (typeof q.blocksFigure === 'string' && q.blocksFigure.trim()) out.blocksFigure = q.blocksFigure;
  if (typeof q.sourceId === 'string' && q.sourceId) out.sourceId = q.sourceId;
  return out;
}

export type RevealMode = 'after_close' | 'after_submit' | 'never';

export interface QuizAssignmentConfig {
  /** How many graded attempts a student gets. */
  attemptsAllowed: number;
  /** Whole-quiz timer; null = untimed. */
  timerSeconds: number | null;
  /** Pass threshold in percent (0-100). */
  passThreshold: number;
  /** When students see correct answers + explanations. Default after_close —
   *  early finishers can't leak answers while classmates are still in the window. */
  revealMode: RevealMode;
}

const REVEAL_MODES: RevealMode[] = ['after_close', 'after_submit', 'never'];

export function normalizeQuizConfig(raw: unknown): QuizAssignmentConfig {
  const c = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const attempts = typeof c.attemptsAllowed === 'number' ? Math.round(c.attemptsAllowed) : 1;
  const timer = typeof c.timerSeconds === 'number' ? Math.round(c.timerSeconds) : null;
  const pass = typeof c.passThreshold === 'number' ? Math.round(c.passThreshold) : 60;
  return {
    attemptsAllowed: Math.min(10, Math.max(1, attempts)),
    timerSeconds: timer === null ? null : Math.min(7200, Math.max(30, timer)),
    passThreshold: Math.min(100, Math.max(0, pass)),
    revealMode: REVEAL_MODES.includes(c.revealMode as RevealMode) ? (c.revealMode as RevealMode) : 'after_close',
  };
}

/** Assignment window state, server and client share the same rule. */
export function windowState(
  opensAt: string | null,
  closesAt: string | null,
  now: Date = new Date(),
): 'upcoming' | 'open' | 'closed' {
  const t = now.getTime();
  if (opensAt && t < new Date(opensAt).getTime()) return 'upcoming';
  if (closesAt && t > new Date(closesAt).getTime()) return 'closed';
  return 'open';
}
