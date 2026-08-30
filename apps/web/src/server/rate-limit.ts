import "server-only";

interface Bucket {
  count: number;
  resetAt: number;
}

/**
 * In-memory fixed-window limiter, deliberately simple for a single-instance
 * self-host process. If the web app is ever scaled to multiple replicas this
 * needs to move to a shared store (e.g. the platform's own Postgres); noted
 * as a Phase 4+ follow-up, not a Phase 1 blocker.
 */
const buckets = new Map<string, Bucket>();

export interface RateLimitResult {
  allowed: boolean;
  retryAfterMs: number;
}

export function checkRateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  const existing = buckets.get(key);

  if (!existing || existing.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return { allowed: true, retryAfterMs: 0 };
  }

  if (existing.count >= limit) {
    return { allowed: false, retryAfterMs: existing.resetAt - now };
  }

  existing.count += 1;
  return { allowed: true, retryAfterMs: 0 };
}

// Auth endpoints: 5 attempts / 15 min per key (per CLAUDE.md rate-limiting rule).
export const AUTH_RATE_LIMIT = { limit: 5, windowMs: 15 * 60 * 1000 };
