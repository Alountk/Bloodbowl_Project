import { ATTEMPT_CAP, CODE_TTL_MS, RESEND_COOLDOWN_MS } from "@/lib/verification";

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

/**
 * Read a positive integer override for a limit from the environment.
 *
 * The defaults below are the production policy and must not change by accident:
 * an absent, empty, non-numeric or non-positive value keeps the fallback, so a
 * typo cannot silently disable the protection.
 *
 * The override exists for the real-DB Playwright suite, which signs up ~130
 * accounts from a single machine. Without a proxy in front of it `clientIp()`
 * resolves to the same key for every request, so the 5/hour signup cap blocks
 * the run after the 5th account. See `playwright.config.auth.ts`.
 */
function envLimit(name: string, fallback: number): number {
  const raw = process.env[name];
  if (raw === undefined) return fallback;
  // `Number` (not `parseInt`) so "3.7" is malformed rather than silently
  // truncated to 3 — an unexpected value must fall back to the policy, not
  // reinterpret it.
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Shared policy for the auth-sensitive endpoints.
 *
 * Limits are env-overridable (`AUTH_RATE_LIMIT_SIGNUP`,
 * `AUTH_RATE_LIMIT_LOGIN`, `AUTH_RATE_LIMIT_PASSWORD_CHANGE`,
 * `AUTH_RATE_LIMIT_VERIFY`, `AUTH_RATE_LIMIT_RESEND`,
 * `AUTH_RATE_LIMIT_RESEND_IP`) for the e2e suite only;
 * windows are fixed. When unset — production, and every unit test — the values
 * below apply verbatim. The verify/resend defaults come straight from
 * `lib/verification.ts` so the policy constant and its enforcement can never
 * drift apart.
 */
export const AUTH_RATE_LIMITS = {
  /** Signup: 5 accounts / hour / IP. */
  signup: { limit: envLimit("AUTH_RATE_LIMIT_SIGNUP", 5), windowMs: 60 * 60 * 1000 },
  /** Credentials login: 10 attempts / 15 min / email (checked before bcrypt). */
  login: { limit: envLimit("AUTH_RATE_LIMIT_LOGIN", 10), windowMs: 15 * 60 * 1000 },
  /** Password change: 10 attempts / hour / user. */
  passwordChange: {
    limit: envLimit("AUTH_RATE_LIMIT_PASSWORD_CHANGE", 10),
    windowMs: 60 * 60 * 1000,
  },
  /** Email-verification attempts (code AND link token share one budget):
   *  ATTEMPT_CAP tries per code-TTL window / email, counted before the DB
   *  lookup so guessing is capped whether or not the account exists. */
  verify: {
    limit: envLimit("AUTH_RATE_LIMIT_VERIFY", ATTEMPT_CAP),
    windowMs: CODE_TTL_MS,
  },
  /** Verification resend cooldown: 1 mail / RESEND_COOLDOWN_MS / email. */
  resend: {
    limit: envLimit("AUTH_RATE_LIMIT_RESEND", 1),
    windowMs: RESEND_COOLDOWN_MS,
  },
  /** Verification resend, capped by the CALLER: 5 mails / hour / IP.
   *
   *  The cooldown above is keyed by the TARGET address, so on its own it is
   *  not abuse control: one caller can mailbomb a victim (1 mail/min forever),
   *  fan out over unlimited addresses, and — because every successful resend
   *  resets that address's `verify` bucket — turn 5 guesses per code into 5
   *  guesses per minute indefinitely. Mirrors signup's own 5/hour/IP, which is
   *  the repo's baseline for anything that makes the server send mail. */
  resendIp: {
    limit: envLimit("AUTH_RATE_LIMIT_RESEND_IP", 5),
    windowMs: 60 * 60 * 1000,
  },
};

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
