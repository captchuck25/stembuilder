import { describe, expect, it } from "vitest";
import { normalizeAssignmentConfig, isLeaderboardEligible, LEADERBOARD_SETTINGS } from "../app/tools/measurement-lab/constants";
import {
  inchClasses, metricClasses, makeBag, nextInchTicks, nextMetricMm, inchClassOf, metricClassOf,
} from "../app/tools/measurement-lab/ruler/fractions";

describe("normalizeAssignmentConfig · maxAttempts", () => {
  it("defaults to unlimited (null) so pre-existing assignments are unchanged", () => {
    expect(normalizeAssignmentConfig({}).maxAttempts).toBeNull();
    expect(normalizeAssignmentConfig({ maxAttempts: null }).maxAttempts).toBeNull();
    expect(normalizeAssignmentConfig({ maxAttempts: 0 }).maxAttempts).toBeNull();
    expect(normalizeAssignmentConfig({ maxAttempts: -3 }).maxAttempts).toBeNull();
    expect(normalizeAssignmentConfig({ maxAttempts: "junk" }).maxAttempts).toBeNull();
  });
  it("keeps a positive limit, accepts strings, caps at 20", () => {
    expect(normalizeAssignmentConfig({ maxAttempts: 3 }).maxAttempts).toBe(3);
    expect(normalizeAssignmentConfig({ maxAttempts: "2" }).maxAttempts).toBe(2);
    expect(normalizeAssignmentConfig({ maxAttempts: 99 }).maxAttempts).toBe(20);
  });
});

describe("leaderboard eligibility", () => {
  it("ruler board is Find · Inches · 1/16 only", () => {
    expect(LEADERBOARD_SETTINGS.ruler).toBeDefined();
    expect(isLeaderboardEligible("ruler", "inches", "16")).toBe(true);
    expect(isLeaderboardEligible("ruler", "inches", "2")).toBe(false);   // halves
    expect(isLeaderboardEligible("ruler", "inches", "8")).toBe(false);
    expect(isLeaderboardEligible("ruler", "inches-take", "16")).toBe(false); // Take
    expect(isLeaderboardEligible("ruler", "metric", "1")).toBe(false);
    expect(isLeaderboardEligible("ruler", "", "")).toBe(false);
  });
  it("tools without a rule accept any settings", () => {
    expect(isLeaderboardEligible("dial-caliper", "set", "mm")).toBe(true);
    expect(isLeaderboardEligible("triple-beam", "", "")).toBe(true);
  });
});

// deterministic rng for the variety tests
function lcg(seed: number) {
  let s = seed >>> 0;
  return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 2 ** 32; };
}

describe("target variety · inches", () => {
  it("lists the kinds present at each precision", () => {
    expect(inchClasses(2)).toEqual([1, 2]);
    expect(inchClasses(16)).toEqual([1, 2, 4, 8, 16]);
  });
  it("classifies ticks by simplified denominator", () => {
    expect(inchClassOf(16, 16)).toBe(1);  // 1"
    expect(inchClassOf(8, 16)).toBe(2);   // 1/2"
    expect(inchClassOf(12, 16)).toBe(4);  // 3/4"
    expect(inchClassOf(2, 16)).toBe(8);   // 1/8"
    expect(inchClassOf(5, 16)).toBe(16);  // 5/16"
  });
  it("at 1/16 rotates evenly through wholes, halves, quarters, eighths, sixteenths", () => {
    const rng = lcg(7);
    const bag = makeBag(inchClasses(16));
    const counts: Record<number, number> = {};
    const N = 500;
    for (let i = 0; i < N; i++) {
      const t = nextInchTicks(16, 6, bag, rng);
      expect(t).toBeGreaterThanOrEqual(1);
      expect(t).toBeLessThanOrEqual(95);
      counts[inchClassOf(t, 16)] = (counts[inchClassOf(t, 16)] ?? 0) + 1;
    }
    for (const cls of [1, 2, 4, 8, 16]) expect(counts[cls]).toBe(N / 5);
  });
  it("every cycle of 5 draws covers all 5 kinds (no long runs of one kind)", () => {
    const rng = lcg(11);
    const bag = makeBag(inchClasses(16));
    for (let cycle = 0; cycle < 40; cycle++) {
      const kinds = new Set<number>();
      for (let i = 0; i < 5; i++) kinds.add(inchClassOf(nextInchTicks(16, 6, bag, rng), 16));
      expect(kinds.size).toBe(5);
    }
  });
  it("never repeats the same value back-to-back", () => {
    const rng = lcg(3);
    const bag = makeBag(inchClasses(2)); // only 11 possible values → repeats would be likely
    let prev = -1;
    for (let i = 0; i < 300; i++) {
      const t = nextInchTicks(2, 6, bag, rng);
      expect(t).not.toBe(prev);
      prev = t;
    }
  });
});

describe("target variety · metric", () => {
  it("lists the kinds present at each step", () => {
    expect(metricClasses(10)).toEqual([10]);
    expect(metricClasses(5)).toEqual([10, 5]);
    expect(metricClasses(2)).toEqual([10, 2]);
    expect(metricClasses(1)).toEqual([10, 5, 2, 1]);
  });
  it("at 1 mm rotates evenly through whole cm, half cm, even mm, odd mm", () => {
    const rng = lcg(5);
    const bag = makeBag(metricClasses(1));
    const counts: Record<number, number> = {};
    const N = 400;
    for (let i = 0; i < N; i++) {
      const mm = nextMetricMm(1, 20, bag, rng);
      expect(mm).toBeGreaterThanOrEqual(1);
      expect(mm).toBeLessThanOrEqual(199);
      counts[metricClassOf(mm)] = (counts[metricClassOf(mm)] ?? 0) + 1;
    }
    for (const cls of [10, 5, 2, 1]) expect(counts[cls]).toBe(N / 4);
  });
  it("respects the step: 5 mm targets are multiples of 5, whole-cm targets multiples of 10", () => {
    const rng = lcg(9);
    const b5 = makeBag(metricClasses(5));
    for (let i = 0; i < 100; i++) expect(nextMetricMm(5, 20, b5, rng) % 5).toBe(0);
    const b10 = makeBag(metricClasses(10));
    for (let i = 0; i < 50; i++) expect(nextMetricMm(10, 20, b10, rng) % 10).toBe(0);
  });
});
