import { describe, expect, it, vi, afterEach } from "vitest";
import { VestflowClient } from "../src/client";

afterEach(() => vi.unstubAllGlobals());

describe("getTokenList", () => {
  it("maps supported tokens", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({ tokens: [{ address: "C1", display_name: "USD" }] }) }));
    await expect(new VestflowClient({ indexerUrl: "http://indexer.local" }).getTokenList()).resolves.toEqual([{ address: "C1", displayName: "USD" }]);
  });

  it("fails soft when the indexer is unavailable", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));
    await expect(new VestflowClient({ indexerUrl: "http://indexer.local" }).getTokenList()).resolves.toEqual([]);
  });
});
