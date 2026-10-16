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

const ACCOUNT = "GDZ2GDLBPUCEXA3I5U7WN5E3CNQ3JBP5FK464EMLTHPCX6KVB5N4A4YT";
const CONTRACT = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
const signer = vi.fn();

describe("splitAndCollect (#1095)", () => {
  beforeEach(() => {
    mockScValToNative.mockReset();
  });

  it("returns zero without submitting when nothing is collectable", async () => {
    const client = new VestflowClient({ network: "testnet" });
    const simulateSpy = vi
      .spyOn(client as any, "simulate")
      .mockResolvedValue({} as any);
    const submitSpy = vi.spyOn(client as any, "buildAndSend");
    mockScValToNative.mockReturnValue(0n);

    const result = await client.splitAndCollect(ACCOUNT, CONTRACT, signer);

    expect(result).toEqual({ collected: 0n, txHash: "" });
    expect(simulateSpy).toHaveBeenCalledWith(
      "collectable_amount",
      expect.any(Array),
      ACCOUNT
    );
    expect(submitSpy).not.toHaveBeenCalled();
  });

  it("sweeps and splits the collectable balance using the contract's current splits", async () => {
    const client = new VestflowClient({ network: "testnet" });
    const simulateSpy = vi.spyOn(client as any, "simulate");
    // First call: collectable_amount probe. Second call: splits view.
    simulateSpy
      .mockResolvedValueOnce({} as any)
      .mockResolvedValueOnce({} as any);
    mockScValToNative.mockReturnValueOnce(500n);
    const buildAndSendSpy = vi
      .spyOn(client as any, "buildAndSend")
      .mockResolvedValue("tx-hash-123");

    const result = await client.splitAndCollect(ACCOUNT, CONTRACT, signer);

    expect(result).toEqual({ collected: 500n, txHash: "tx-hash-123" });
    expect(simulateSpy).toHaveBeenNthCalledWith(
      1,
      "collectable_amount",
      expect.any(Array),
      ACCOUNT
    );
    expect(simulateSpy).toHaveBeenNthCalledWith(2, "splits", expect.any(Array), ACCOUNT);
    expect(buildAndSendSpy).toHaveBeenCalledWith(
      ACCOUNT,
      "split_collect",
      expect.any(Array),
      signer
    );
  });
});
