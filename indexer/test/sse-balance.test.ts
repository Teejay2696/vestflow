import fs from "fs";
import http from "http";
import os from "os";
import path from "path";
import type { AddressInfo } from "net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), `vestflow-sse-bal-${process.pid}-${Date.now()}-`));
const dbPath = path.join(tempDir, "testnet.db");
process.env.INDEXER_DB_PATH_TESTNET = dbPath;

const { getDb, insertEvent } = await import("../src/db");
const sse = await import("../src/sse");
const { createServer } = await import("../src/server");

const TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXS7Q2QVSBQZBCO7T3WHNM7GC";
const BENEFICIARY = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

async function waitFor(condition: () => boolean, timeoutMs = 3000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) {
      throw new Error("Timed out waiting for condition");
    }
    await new Promise((resolve) => setTimeout(resolve, 30));
  }
}

describe("SSE /sse/balance integration (#1105)", () => {
  let server: http.Server;
  let baseUrl: string;

  beforeAll(async () => {
    server = createServer();
    await new Promise<void>((resolve) => server.listen(0, resolve));
    baseUrl = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    sse.startNotificationFanout(100);
  });

  afterAll(async () => {
    sse.stopNotificationFanout();
    if (server) {
      server.closeAllConnections?.();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
    const db = getDb("testnet");
    db.close();
    fs.rmSync(tempDir, { recursive: true, force: true });
  });

  it("establishes SSE connection, receives collect event update within 3 seconds, and closes cleanly on disconnect", async () => {
    const chunks: string[] = [];
    let isConnected = false;
    let statusCode = 0;
    let contentType = "";

    const req = http.request(
      `${baseUrl}/sse/balance?account=${BENEFICIARY}&token=${TOKEN}`,
      (res) => {
        statusCode = res.statusCode ?? 0;
        contentType = res.headers["content-type"] ?? "";
        isConnected = true;
        res.setEncoding("utf8");
        res.on("data", (chunk: string) => {
          chunks.push(chunk);
        });
      },
    );
    req.end();

    // 1. Acceptance Criterion: SSE connection established
    await waitFor(() => isConnected);
    expect(statusCode).toBe(200);
    expect(contentType).toContain("text/event-stream");
    expect(sse.balanceConnectionCount()).toBe(1);

    // Initial retry hint
    await waitFor(() => chunks.some((c) => c.includes("retry: 1000")));

    // 2. Acceptance Criterion: Event received after DB insert within 3 seconds
    const insertStartTime = Date.now();
    insertEvent({
      id: "evt-col-1",
      event_type: "collected",
      ledger: 101,
      ledger_closed_at: "2026-08-10T12:00:00Z",
      schedule_id: null,
      proposal_id: null,
      grantor: null,
      beneficiary: BENEFICIARY,
      amount: "15000000",
      created_amount: null,
      token: TOKEN,
      start_time: null,
      duration: null,
      cliff_duration: null,
      vesting_kind: null,
      raw_topics: "[]",
      raw_value: "{}",
    }, "testnet");

    // Must emit within 3 seconds
    await waitFor(
      () => chunks.some((c) => c.includes("15000000") && c.includes(BENEFICIARY)),
      3000,
    );
    const elapsed = Date.now() - insertStartTime;
    expect(elapsed).toBeLessThanOrEqual(3000);

    const fullPayload = chunks.join("");
    expect(fullPayload).toContain(BENEFICIARY);
    expect(fullPayload).toContain(TOKEN);
    expect(fullPayload).toContain("15000000");

    // 3. Acceptance Criterion: Connection closes cleanly on client disconnect
    req.destroy();

    await waitFor(() => sse.balanceConnectionCount() === 0, 1000);
    expect(sse.balanceConnectionCount()).toBe(0);
  });
});
