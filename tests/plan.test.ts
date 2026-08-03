import { describe, it, expect } from "vitest";
import {
  effectivePlan,
  studentCap,
  canAddStudents,
  defaultTrialEnd,
  buildUsage,
  isCapError,
  STUDENT_JOIN_BLOCKED_MESSAGE,
  CAP_ERROR_TOKEN,
} from "@/lib/plan";
import { FREE_STUDENT_CAP, PRO_STUDENT_CAP } from "@/lib/marketing/pricing";

const NOW = new Date("2026-08-03T12:00:00Z");

describe("effectivePlan", () => {
  it("free and pro pass through", () => {
    expect(effectivePlan("free", null, NOW)).toBe("free");
    expect(effectivePlan("pro", null, NOW)).toBe("pro");
  });
  it("active trial stays pro_trial", () => {
    expect(effectivePlan("pro_trial", "2027-06-30T23:59:59Z", NOW)).toBe("pro_trial");
  });
  it("expired trial behaves as free", () => {
    expect(effectivePlan("pro_trial", "2026-06-30T23:59:59Z", NOW)).toBe("free");
  });
  it("trial with no end date behaves as free (defensive)", () => {
    expect(effectivePlan("pro_trial", null, NOW)).toBe("free");
  });
});

describe("studentCap", () => {
  it("free = 50", () => expect(studentCap("free")).toBe(50));
  it("trial = 125 with no overage", () => expect(studentCap("pro_trial", 3)).toBe(125));
  it("pro = 125", () => expect(studentCap("pro")).toBe(125));
  it("pro overage adds 25 per block ($10/block)", () => {
    expect(studentCap("pro", 1)).toBe(150);
    expect(studentCap("pro", 2)).toBe(175);
  });
  it("negative blocks are clamped", () => expect(studentCap("pro", -4)).toBe(125));
  it("caps match the published pricing page numbers", () => {
    expect(studentCap("free")).toBe(FREE_STUDENT_CAP);
    expect(studentCap("pro")).toBe(PRO_STUDENT_CAP);
  });
});

describe("canAddStudents — free cap boundaries", () => {
  it("a free teacher can reach exactly 50", () => {
    expect(canAddStudents(49, 1, 50)).toBe(true);
  });
  it("the 51st join is blocked", () => {
    expect(canAddStudents(50, 1, 50)).toBe(false);
  });
  it("a batch that would cross the cap is blocked", () => {
    expect(canAddStudents(45, 6, 50)).toBe(false);
    expect(canAddStudents(45, 5, 50)).toBe(true);
  });
  it("pro boundaries at 125", () => {
    expect(canAddStudents(124, 1, 125)).toBe(true);
    expect(canAddStudents(125, 1, 125)).toBe(false);
  });
});

describe("defaultTrialEnd — end of current school year (~June 30)", () => {
  it("during the school year → the coming June 30", () => {
    expect(defaultTrialEnd(new Date("2026-08-03T12:00:00Z")).toISOString()).toMatch(/^2027-06-30/);
    expect(defaultTrialEnd(new Date("2027-02-01T12:00:00Z")).toISOString()).toMatch(/^2027-06-30/);
  });
  it("on June 30 itself → that same June 30", () => {
    expect(defaultTrialEnd(new Date("2027-06-30T08:00:00Z")).toISOString()).toMatch(/^2027-06-30/);
  });
  it("just after June 30 → next year's", () => {
    expect(defaultTrialEnd(new Date("2027-07-01T00:00:00Z")).toISOString()).toMatch(/^2028-06-30/);
  });
});

describe("buildUsage", () => {
  const base = {
    plan: "free" as const,
    proTrialStartedAt: null,
    proTrialEndsAt: null,
    overageBlocks: 0,
    institutional: false,
    now: NOW,
  };

  it("institutional teachers are uncapped (cap null, never atCap)", () => {
    const u = buildUsage({ ...base, institutional: true, count: 10_000 });
    expect(u.cap).toBeNull();
    expect(u.atCap).toBe(false);
  });
  it("a free teacher at 50 is atCap", () => {
    const u = buildUsage({ ...base, count: 50 });
    expect(u.cap).toBe(50);
    expect(u.atCap).toBe(true);
  });
  it("a free teacher at 49 is not atCap", () => {
    expect(buildUsage({ ...base, count: 49 }).atCap).toBe(false);
  });
  it("an expired trial reports effective free with the free cap", () => {
    const u = buildUsage({
      ...base,
      plan: "pro_trial",
      proTrialStartedAt: "2026-01-10T00:00:00Z",
      proTrialEndsAt: "2026-06-30T23:59:59Z",
      count: 60,
    });
    expect(u.effective).toBe("free");
    expect(u.cap).toBe(50);
    expect(u.atCap).toBe(true);
    expect(u.trialUsed).toBe(true);
  });
  it("trialUsed reflects pro_trial_started_at so the trial is one-time", () => {
    expect(buildUsage({ ...base, count: 0 }).trialUsed).toBe(false);
    expect(
      buildUsage({ ...base, proTrialStartedAt: "2026-01-10T00:00:00Z", count: 0 }).trialUsed,
    ).toBe(true);
  });
});

describe("cap error plumbing", () => {
  it("the student-facing refusal is the spec'd message", () => {
    expect(STUDENT_JOIN_BLOCKED_MESSAGE).toBe("This class is full — ask your teacher.");
  });
  it("recognizes the 0018 trigger error and nothing else", () => {
    expect(isCapError(`P0001: ${CAP_ERROR_TOKEN}`)).toBe(true);
    expect(isCapError("duplicate key value violates unique constraint")).toBe(false);
    expect(isCapError(null)).toBe(false);
    expect(isCapError(undefined)).toBe(false);
  });
});
