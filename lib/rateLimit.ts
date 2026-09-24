/**
 * In-memory sliding-window rate limiter.
 *
 * Single-process (the app runs as one Docker container), so a Map keyed by
 * subject is enough — no Redis. Each key stores the hit timestamps inside the
 * current window; a hit outside `limit` is rejected with a `retryAfterMs`
 * derived from the oldest surviving timestamp.
 *
 * Keys are caller-scoped (IP, email, userId) — this module never invents them.
 * `now` is injectable so unit tests can advance time without sleeping.
 */

export interface RateLimitResult {
  ok: boolean;
  /** Milliseconds until the next hit would be allowed (0 when `ok`). */
  retryAfterMs: number;
}

type Clock = () => number;

interface Limiter {
  check(key: string, limit: number, windowMs: number, now?: Clock): RateLimitResult;
  reset(key?: string): void;
}

function createLimiter(): Limiter {
  const hits = new Map<string, number[]>();

  return {
    check(key, limit, windowMs, now = Date.now) {
      const at = now();
      const windowStart = at - windowMs;
      const timestamps = (hits.get(key) ?? []).filter((t) => t > windowStart);

      if (timestamps.length >= limit) {
        // The oldest in-window hit is the first that will free a slot.
        const oldest = timestamps[0] as number;
        return { ok: false, retryAfterMs: Math.max(0, oldest + windowMs - at) };
      }

      timestamps.push(at);
      hits.set(key, timestamps);
      return { ok: true, retryAfterMs: 0 };
    },
    reset(key) {
      if (key === undefined) hits.clear();
      else hits.delete(key);
    },
  };
}

const limiter = createLimiter();

/**
 * Check (and record) a hit for `key`. Returns `ok: false` with a positive
 * `retryAfterMs` once `limit` hits have been seen inside `windowMs`.
 */
export function rateLimit(
  key: string,
  limit: number,
  windowMs: number,
  now?: Clock,
): RateLimitResult {
  return limiter.check(key, limit, windowMs, now);
}

/** Clear one key or the whole table (tests / hot reload). */
export function resetRateLimits(key?: string): void {
  limiter.reset(key);
}

/** Best-effort client IP: first `x-forwarded-for` hop, else a stable fallback. */
export function clientIp(req: Request): string {
  const forwarded = req.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }
  return req.headers.get("x-real-ip") ?? "local";
}

/** Shared policy for the three auth-sensitive endpoints. */
export const AUTH_RATE_LIMITS = {
  /** Signup: 5 accounts / hour / IP. */
  signup: { limit: 5, windowMs: 60 * 60 * 1000 },
  /** Credentials login: 10 attempts / 15 min / email (checked before bcrypt). */
  login: { limit: 10, windowMs: 15 * 60 * 1000 },
  /** Password change: 10 attempts / hour / user. */
  passwordChange: { limit: 10, windowMs: 60 * 60 * 1000 },
} as const;

/** 429 JSON with `Retry-After` in seconds (rounded up, min 1). */
export function tooManyRequests(retryAfterMs: number): Response {
  const seconds = Math.max(1, Math.ceil(retryAfterMs / 1000));
  return new Response(JSON.stringify({ error: "Too many requests" }), {
    status: 429,
    headers: {
      "content-type": "application/json",
      "retry-after": String(seconds),
    },
  });
}
