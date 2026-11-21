// A small in-memory limiter. Good enough for a family site on at most two
// Cloud Run instances: each instance counts separately, so the real limit is
// at most twice the number below.
export function createRateLimiter(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();

  return {
    /** Records a hit for `key`; returns false when the limit is already reached. */
    take(key: string, now = Date.now()): boolean {
      const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
      if (recent.length >= limit) {
        hits.set(key, recent);
        return false;
      }
      recent.push(now);
      hits.set(key, recent);
      if (hits.size > 5000) {
        for (const [k, times] of hits) if (times.every((t) => now - t >= windowMs)) hits.delete(k);
      }
      return true;
    },
  };
}
