/**
 * Integration test for per-IP rate limiting middleware (#1109).
 *
 * Sends RATE_LIMIT_MAX + 1 requests from the same mock IP and verifies:
 *   - First N requests return 200.
 *   - The (N+1)th request returns 429.
 *   - A Retry-After header is present on the 429 response.
 *
 * Run with:
 *   node --import tsx/esm --test src/__tests__/rateLimiting.test.ts
 */

import { describe, it, before, after } from "node:test";
import assert from "node:assert/strict";
import type { Server } from "node:http";
import request from "supertest";

import { createApp } from "../app.js";
import { loadConfig } from "../config/env.js";
import { createLogger } from "../config/logger.js";

// Set a small rate limit so the test runs in milliseconds.
const RATE_LIMIT_MAX = 5;
const MOCK_IP = "203.0.113.1"; // TEST-NET-3 address — never a real client IP.

let server: Server;
let baseUrl: string;

before(async () => {
  // Stub required env vars with a minimal valid set.
  process.env["NODE_ENV"] = "test";
  process.env["STELLAR_NETWORK_PASSPHRASE"] = "Test SDF Network ; September 2015";
  process.env["STELLAR_RPC_URL"] = "https://soroban-testnet.stellar.org";
  process.env["VESTFLOW_CONTRACT_ID"] = "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAD2KM";
  process.env["RATE_LIMIT_MAX"] = String(RATE_LIMIT_MAX);
  process.env["RATE_LIMIT_WINDOW_MS"] = "60000";
  // Trust the X-Forwarded-For header so we can spoof the client IP in tests.
  process.env["TRUST_PROXY"] = "1";

  const config = loadConfig();
  const logger = createLogger(config);
  const app = createApp({ config, logger });

  await new Promise<void>((resolve) => {
    server = app.listen(0, "127.0.0.1", resolve);
  });

  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("unexpected server address");
  baseUrl = `http://127.0.0.1:${addr.port}`;
});

after(() => {
  server?.close();
});

describe("per-IP rate limiting middleware", () => {
  it("allows the first N requests to succeed", async () => {
    for (let i = 1; i <= RATE_LIMIT_MAX; i++) {
      const res = await request(baseUrl)
        .get("/health")
        .set("X-Forwarded-For", MOCK_IP);

      assert.equal(
        res.status,
        200,
        `Expected 200 on request ${i} but got ${res.status}`,
      );
    }
  });

  it("rejects the (N+1)th request with 429 and a Retry-After header", async () => {
    const res = await request(baseUrl)
      .get("/health")
      .set("X-Forwarded-For", MOCK_IP);

    assert.equal(res.status, 429, "Expected 429 on the over-limit request");
    assert.ok(
      res.headers["retry-after"] !== undefined,
      "Expected a Retry-After header on the 429 response",
    );
  });
});
