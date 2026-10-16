import { describe, it, expect } from "vitest";
import { formatXlm, formatRate } from "../src/utils";

describe("formatXlm (#1106)", () => {
  const MAX_I128 = (1n << 127n) - 1n;
  const MIN_I128 = -(1n << 127n);

  it("handles 0 stroops", () => {
    expect(formatXlm(0n)).toBe("0");
  });

  it("handles minimum positive value (1 stroop)", () => {
    expect(formatXlm(1n)).toBe("0.0000001");
  });

  it("handles exact whole XLM amounts", () => {
    expect(formatXlm(10_000_000n)).toBe("1");
  });

  it("trims trailing fractional zeros", () => {
    expect(formatXlm(15_000_000n)).toBe("1.5");
  });

  it("handles maximum i128 boundary value", () => {
    // 2^127 - 1 = 170141183460469231731687303715884105727
    const whole = MAX_I128 / 10_000_000n;
    const frac = (MAX_I128 % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
    const expected = frac.length > 0 ? `${whole}.${frac}` : whole.toString();
    expect(formatXlm(MAX_I128)).toBe(expected);
  });

  it("handles minimum i128 boundary value", () => {
    // -2^127 = -170141183460469231731687303715884105728
    const abs = -MIN_I128;
    const whole = abs / 10_000_000n;
    const frac = (abs % 10_000_000n).toString().padStart(7, "0").replace(/0+$/, "");
    const expected = frac.length > 0 ? `-${whole}.${frac}` : `-${whole}`;
    expect(formatXlm(MIN_I128)).toBe(expected);
  });

  it("handles negative whole amounts", () => {
    expect(formatXlm(-10_000_000n)).toBe("-1");
  });

  it("handles negative fractional amounts", () => {
    expect(formatXlm(-500_000n)).toBe("-0.05");
  });

  it("handles numeric string inputs", () => {
    expect(formatXlm("25000000")).toBe("2.5");
  });

  it("handles number inputs", () => {
    expect(formatXlm(10_000_000)).toBe("1");
  });
});

describe("formatRate periods (#1106)", () => {
  it("formats per-second rate ('sec')", () => {
    expect(formatRate(10_000_000n, "XLM", 7)).toBe("1 XLM / sec");
  });

  it("formats per-minute rate ('min')", () => {
    expect(formatRate(1n, "XLM", 7)).toBe("0.000006 XLM / min");
  });

  it("formats per-hour rate ('hour')", () => {
    expect(formatRate(1n, "TOK", 9)).toBe("0.000003 TOK / hour");
  });

  it("formats per-day rate ('day')", () => {
    expect(formatRate(0n, "XLM", 7)).toBe("0 XLM / day");
  });
});
