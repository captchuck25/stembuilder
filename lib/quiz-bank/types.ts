// Quiz Builder — curriculum question bank types (M0).
// The curriculum bank is code-side and read-only: teachers browse it in the
// builder, and picking a question copies it into the quiz's frozen snapshot.
// Teacher-authored questions live in the DB (teacher_questions), not here.

/** Labs with a quiz bank. Values match the `tool` strings used by /api/progress. */
export type QuizLab = 'electronics-lab' | 'block-lab' | 'code-lab-python';

export interface BankQuestion {
  /**
   * Stable id, referenced by quiz snapshots, forks, and future analytics —
   * never renumber or reuse one. Scheme: `<prefix>-u<unitIdx>-c<n>` for
   * questions absorbed from the in-lab curriculum quizzes (n = position in
   * that unit's quiz array), `<prefix>-u<unitIdx>-b<n>` for bank-only
   * questions. unitIdx is 0-based to match level_idx everywhere else.
   */
  id: string;
  lab: QuizLab;
  /** 0-based unit/level index into the lab's UNITS/LEVELS array. */
  unitIdx: number;
  /** Filter facet within a unit, e.g. "Conductors & insulators". */
  topic: string;
  /** 1 = recall, 2 = application, 3 = reasoning/multi-step. */
  difficulty: 1 | 2 | 3;
  question: string;
  /** Block Lab only: real-Blockly figure DSL (same as units.ts QuizQ.blocks),
   *  rendered between the question and the options. */
  blocksFigure?: string;
  options: [string, string, string, string];
  /** Index into options of the correct answer (display order is shuffled at render). */
  answer: 0 | 1 | 2 | 3;
  explanation: string;
}

/** Per-question metadata assigned when a unit's bank slice is authored. */
export interface CurriculumMeta {
  topic: string;
  difficulty: 1 | 2 | 3;
}
