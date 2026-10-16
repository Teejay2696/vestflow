import { describe, it, expect, vi } from "vitest";
import { Account } from "@stellar/stellar-sdk";
import { VestflowClient } from "../src/client";

const ACCOUNT = "GDZ2GDLBPUCEXA3I5U7WN5E3CNQ3JBP5FK464EMLTHPCX6KVB5N4A4YT";

describe("estimateFee (#1096)", () => {
  it("returns the resource fee and total fee from a successful simulation", async () => {
    const client = new VestflowClient({ network: "testnet" });
    vi.spyOn((client as any).server, "getAccount").mockResolvedValue(
      new Account(ACCOUNT, "1")
    );
    vi.spyOn((client as any).server, "simulateTransaction").mockResolvedValue({
      minResourceFee: "12345",
    } as any);

    const result = await client.estimateFee({
      method: "getBalance",
      args: [],
      publicKey: ACCOUNT,
    });

    expect(result.resourceFee).toBe(12345n);
    expect(result.totalFee).toBe(12345n + 100n); // BASE_FEE = "100"
  });

  it("falls back to the placeholder account when publicKey is omitted", async () => {
    const client = new VestflowClient({ network: "testnet" });
    const getAccountSpy = vi
      .spyOn((client as any).server, "getAccount")
      .mockResolvedValue(new Account(ACCOUNT, "1"));
    vi.spyOn((client as any).server, "simulateTransaction").mockResolvedValue({
      minResourceFee: "0",
    } as any);

    await client.estimateFee({ method: "getBalance", args: [] });

    expect(getAccountSpy).toHaveBeenCalledWith(expect.any(String));
  });

  it("throws when the simulation fails", async () => {
    const client = new VestflowClient({ network: "testnet" });
    vi.spyOn((client as any).server, "getAccount").mockResolvedValue(
      new Account(ACCOUNT, "1")
    );
    vi.spyOn((client as any).server, "simulateTransaction").mockResolvedValue({
      error: "simulation failed: resource limit exceeded",
    } as any);

    await expect(
      client.estimateFee({ method: "getBalance", args: [], publicKey: ACCOUNT })
    ).rejects.toThrow(/simulation failed/i);
  });
});
