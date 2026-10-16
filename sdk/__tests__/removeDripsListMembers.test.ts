import { describe, it, expect, vi } from "vitest";
import { VestflowClient } from "../src/client";

const OWNER = "GDZ2GDLBPUCEXA3I5U7WN5E3CNQ3JBP5FK464EMLTHPCX6KVB5N4A4YT";
const MEMBER_A = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const MEMBER_B = "GAJF7BVLF24FS4U5BHGAMF22FREYRQPYSILHVGHNSH2W4ZV3ESK4AJFC";
const signer = vi.fn();

describe("removeDripsListMembers (#1093)", () => {
  it("submits one remove_from_drips_list operation per address in a single transaction", async () => {
    const client = new VestflowClient({ network: "testnet" });
    const spy = vi
      .spyOn(client as any, "submitAndSettleMulti")
      .mockResolvedValue({ hash: "def456", status: "SUCCESS" });

    const result = await client.removeDripsListMembers(OWNER, 1, [MEMBER_A, MEMBER_B], signer);

    expect(result).toEqual({ hash: "def456", status: "SUCCESS" });
    expect(spy).toHaveBeenCalledWith(
      OWNER,
      [
        { method: "remove_from_drips_list", args: expect.any(Array) },
        { method: "remove_from_drips_list", args: expect.any(Array) },
      ],
      signer
    );
  });

  it("throws when owner is not a valid Stellar public key", async () => {
    const client = new VestflowClient({ network: "testnet" });
    await expect(
      client.removeDripsListMembers("not-an-address", 1, [MEMBER_A], signer)
    ).rejects.toThrow(/owner/i);
  });

  it("throws when addresses is empty", async () => {
    const client = new VestflowClient({ network: "testnet" });
    await expect(
      client.removeDripsListMembers(OWNER, 1, [], signer)
    ).rejects.toThrow(/addresses/i);
  });

  it("throws when an address is invalid", async () => {
    const client = new VestflowClient({ network: "testnet" });
    await expect(
      client.removeDripsListMembers(OWNER, 1, [MEMBER_A, "not-an-address"], signer)
    ).rejects.toThrow(/addresses\[1\]/);
  });

  it("propagates a non-owner rejection from the contract", async () => {
    const client = new VestflowClient({ network: "testnet" });
    vi.spyOn(client as any, "submitAndSettleMulti").mockRejectedValue(
      new Error("Not owner")
    );

    await expect(
      client.removeDripsListMembers(OWNER, 1, [MEMBER_A], signer)
    ).rejects.toThrow(/not owner/i);
  });
});
