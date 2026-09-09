// Pure helpers for the Ruler game (no React, no browser APIs) so the
// fraction/answer logic can be unit-tested and shared with TOOL_META.

export type RulerUnit = "inches" | "metric";
export type RulerTask = "find" | "take";

// Assignment configs store the ruler's unit + task in the single `mode`
// string. The Find values are the original "inches" / "metric" so every
// assignment created before Take mode existed keeps working unchanged.
export function encodeRulerMode(unit: RulerUnit, task: RulerTask): string {
  return task === "take" ? `${unit}-take` : unit;
}

export function decodeRulerMode(mode: string | null | undefined): { unit: RulerUnit; task: RulerTask } {
  const m = mode ?? "";
  return {
    unit: m.startsWith("metric") ? "metric" : "inches",
    task: m.endsWith("-take") ? "take" : "find",
  };
}

export function gcd(a: number, b: number): number { return b === 0 ? a : gcd(b, a % b); }

/** Simplified mixed-number label for `ticks` sixteenths/eighths/... e.g. 3 1/2" */
export function inchLabel(ticks: number, den: number): string {
  const w = Math.floor(ticks / den), n = ticks % den;
  if (n === 0) return `${w}"`;
  const g = gcd(n, den);
  const sn = n / g, sd = den / g;
  return w === 0 ? `${sn}/${sd}"` : `${w} ${sn}/${sd}"`;
}

/** "3 cm" / "3.5 cm" for a whole number of millimetres. */
export function cmLabel(mm: number): string {
  const cm = mm / 10;
  return cm % 1 === 0 ? `${cm} cm` : `${cm.toFixed(1)} cm`;
}

export interface TypedAnswer {
  value: number;   // inches (inch mode) or millimetres (metric mode)
  label: string;   // exactly what the student typed, formatted like a target label
}

// Take mode requires the reduced fraction: 3 8/16" for 3 1/2" is WRONG
// (Charlie's call, 2026-09-09 — simplifying is part of the skill). The page
// tells the student the value matched but the fraction wasn't simplified.
export const REQUIRE_SIMPLIFIED = true;

function intField(raw: string): number | null {
  const s = raw.trim();
  if (s === "") return 0;
  if (!/^\d+$/.test(s)) return null;
  return parseInt(s, 10);
}

/**
 * Parse the whole / numerator / denominator fields of an inch answer.
 * Returns null when the fields don't form a usable number (all empty,
 * non-integer text, or a fraction with a missing/zero denominator).
 */
export function parseInchInput(whole: string, num: string, den: string): TypedAnswer | null {
  const w = intField(whole), n = intField(num), d = intField(den);
  if (w === null || n === null || d === null) return null;
  const hasFrac = num.trim() !== "" || den.trim() !== "";
  if (!hasFrac && whole.trim() === "") return null;
  if (hasFrac && d === 0) return null;
  const value = w + (hasFrac ? n / d : 0);
  const label = hasFrac ? (w > 0 ? `${w} ${n}/${d}"` : `${n}/${d}"`) : `${w}"`;
  return { value, label };
}

/** Parse a centimetre reading ("3.7") into millimetres. */
export function parseCmInput(raw: string): TypedAnswer | null {
  const s = raw.trim().replace(",", ".");
  if (s === "" || !/^\d*\.?\d*$/.test(s) || s === ".") return null;
  const cm = parseFloat(s);
  if (!Number.isFinite(cm)) return null;
  return { value: Math.round(cm * 1000) / 100, label: `${parseFloat(cm.toFixed(2))} cm` };
}

export function isSimplified(num: string, den: string): boolean {
  const n = intField(num) ?? 0, d = intField(den) ?? 0;
  if (d === 0) return true;
  return n < d && gcd(n, d) === 1;
}

export type InchAnswerStatus = "correct" | "unsimplified" | "wrong";

/**
 * Grade a typed inch answer against a target in inches. "unsimplified" means
 * the value matches but the fraction is reducible or improper — counted as
 * wrong when REQUIRE_SIMPLIFIED is on, but worth its own feedback line.
 */
export function inchAnswerStatus(ans: TypedAnswer, targetIn: number, num: string, den: string): InchAnswerStatus {
  if (Math.abs(ans.value - targetIn) > 1e-6) return "wrong";
  return isSimplified(num, den) ? "correct" : "unsimplified";
}

export function inchAnswerCorrect(ans: TypedAnswer, targetIn: number, num: string, den: string): boolean {
  const st = inchAnswerStatus(ans, targetIn, num, den);
  return st === "correct" || (st === "unsimplified" && !REQUIRE_SIMPLIFIED);
}

/** Correctness for a typed cm answer against a target in millimetres. */
export function cmAnswerCorrect(ans: TypedAnswer, targetMm: number): boolean {
  return Math.abs(ans.value - targetMm) < 0.01;
}
