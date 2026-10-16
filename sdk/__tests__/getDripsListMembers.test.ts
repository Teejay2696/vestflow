import { describe, expect, it, vi, afterEach } from "vitest";
import { VestflowClient } from "../src/client";

afterEach(() => vi.unstubAllGlobals());

describe("getDripsListMembers", () => {
  it("maps members and pagination", async () => {
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ members: [{ address: "G1", joined_at: 42 }], next_cursor: "next" }),
    });
    vi.stubGlobal("fetch", fetch);
    const result = await new VestflowClient({ indexerUrl: "http://indexer.local" }).getDripsListMembers("7", { limit: 1 });
    expect(result).toEqual({ items: [{ address: "G1", joinedAt: 42 }], nextCursor: "next" });
    expect(fetch.mock.calls[0][0]).toContain("/lists/7/members");
  });

  it("returns an empty page", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, statusText: "OK", json: async () => ({ members: [] }) }));
    await expect(new VestflowClient({ indexerUrl: "http://indexer.local" }).getDripsListMembers("7")).resolves.toEqual({ items: [], nextCursor: undefined });
  });
});
