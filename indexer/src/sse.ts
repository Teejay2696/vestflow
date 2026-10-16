/**
 * VestFlow — Server-Sent Events hub
 *
 * Maintains the in-memory `walletAddress → Set<Response>` index of live SSE
 * connections. The poller and query server run as separate processes, so the
 * hub cannot observe an in-process "event indexed" callback; instead a fan-out
 * loop drains the `notifications` table (written by the poller) and streams
 * each new row to every connection registered for its wallet.
 *
 * This is the server-side-filtering fan-out described in the issue: an event
 * is only written to connections that actually belong to the affected wallet,
 * rather than broadcast to all clients and filtered client-side.
 */

import type http from "http";
import {
  getAllNotificationsSince,
  getMaxNotificationId,
  getNotificationsSince,
  type AppNotification,
} from "./app-notifications";
import {
  getCollectedEventsSince,
  getMaxCollectedEventRowid,
  onBalanceUpdate,
  type BalanceUpdateEvent,
} from "./db";

/** SSE frame writer — `id:` carries the global cursor, `data:` the JSON body. */
function writeSseEvent(res: http.ServerResponse, id: number, data: string): void {
  res.write(`id: ${id}\ndata: ${data}\n\n`);
}

const registry = new Map<string, Set<http.ServerResponse>>();
const MAX_BUFFERED_EVENTS = 100;

/** Number of live SSE responses across all wallets. */
export function connectionCount(): number {
  let count = 0;
  for (const set of registry.values()) count += set.size;
  return count;
}

/** Number of wallets with at least one live connection. */
export function registeredWalletCount(): number {
  return registry.size;
}

/**
 * Registers a connection for a wallet, replaying any events missed since
 * `lastEventId` before the live stream takes over. Removes the connection from
 * the registry when the response closes (no leak).
 */
export function registerStream(
  wallet: string,
  res: http.ServerResponse,
  lastEventId: number | null
): void {
  if (lastEventId != null) {
    const missed = getNotificationsSince(wallet, lastEventId);
    for (const notification of missed) {
      writeSseEvent(res, notification.id, JSON.stringify(notification));
    }
  }

  let set = registry.get(wallet);
  if (!set) {
    set = new Set();
    registry.set(wallet, set);
  }
  set.add(res);

  const cleanup = () => {
    set.delete(res);
    if (set.size === 0) {
      registry.delete(wallet);
    }
  };
  res.on("close", cleanup);
  res.on("error", cleanup);
}

/**
 * Writes a notification to every connection registered for its wallet.
 * Returns the number of connections that received the frame.
 */
export function broadcastToWallet(wallet: string, notification: AppNotification): number {
  const set = registry.get(wallet);
  if (!set || set.size === 0) return 0;

  const data = JSON.stringify(notification);
  for (const res of set) {
    try {
      writeSseEvent(res, notification.id, data);
    } catch {
      // The close/error listener will reap the dead connection.
    }
  }
  return set.size;
}

// ── Balance SSE stream (#1105) ────────────────────────────────────────

export interface BalanceSubscriber {
  res: http.ServerResponse;
  account: string | null;
  token: string | null;
}

const balanceRegistry = new Set<BalanceSubscriber>();

/**
 * Registers a connection for live balance updates for a given account/token.
 * When either is omitted, all balance updates match.
 */
export function registerBalanceStream(
  account: string | null,
  token: string | null,
  res: http.ServerResponse,
): void {
  const sub: BalanceSubscriber = { res, account, token };
  balanceRegistry.add(sub);

  const cleanup = () => {
    balanceRegistry.delete(sub);
  };
  res.on("close", cleanup);
  res.on("error", cleanup);
}

/** Number of live balance SSE connections. */
export function balanceConnectionCount(): number {
  return balanceRegistry.size;
}

/**
 * Broadcast a balance update to all matching subscribers.
 */
export function broadcastBalanceUpdate(event: {
  account: string;
  token: string;
  amount: string;
  total_collected?: string;
  ledger?: number;
}): number {
  let count = 0;
  const payload = JSON.stringify({
    event: "balance",
    event_type: "collected",
    ...event,
  });

  for (const sub of balanceRegistry) {
    if (sub.account && sub.account !== event.account) continue;
    if (sub.token && sub.token !== event.token) continue;
    try {
      sub.res.write(`data: ${payload}\n\n`);
      count++;
    } catch {
      // Reaped by close listener
    }
  }
  return count;
}

// Subscribe to in-process collected event notifications
onBalanceUpdate((event) => {
  broadcastBalanceUpdate(event);
});

// ── Fan-out loop ──────────────────────────────────────────────────────

let lastSeenId: number | null = null;
let lastSeenBalanceRowid: number | null = null;
let fanoutTimer: ReturnType<typeof setInterval> | null = null;
let lastHeartbeat = 0;

const FANOUT_INTERVAL_MS = Number(process.env.SSE_FANOUT_INTERVAL_MS ?? "200");
const HEARTBEAT_INTERVAL_MS = 15_000;

/** Drains new notifications for every wallet and heartbeats live connections. */
export function fanoutTick(): void {
  const now = Date.now();

  if (lastSeenId == null) {
    lastSeenId = getMaxNotificationId();
  }

  const batch = getAllNotificationsSince(lastSeenId, MAX_BUFFERED_EVENTS);
  for (const notification of batch) {
    broadcastToWallet(notification.wallet, notification);
    if (notification.id > lastSeenId) lastSeenId = notification.id;
  }

  // Poll for collect events inserted into DB
  if (lastSeenBalanceRowid == null) {
    lastSeenBalanceRowid = getMaxCollectedEventRowid();
  }
  const collectedEvents = getCollectedEventsSince(lastSeenBalanceRowid, 100);
  for (const ev of collectedEvents) {
    broadcastBalanceUpdate({
      account: ev.account,
      token: ev.token,
      amount: ev.amount,
      ledger: ev.ledger,
    });
    if (ev.rowid > lastSeenBalanceRowid) {
      lastSeenBalanceRowid = ev.rowid;
    }
  }

  if (now - lastHeartbeat >= HEARTBEAT_INTERVAL_MS) {
    lastHeartbeat = now;
    for (const set of registry.values()) {
      for (const res of set) {
        try {
          res.write(": ping\n\n");
        } catch {
          // Ignore — dead connections are reaped by the close listener.
        }
      }
    }
    for (const sub of balanceRegistry) {
      try {
        sub.res.write(": ping\n\n");
      } catch {
        // Ignore
      }
    }
  }
}

/** Starts the periodic fan-out/heartbeat loop (idempotent). */
export function startNotificationFanout(intervalMs = FANOUT_INTERVAL_MS): void {
  if (fanoutTimer) return;
  fanoutTimer = setInterval(fanoutTick, intervalMs);
  if (typeof fanoutTimer.unref === "function") fanoutTimer.unref();
}

/** Stops the fan-out loop and clears the registry (used by tests). */
export function stopNotificationFanout(): void {
  if (fanoutTimer) {
    clearInterval(fanoutTimer);
    fanoutTimer = null;
  }
  lastSeenId = null;
  lastSeenBalanceRowid = null;
  registry.clear();
  balanceRegistry.clear();
}
