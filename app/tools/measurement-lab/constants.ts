// Server-safe measurement-lab constants: imported by both the client shared
// module (shared.tsx) and the API routes (which cannot import a "use client"
// file). Keep this file free of React and browser APIs.

export type MeasTool = "ruler" | "dial-caliper" | "graduated-cylinder" | "triple-beam";

export const MEAS_TOOL_IDS: MeasTool[] = ["ruler", "dial-caliper", "graduated-cylinder", "triple-beam"];

export function isMeasTool(v: unknown): v is MeasTool {
  return typeof v === "string" && (MEAS_TOOL_IDS as string[]).includes(v);
}

export interface AssignmentConfig {
  mode: string;
  precision: string;
  questionCount: number;
  timerSeconds: number | null;
  passThreshold: number;
  maxAttempts: number | null;   // null = unlimited retakes
  // "goal": pass/fail against passThreshold (original). "score": no goal —
  // the teacher just records how each student did (quiz-grade style).
  scoring: "goal" | "score";
}

export function normalizeAssignmentConfig(raw: Record<string, unknown> | null | undefined): AssignmentConfig {
  const cfg = raw ?? {};
  const num = (v: unknown, fallback: number) => {
    const n = typeof v === "string" ? parseInt(v, 10) : typeof v === "number" ? v : NaN;
    return Number.isFinite(n) ? n : fallback;
  };
  const questionCount = Math.min(20, Math.max(5, num(cfg.questionCount, 10)));
  const timerRaw = num(cfg.timerSeconds, 0);
  const maxRaw = num(cfg.maxAttempts, 0);
  return {
    mode: typeof cfg.mode === "string" ? cfg.mode : "read",
    precision: typeof cfg.precision === "string" ? cfg.precision : String(cfg.precision ?? ""),
    questionCount,
    timerSeconds: timerRaw > 0 ? Math.min(120, timerRaw) : null,
    passThreshold: Math.min(questionCount, Math.max(1, num(cfg.passThreshold, Math.ceil(questionCount * 0.8)))),
    maxAttempts: maxRaw > 0 ? Math.min(20, maxRaw) : null,
    scoring: cfg.scoring === "score" ? "score" : "goal",
  };
}

// Sprint leaderboard eligibility. A tool listed here only records sprint
// bests played at exactly these settings (Charlie 2026-09-10: the ruler board
// must be Find · Inches · 1/16" only — no whole-inch scores). Tools not listed
// accept any settings. Enforced in /api/measurement-runs and mirrored on the
// client so the student is told up front when a run won't count.
export const LEADERBOARD_SETTINGS: Partial<Record<MeasTool, { mode: string; precision: string; label: string }>> = {
  ruler: { mode: "inches", precision: "16", label: 'Find · Inches · 1/16"' },
};

export function isLeaderboardEligible(tool: MeasTool, mode: string, precision: string): boolean {
  const req = LEADERBOARD_SETTINGS[tool];
  if (!req) return true;
  return mode === req.mode && precision === req.precision;
}

// Hard sanity ceiling for client-reported sprint scores: 60s at the top tier
// (50 pts × ×3 combo) could not exceed ~60 answers even with zero think time.
export const MAX_SPRINT_POINTS = 9000;
