// Playwright + axe-core accessibility audit (#468)
//
// Runs an automated axe-core scan against the dashboard and create-schedule
// pages to catch missing ARIA labels, contrast issues, and keyboard
// navigation gaps that manual testing tends to miss.
//
// Run:
//   npx playwright test e2e/accessibility.spec.ts

import { test, expect } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { Keypair } from "@stellar/stellar-sdk";
import { MOCK_PUBLIC_KEY, mockFreighterAndRpc } from "./fixtures/sorobanMock";

const NATIVE_TOKEN = "CDLZFC3SYJYDZT7K67VZ75HPJVIEUVNIXF47ZG2FB2RMQQVU2HHGCYSC";
/** Fixed stream open time (2026-01-01T00:00:00Z) so the run is deterministic. */
const OPENED_AT = Date.UTC(2026, 0, 1) / 1000;

test.describe("Accessibility audit", () => {
  test("dashboard page has no detectable a11y violations", async ({ page }) => {
    await page.goto("/app");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  // #1102: the audit above hits the disconnected empty state. A wallet with
  // an active incoming stream renders the schedule table, role filter tabs,
  // and QR button that the empty state never exercises, so it needs its own
  // pass.
  test("dashboard page with a connected wallet and an active stream has no detectable a11y violations", async ({
    page,
  }) => {
    await mockFreighterAndRpc(page, "https://soroban-testnet.stellar.org/**", {
      ledgerTime: OPENED_AT,
      stream: {
        id: 1,
        grantor: Keypair.random().publicKey(),
        beneficiary: MOCK_PUBLIC_KEY,
        token: NATIVE_TOKEN,
        ratePerSecond: 1_000n,
        startTime: OPENED_AT,
        duration: 30 * 86_400,
      },
    });
    await page.clock.setFixedTime(OPENED_AT * 1000);
    // Skip the first-visit onboarding tour so its overlay can't intercept the scan.
    await page.addInitScript(() => localStorage.setItem("vestflow-tour-completed", "true"));

    await page.goto("/app");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });

  test("create schedule form has no detectable a11y violations", async ({ page }) => {
    await page.goto("/app/create");

    const results = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"])
      .analyze();

    expect(results.violations, formatViolations(results.violations)).toEqual([]);
  });
});

// axe's default failure message doesn't surface which rule/node failed —
// print a compact summary so a CI failure is actionable without re-running
// the report locally.
function formatViolations(violations: import("axe-core").Result[]): string {
  if (violations.length === 0) return "";
  return violations
    .map(
      (v) =>
        `\n[${v.impact}] ${v.id}: ${v.description}\n  ${v.helpUrl}\n  nodes: ${v.nodes
          .map((n) => n.target.join(" "))
          .join(", ")}`,
    )
    .join("\n");
}
