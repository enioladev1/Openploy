const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

function parseRetryAfterMs(response: Response): number | null {
  const header = response.headers.get("retry-after");
  if (!header) return null;
  const seconds = Number(header);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const dateMs = Date.parse(header);
  return Number.isFinite(dateMs) ? Math.max(0, dateMs - Date.now()) : null;
}

function defaultSleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// GitHub's own guidance for a 429 with no Retry-After header is to wait at
// least 60s before retrying (secondary rate limit) - a short exponential
// backoff like the one used for plain 5xx server errors just re-triggers the
// same block and burns through attempts without ever actually waiting it out.
// Only worth doing from a background job, though: an interactive request has
// its own HTTP timeout that would kill the connection long before a 60s wait
// completes anyway, turning a clean 429 into a confusing socket hang-up - so
// callers opt in explicitly rather than getting it by default.
const RATE_LIMIT_FLOOR_MS = 60_000;
const RATE_LIMIT_CEILING_MS = 180_000;

function backoffFor(attempt: number, response: Response, honorRateLimitFloor: boolean): number {
  const retryAfterMs = parseRetryAfterMs(response);
  if (retryAfterMs !== null) return Math.min(retryAfterMs, RATE_LIMIT_CEILING_MS);
  if (honorRateLimitFloor && response.status === 429) {
    return Math.min(RATE_LIMIT_FLOOR_MS * attempt, RATE_LIMIT_CEILING_MS);
  }
  return 2 ** attempt * 250 + Math.random() * 250;
}

export interface FetchWithRetryOptions {
  maxAttempts?: number;
  /** Background-job callers only - see the RATE_LIMIT_FLOOR_MS comment above. */
  honorRateLimitFloor?: boolean;
  /** Injectable for tests - real callers never pass this. */
  sleep?: (ms: number) => Promise<void>;
}

/**
 * Both api.github.com and codeload.github.com rate-limit with 429s (and
 * occasionally 5xx under load) well before the App-level hourly quota is hit -
 * a bounded backoff, honoring Retry-After when GitHub sends one, turns that
 * into a slower request instead of a failed deployment. Non-retryable
 * responses (4xx other than 429) are returned immediately for the caller to
 * turn into its own error.
 */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  options: FetchWithRetryOptions = {},
): Promise<Response> {
  const maxAttempts = options.maxAttempts ?? 4;
  const sleep = options.sleep ?? defaultSleep;

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const response = await fetch(url, init);
    if (response.ok || !RETRYABLE_STATUS.has(response.status) || attempt === maxAttempts) {
      return response;
    }

    const backoffMs = backoffFor(attempt, response, options.honorRateLimitFloor ?? false);
    // Drain the failed response so its connection is released before retrying.
    await response.text().catch(() => undefined);
    await sleep(backoffMs);
  }

  throw new Error("unreachable");
}
