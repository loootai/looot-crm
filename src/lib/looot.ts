import "server-only";
/** Error from the looot API, with the HTTP status and looot's error code when there is one. */
export class LoootError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
  ) {
    super(message);
    this.name = "LoootError";
  }
}

export interface LoootRun {
  runId: string;
  status: string;
  result?: unknown;
  normalized?: Record<string, unknown> | null;
  outcome?: string;
  actualCost?: number | string | null;
  error?: { code?: string; message?: string } | null;
}

export const TERMINAL_STATUSES = new Set(["completed", "failed", "blocked", "stopped"]);

export interface LoootClientOptions {
  token: string;
  baseUrl?: string;
  fetch?: typeof fetch;
  /** How long to keep polling a run that is still queued or running. */
  pollTimeoutMs?: number;
  pollIntervalMs?: number;
  sleep?: (ms: number) => Promise<void>;
}

/** Server-only client for the two looot calls this app makes: run a job, read a run. */
export class LoootClient {
  readonly #token: string;
  readonly #baseUrl: string;
  readonly #fetch: typeof fetch;
  readonly #pollTimeoutMs: number;
  readonly #pollIntervalMs: number;
  readonly #sleep: (ms: number) => Promise<void>;

  constructor(opts: LoootClientOptions) {
    this.#token = opts.token;
    this.#baseUrl = (opts.baseUrl ?? "https://api.looot.ai").replace(/\/+$/, "");
    this.#fetch = opts.fetch ?? fetch;
    this.#pollTimeoutMs = opts.pollTimeoutMs ?? 60_000;
    this.#pollIntervalMs = opts.pollIntervalMs ?? 2_000;
    this.#sleep = opts.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  async #request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.#fetch(`${this.#baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.#token}`,
        Accept: "application/json",
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let json: unknown = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch {
      json = null;
    }
    if (!res.ok) {
      const err = (json as { error?: { message?: string; code?: string } } | null)?.error;
      throw new LoootError(err?.message ?? `looot returned HTTP ${res.status}`, res.status, err?.code);
    }
    return json as T;
  }

  /**
   * Paid. Runs `job:<id>` with provider fallback, capped at maxCostUsd for the whole route.
   * The same idempotency key replays the stored run and never charges twice.
   */
  run(jobId: string, input: Record<string, unknown>, idempotencyKey: string, maxCostUsd: number): Promise<LoootRun> {
    return this.#request("POST", "/v1/runs?wait=30", {
      endpointId: `job:${jobId}`,
      input,
      idempotencyKey,
      fallback: { maxAttempts: 3, maxCostUsd },
    });
  }

  /** Free. Reads a run again. */
  getRun(runId: string): Promise<LoootRun> {
    return this.#request("GET", `/v1/runs/${encodeURIComponent(runId)}`);
  }

  /** Free. Reads the prepaid balance in dollars, or null when the answer has no number this app recognizes. */
  async balance(): Promise<number | null> {
    const body = await this.#request<unknown>("GET", "/v1/balance");
    return readBalance(body);
  }

  /** Runs a job and polls until the run ends or the poll timeout passes. */
  async runAndWait(jobId: string, input: Record<string, unknown>, idempotencyKey: string, maxCostUsd: number): Promise<LoootRun> {
    let run = await this.run(jobId, input, idempotencyKey, maxCostUsd);
    const deadline = Date.now() + this.#pollTimeoutMs;
    while (!TERMINAL_STATUSES.has(run.status) && Date.now() < deadline) {
      await this.#sleep(this.#pollIntervalMs);
      run = await this.getRun(run.runId);
    }
    return run;
  }
}

/** Builds a client from LOOOT_TOKEN. Throws when the token is missing. */
export function loootFromEnv(env: Record<string, string | undefined> = process.env): LoootClient {
  const token = env.LOOOT_TOKEN;
  if (!token) throw new LoootError("LOOOT_TOKEN is not set on the server", 500, "missing_token");
  return new LoootClient({ token, baseUrl: env.LOOOT_API_URL });
}

/** Turns actualCost (number or numeric string) into a number of dollars. */
export function costOf(run: Pick<LoootRun, "actualCost">): number | null {
  const v = run.actualCost;
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : null;
}

/** Finds the dollar balance in a /v1/balance answer. Tolerant on purpose: only keys that state dollars are read. */
export function readBalance(body: unknown): number | null {
  if (typeof body !== "object" || body === null) return null;
  const o = body as Record<string, unknown>;
  for (const k of ["availableUsd", "balanceUsd", "available_usd", "balance_usd", "available", "balance"]) {
    const v = o[k];
    const n = typeof v === "number" ? v : typeof v === "string" && v.trim() ? Number(v) : NaN;
    if (Number.isFinite(n)) return n;
    if (typeof v === "object" && v !== null) {
      const inner = readBalance(v);
      if (inner !== null) return inner;
    }
  }
  return null;
}
