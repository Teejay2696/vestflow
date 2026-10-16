import { describe, it, expect, vi, beforeEach } from "vitest";

const mockScValToNative = vi.fn();

vi.mock("@stellar/stellar-sdk", async (importOriginal) => {
  const actual = await importOriginal<any>();
  return {
    ...actual,
    scValToNative: mockScValToNative,
  };
});

const { VestflowClient } = await import("../src/client");

describe("version (#1094)", () => {
  beforeEach(() => {
    mockScValToNative.mockReset();
  });

  it("returns the version string from the contract's version view", async () => {
    const client = new VestflowClient({ network: "testnet" });
    const simulateSpy = vi
      .spyOn(client as any, "simulate")
      .mockResolvedValue({} as any);
    mockScValToNative.mockReturnValue("1.4.0");

    const result = await client.version();

    expect(simulateSpy).toHaveBeenCalledWith("version", []);
    expect(result).toBe("1.4.0");
  });

  it("propagates a simulation error", async () => {
    const client = new VestflowClient({ network: "testnet" });
    vi.spyOn(client as any, "simulate").mockRejectedValue(
      new Error("simulation failed")
    );

    await expect(client.version()).rejects.toThrow(/simulation failed/i);
  });
});
