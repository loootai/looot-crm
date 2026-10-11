import { costOf, TERMINAL_STATUSES } from "./looot";
import { round6 } from "./jobs";
import type { Store } from "./store/types";
import type { Run } from "./types";

/** What reconciliation needs from looot: read a run again. LoootClient has it. */
export interface RunReader {
  getRun?: (runId: string) => Promise<{ status: string; actualCost?: number | string | null; error?: { code?: string; message?: string } | null }>;
}

/** true when a looot run has ended, so its cost is final. */
export const isTerminal = (status: string | undefined): boolean => TERMINAL_STATUSES.has(status ?? "");

export interface ReconcileResult {
  settled: number;
  released: number;
  kept: number;
}

/**
 * Resolves reservations that outlived their soft expiry, for example after a crash or a run that
 * stayed pending. For each one:
 *  - its run row already ended: the money is counted there, so the reservation is settled;
 *  - the looot run can be read and has ended: a completed run is written with its real cost and
 *    settled, a failed, blocked or stopped run is written at $0 and released;
 *  - the run is still pending, has no looot id or cannot be fetched: the reservation stays held
 *    until its hard expiry, then it is released.
 * A pending run is never written as failed and its budget is never handed back early.
 */
export async function reconcileReservations(deps: { store: Store; looot: RunReader; now: Date }): Promise<ReconcileResult> {
  const { store, looot, now } = deps;
  const out: ReconcileResult = { settled: 0, released: 0, kept: 0 };
  for (const r of await store.listExpiredReservations(now)) {
    const [row] = await store.all("runs", { idempotency_key: r.key });
    if (row && isTerminal(row.status ?? undefined)) {
      await store.settleReservation(r.key, now);
      out.settled++;
      continue;
    }
    const loootRunId = r.loootRunId ?? row?.looot_run_id ?? null;
    let remote: Awaited<ReturnType<NonNullable<RunReader["getRun"]>>> | null = null;
    if (loootRunId && looot.getRun) {
      try {
        remote = await looot.getRun(loootRunId);
      } catch {
        remote = null;
      }
    }
    if (remote && isTerminal(remote.status)) {
      const ok = remote.status === "completed";
      const cost = ok ? round6(Math.max(0, costOf(remote) ?? 0)) : 0;
      const patch: Partial<Run> = ok
        ? { looot_run_id: loootRunId, status: "completed", outcome: "no_result", cost_usd: cost, error: null, note: "Finished after the action ended. The result was not applied." }
        : { looot_run_id: loootRunId, status: remote.status, outcome: "failed", cost_usd: 0, error: remote.error?.message ?? `The run ended as ${remote.status}.` };
      if (row) await store.update("runs", row.id, patch);
      else await store.insert("runs", [{ action_id: r.actionId, job_id: r.jobId, idempotency_key: r.key, cap_usd: r.amountUsd, ...patch }]);
      if (cost > 0) {
        const action = await store.get("actions", r.actionId);
        if (action) await store.update("actions", action.id, { actual_usd: Math.min(action.max_cost_usd, round6(action.actual_usd + cost)) });
      }
      if (ok) {
        await store.settleReservation(r.key, now);
        out.settled++;
      } else {
        await store.releaseReservation(r.key, now);
        out.released++;
      }
      continue;
    }
    if (r.hardExpiresAt <= now.toISOString()) {
      await store.releaseReservation(r.key, now);
      out.released++;
    } else out.kept++;
  }
  return out;
}
