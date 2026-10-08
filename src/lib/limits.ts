/** Spending limits, read from the environment with safe defaults. */
export function readLimits(env: Record<string, string | undefined> = process.env) {
  const num = (v: string | undefined, d: number) => {
    const n = Number(v);
    return v && Number.isFinite(n) && n > 0 ? n : d;
  };
  return {
    /** The most one action may spend, whatever the user types. */
    perActionMaxUsd: num(env.PER_ACTION_MAX_USD, 2),
    /** The most records one bulk action may touch. */
    bulkMaxRecords: Math.floor(num(env.BULK_MAX_RECORDS, 50)),
  };
}
