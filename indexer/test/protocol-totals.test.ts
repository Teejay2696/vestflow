import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `vestflow-totals-${process.pid}-${Date.now()}-`));
const dbPath = path.join(tempDir, "testnet.db");
process.env.INDEXER_DB_PATH_TESTNET = dbPath;

const { getDb, insertEvent } = await import("../src/db");
const { createServer } = await import("../src/server");

const TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXS7Q2QVSBQZBCO7T3WHNM7GC";
const GRANTOR = "GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ";
const BENEFICIARY_1 = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";
const BENEFICIARY_2 = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";

describe("GET /analytics/protocol/totals (#1104)", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const db = getDb("testnet");
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("returns zeroes on empty DB with five-field assertion", async () => {
    const res = await fetch(`${baseUrl}/analytics/protocol/totals`);
    expect(res.status).toBe(200);

    const data = await res.json();
    expect(data).toEqual({
      total_created: "0",
      total_claimed: "0",
      total_revoked_unvested: "0",
      total_value_locked: "0",
      active_schedules: 0,
    });

    // Explicit five-field assertion
    expect(data).toHaveProperty("total_created", "0");
    expect(data).toHaveProperty("total_claimed", "0");
    expect(data).toHaveProperty("total_revoked_unvested", "0");
    expect(data).toHaveProperty("total_value_locked", "0");
    expect(data).toHaveProperty("active_schedules", 0);
  });

  it("seeds the test DB with known events and matches returned totals across all five fields", async () => {
    // Seed schedule 1: created 1000 stroops
    insertEvent({
      id: "evt-create-1",
      event_type: "schedule_created",
      ledger: 10,
      ledger_closed_at: "2026-08-01T00:00:00Z",
      schedule_id: 1,
      proposal_id: null,
      grantor: GRANTOR,
      beneficiary: BENEFICIARY_1,
      amount: "1000",
      created_amount: "1000",
      token: TOKEN,
      start_time: 1700000000,
      duration: 1000,
      cliff_duration: 0,
      vesting_kind: "linear",
      raw_topics: "[]",
      raw_value: "{}",
    }, "testnet");

    // Seed schedule 1 claim: 300 stroops claimed
    insertEvent({
      id: "evt-claim-1",
      event_type: "claimed",
      ledger: 20,
      ledger_closed_at: "2026-08-02T00:00:00Z",
      schedule_id: 1,
      proposal_id: null,
      grantor: GRANTOR,
      beneficiary: BENEFICIARY_1,
      amount: "300",
      created_amount: null,
      token: TOKEN,
      start_time: null,
      duration: null,
      cliff_duration: null,
      vesting_kind: null,
      raw_topics: "[]",
      raw_value: "{}",
    }, "testnet");

    // Seed schedule 2: created 2000 stroops
    insertEvent({
      id: "evt-create-2",
      event_type: "schedule_created",
      ledger: 30,
      ledger_closed_at: "2026-08-03T00:00:00Z",
      schedule_id: 2,
      proposal_id: null,
      grantor: GRANTOR,
      beneficiary: BENEFICIARY_2,
      amount: "2000",
      created_amount: "2000",
      token: TOKEN,
      start_time: 1700000000,
      duration: 1000,
      cliff_duration: 0,
      vesting_kind: "linear",
      raw_topics: "[]",
      raw_value: "{}",
    }, "testnet");

    // Seed schedule 2 revoke: revoked with 500 unvested stroops returned
    // raw_value is JSON array where $[1] is unvested amount
    insertEvent({
      id: "evt-revoke-2",
      event_type: "revoked",
      ledger: 40,
      ledger_closed_at: "2026-08-04T00:00:00Z",
      schedule_id: 2,
      proposal_id: null,
      grantor: GRANTOR,
      beneficiary: BENEFICIARY_2,
      amount: null,
      created_amount: null,
      token: TOKEN,
      start_time: null,
      duration: null,
      cliff_duration: null,
      vesting_kind: null,
      raw_topics: "[]",
      raw_value: JSON.stringify(["claimed_so_far", "500"]),
    }, "testnet");

    const res = await fetch(`${baseUrl}/analytics/protocol/totals`);
    expect(res.status).toBe(200);

    const data = await res.json();

    // Calculations:
    // total_created: 1000 + 2000 = 3000
    // total_claimed: 300
    // total_revoked_unvested: 500
    // total_value_locked: 3000 - 300 - 500 = 2200
    // active_schedules: 1 (schedule 1 is active, schedule 2 is revoked)
    expect(data.total_created).toBe("3000");
    expect(data.total_claimed).toBe("300");
    expect(data.total_revoked_unvested).toBe("500");
    expect(data.total_value_locked).toBe("2200");
    expect(data.active_schedules).toBe(1);

    expect(data).toEqual({
      total_created: "3000",
      total_claimed: "300",
      total_revoked_unvested: "500",
      total_value_locked: "2200",
      active_schedules: 1,
    });
  });
});
