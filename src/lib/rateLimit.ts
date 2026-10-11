const buckets = new Map<string, { start: number; count: number }>();

/** Per-user fixed-window limit kept in server memory. Returns false once `limit` calls were made in the last minute. */
export function allowCall(bucket: string, userId: string, limit: number, now = Date.now()): boolean {
  const key = `${bucket}:${userId}`;
  const cur = buckets.get(key);
  if (!cur || now - cur.start >= 60_000) {
    if (buckets.size > 5000) buckets.clear();
    buckets.set(key, { start: now, count: 1 });
    return true;
  }
  cur.count += 1;
  return cur.count <= limit;
}

/** Calls per minute one user may make to a spending route. Set SPEND_RATE_LIMIT_PER_MIN to change it. */
export function spendRateLimit(env: Record<string, string | undefined> = process.env): number {
  const n = Number(env.SPEND_RATE_LIMIT_PER_MIN);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : 30;
}
