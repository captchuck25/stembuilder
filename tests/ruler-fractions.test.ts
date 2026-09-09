import { describe, expect, it } from "vitest";
import {
  encodeRulerMode, decodeRulerMode, inchLabel, cmLabel,
  parseInchInput, parseCmInput, inchAnswerCorrect, inchAnswerStatus, cmAnswerCorrect, isSimplified,
  REQUIRE_SIMPLIFIED,
} from "../app/tools/measurement-lab/ruler/fractions";

describe("ruler mode encoding", () => {
  it("keeps the pre-Take values for Find so old assignments still load", () => {
    expect(encodeRulerMode("inches", "find")).toBe("inches");
    expect(encodeRulerMode("metric", "find")).toBe("metric");
    expect(decodeRulerMode("inches")).toEqual({ unit: "inches", task: "find" });
    expect(decodeRulerMode("metric")).toEqual({ unit: "metric", task: "find" });
  });
  it("round-trips Take", () => {
    for (const unit of ["inches", "metric"] as const) {
      expect(decodeRulerMode(encodeRulerMode(unit, "take"))).toEqual({ unit, task: "take" });
    }
  });
  it("falls back to inches · find for junk", () => {
    expect(decodeRulerMode(undefined)).toEqual({ unit: "inches", task: "find" });
    expect(decodeRulerMode("")).toEqual({ unit: "inches", task: "find" });
    expect(decodeRulerMode("banana")).toEqual({ unit: "inches", task: "find" });
  });
});

describe("labels", () => {
  it("simplifies inch fractions", () => {
    expect(inchLabel(8, 16)).toBe('1/2"');
    expect(inchLabel(56, 16)).toBe('3 1/2"');
    expect(inchLabel(53, 16)).toBe('3 5/16"');
    expect(inchLabel(48, 16)).toBe('3"');
    expect(inchLabel(1, 2)).toBe('1/2"');
  });
  it("formats cm", () => {
    expect(cmLabel(30)).toBe("3 cm");
    expect(cmLabel(37)).toBe("3.7 cm");
    expect(cmLabel(5)).toBe("0.5 cm");
  });
});

describe("parseInchInput", () => {
  it("reads whole + fraction", () => {
    expect(parseInchInput("3", "5", "16")).toEqual({ value: 3 + 5 / 16, label: '3 5/16"' });
  });
  it("reads a bare fraction and a bare whole", () => {
    expect(parseInchInput("", "3", "4")).toEqual({ value: 0.75, label: '3/4"' });
    expect(parseInchInput("0", "3", "4")).toEqual({ value: 0.75, label: '3/4"' });
    expect(parseInchInput("4", "", "")).toEqual({ value: 4, label: '4"' });
  });
  it("rejects empty, non-numeric, and fraction with no denominator", () => {
    expect(parseInchInput("", "", "")).toBeNull();
    expect(parseInchInput("a", "", "")).toBeNull();
    expect(parseInchInput("3", "5", "")).toBeNull();
    expect(parseInchInput("3", "5", "0")).toBeNull();
    expect(parseInchInput("1.5", "", "")).toBeNull();
    expect(parseInchInput("-1", "", "")).toBeNull();
  });
  it("tolerates surrounding whitespace", () => {
    expect(parseInchInput(" 2 ", " 1", "2 ")).toEqual({ value: 2.5, label: '2 1/2"' });
  });
});

describe("inchAnswerCorrect", () => {
  const target = 3.5; // 3 1/2"
  it("accepts the simplified answer", () => {
    expect(inchAnswerCorrect(parseInchInput("3", "1", "2")!, target, "1", "2")).toBe(true);
  });
  it("requires the simplified fraction (Charlie: unsimplified is not correct)", () => {
    expect(REQUIRE_SIMPLIFIED).toBe(true);
    expect(inchAnswerCorrect(parseInchInput("3", "8", "16")!, target, "8", "16")).toBe(false);
    expect(inchAnswerCorrect(parseInchInput("", "7", "2")!, target, "7", "2")).toBe(false);
    expect(inchAnswerCorrect(parseInchInput("3", "2", "4")!, target, "2", "4")).toBe(false);
  });
  it("distinguishes unsimplified (right spot) from plain wrong for feedback", () => {
    expect(inchAnswerStatus(parseInchInput("3", "8", "16")!, target, "8", "16")).toBe("unsimplified");
    expect(inchAnswerStatus(parseInchInput("3", "1", "2")!, target, "1", "2")).toBe("correct");
    expect(inchAnswerStatus(parseInchInput("3", "7", "16")!, target, "7", "16")).toBe("wrong");
    // whole-number targets: "3" is correct; "3 0/16" and "2 16/16" are not simplified
    expect(inchAnswerStatus(parseInchInput("3", "", "")!, 3, "", "")).toBe("correct");
    expect(inchAnswerStatus(parseInchInput("3", "0", "16")!, 3, "0", "16")).toBe("unsimplified");
    expect(inchAnswerStatus(parseInchInput("2", "16", "16")!, 3, "16", "16")).toBe("unsimplified");
  });
  it("rejects a wrong reading", () => {
    expect(inchAnswerCorrect(parseInchInput("3", "7", "16")!, target, "7", "16")).toBe(false);
    expect(inchAnswerCorrect(parseInchInput("3", "", "")!, target, "", "")).toBe(false);
  });
  it("isSimplified detects reducible / improper fractions", () => {
    expect(isSimplified("1", "2")).toBe(true);
    expect(isSimplified("8", "16")).toBe(false);
    expect(isSimplified("7", "2")).toBe(false);
    expect(isSimplified("", "")).toBe(true);
  });
});

describe("metric take", () => {
  it("parses cm into mm", () => {
    expect(parseCmInput("3.7")).toEqual({ value: 37, label: "3.7 cm" });
    expect(parseCmInput("12")).toEqual({ value: 120, label: "12 cm" });
    expect(parseCmInput("0.5")).toEqual({ value: 5, label: "0.5 cm" });
    expect(parseCmInput("3,7")).toEqual({ value: 37, label: "3.7 cm" });
    expect(parseCmInput(".5")).toEqual({ value: 5, label: "0.5 cm" });
  });
  it("rejects junk", () => {
    expect(parseCmInput("")).toBeNull();
    expect(parseCmInput(".")).toBeNull();
    expect(parseCmInput("abc")).toBeNull();
    expect(parseCmInput("3.7cm")).toBeNull();
  });
  it("checks against a mm target", () => {
    expect(cmAnswerCorrect(parseCmInput("3.7")!, 37)).toBe(true);
    expect(cmAnswerCorrect(parseCmInput("3.70")!, 37)).toBe(true);
    expect(cmAnswerCorrect(parseCmInput("3.8")!, 37)).toBe(false);
    expect(cmAnswerCorrect(parseCmInput("37")!, 37)).toBe(false);
  });
});
