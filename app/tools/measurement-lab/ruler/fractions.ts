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

// ─── Target variety ───────────────────────────────────────────────────────────
//
// Picking a uniformly random tick at 1/16" precision gives sixteenths half the
// time and whole inches almost never (Charlie 2026-09-10: "they get into a
// pattern of sixteenths continuously"). Instead we rotate through the
// *kinds* of mark with a shuffle bag — every kind comes up once per cycle, in
// random order — then pick a random tick of that kind. The same value never
// repeats back-to-back.

export interface VarietyBag {
  classes: number[];   // the kinds available at this precision
  bag: number[];       // remaining kinds in the current shuffled cycle
  prev: number;        // last value dealt (ticks or mm), to avoid repeats
}

/** Inch kinds = simplified denominators present at a precision: 16 → [1,2,4,8,16]. */
export function inchClasses(prec: number): number[] {
  const out: number[] = [];
  for (let d = 1; d <= prec; d *= 2) out.push(d);
  return out;
}

/** Metric kinds by mm value: 10 = whole cm, 5 = half cm, 2 = even mm, 1 = odd mm. */
export function metricClasses(step: number): number[] {
  return step === 10 ? [10] : step === 5 ? [10, 5] : step === 2 ? [10, 2] : [10, 5, 2, 1];
}

export function makeBag(classes: number[]): VarietyBag {
  return { classes, bag: [], prev: -1 };
}

function drawClass(b: VarietyBag, rng: () => number): number {
  if (b.bag.length === 0) {
    const cycle = [...b.classes];
    for (let i = cycle.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cycle[i], cycle[j]] = [cycle[j], cycle[i]];
    }
    b.bag = cycle;
  }
  return b.bag.pop()!;
}

function pickFrom(b: VarietyBag, cands: number[], rng: () => number): number {
  const pool = cands.length > 1 ? cands.filter(c => c !== b.prev) : cands;
  const v = pool[Math.floor(rng() * pool.length)];
  b.prev = v;
  return v;
}

/** Simplified denominator of ticks/prec (whole inches → 1). */
export function inchClassOf(ticks: number, prec: number): number {
  return prec / gcd(ticks, prec);
}

export function metricClassOf(mm: number): number {
  return mm % 10 === 0 ? 10 : mm % 5 === 0 ? 5 : mm % 2 === 0 ? 2 : 1;
}

/** Next inch target in ticks (1 .. totalInches*prec-1) rotating through kinds. */
export function nextInchTicks(prec: number, totalInches: number, b: VarietyBag, rng: () => number = Math.random): number {
  const total = totalInches * prec;
  for (let guard = 0; guard < 8; guard++) {
    const cls = drawClass(b, rng);
    const cands: number[] = [];
    for (let t = 1; t < total; t++) if (inchClassOf(t, prec) === cls) cands.push(t);
    if (cands.length) return pickFrom(b, cands, rng);
  }
  return pickFrom(b, Array.from({ length: total - 1 }, (_, i) => i + 1), rng);
}

/** Next metric target in mm (step .. totalCm*10-step) rotating through kinds. */
export function nextMetricMm(step: number, totalCm: number, b: VarietyBag, rng: () => number = Math.random): number {
  const totalMm = totalCm * 10;
  for (let guard = 0; guard < 8; guard++) {
    const cls = drawClass(b, rng);
    const cands: number[] = [];
    for (let mm = step; mm < totalMm; mm += step) if (metricClassOf(mm) === cls) cands.push(mm);
    if (cands.length) return pickFrom(b, cands, rng);
  }
  const all: number[] = [];
  for (let mm = step; mm < totalMm; mm += step) all.push(mm);
  return pickFrom(b, all, rng);
}
