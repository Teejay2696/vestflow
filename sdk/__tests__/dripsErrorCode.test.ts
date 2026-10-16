import { describe, expect, it } from "vitest";
import { DripsErrorCode, parseDripsErrorCode } from "../src/utils";

describe("DripsErrorCode", () => {
  it("maps every contract code", () => {
    expect(Object.keys(DripsErrorCode)).toHaveLength(76);
    expect(parseDripsErrorCode(new Error("Contract error: 35"))).toBe(DripsErrorCode.WeightTooLarge);
    expect(parseDripsErrorCode(new Error("Contract, #15"))).toBe(DripsErrorCode.DurationTooShort);
  });
});
