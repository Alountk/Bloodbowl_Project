/**
 * Zero-dependency structured logger.
 *
 * One JSON object per line via `console.log`/`console.error` — stdout for
 * `debug`/`info`, stderr for `warn`/`error` — so a container's logs stay
 * queryable with `docker logs <container> | jq` without adding a transport, a
 * batching layer or a third party: the deploy already collects stdout.
 *
 * `console` (rather than `process.stdout`) is deliberate: Next compiles
 * `instrumentation.ts` for the Node AND edge runtimes, and `process.stdout`
 * does not exist on the edge.
 *
 * Two rules this module enforces on itself:
 *
 * - **It never throws.** A logger that crashes a request is worse than no
 *   logger, so every write is wrapped and every serializer is total.
 * - **It never emits secrets.** Sensitive keys are redacted before writing and
 *   opaque path segments are masked, because request paths reach us from user
 *   input (e.g. the 192-bit `/watch/<token>` share link).
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

/** Numeric severity, so a threshold comparison decides what is emitted. */
const SEVERITY: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/**
 * Keys whose value is never safe to print. Matched case-insensitively as a
 * substring, so `userPassword`, `bb-theme`-style cookies, `x-api-key` and
 * `DATABASE_URL`-adjacent names are all covered by one rule.
 */
const SENSITIVE_KEY = /pass|secret|token|authoriz|cookie|session|credential|api[-_]?key|dsn/i;

/** An opaque id/token segment: share tokens, uuids without dashes, hex blobs. */
const OPAQUE_SEGMENT = /^[A-Za-z0-9_-]{32,}$/;

/** What replaces a redacted value. Exported so tests assert on the constant. */
export const REDACTED = "[redacted]";

/** Guards against pathological nesting; deeper values are truncated. */
const MAX_DEPTH = 6;

/** Caps arrays so one huge payload cannot flood a log line. */
const MAX_ARRAY = 50;

/** Stack frames kept per error — enough to locate the throw, not the whole app. */
const MAX_STACK_LINES = 12;

/**
 * The effective threshold: `LOG_LEVEL` when it holds a valid level, else `info`
 * in production and `debug` everywhere else. Read per call so a test can flip
 * it without reloading the module.
 */
function threshold(): LogLevel {
  const raw = (process.env.LOG_LEVEL ?? "").toLowerCase();
  if (raw === "debug" || raw === "info" || raw === "warn" || raw === "error") {
    return raw;
  }
  return process.env.NODE_ENV === "production" ? "info" : "debug";
}

/**
 * Deep-copies `value`, replacing the value of every sensitive key with
 * `REDACTED`. Depth- and length-bounded, so a cyclic or huge payload cannot
 * hang the writer.
 */
export function redactValue(value: unknown, depth = 0): unknown {
  if (depth > MAX_DEPTH) return "[truncated]";
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Error) return serializeError(value);
  if (Array.isArray(value)) {
    return value.slice(0, MAX_ARRAY).map((entry) => redactValue(entry, depth + 1));
  }
  const out: Record<string, unknown> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    out[key] = SENSITIVE_KEY.test(key) ? REDACTED : redactValue(entry, depth + 1);
  }
  return out;
}

/**
 * Turns a request path into something safe to log: the query string is dropped
 * wholesale (it can carry tokens) and any opaque segment is masked.
 *
 * `/watch/<192-bit-token>` → `/watch/[redacted]`
 */
export function sanitizePath(path: string): string {
  const [pathname, query] = path.split("?");
  const safe = pathname
    .split("/")
    .map((segment) => (OPAQUE_SEGMENT.test(segment) ? REDACTED : segment))
    .join("/");
  return query === undefined ? safe : `${safe}?[query]`;
}

/**
 * A total serializer for thrown values: `Error` instances keep their name,
 * message, a bounded stack and React's `digest` (which identifies the real
 * error type when React processed it); anything else degrades to a string.
 * Never throws, even for a circular non-Error payload.
 */
export function serializeError(error: unknown): Record<string, unknown> {
  if (error instanceof Error) {
    const digest = (error as { digest?: unknown }).digest;
    return {
      name: error.name,
      message: error.message,
      ...(error.stack
        ? { stack: error.stack.split("\n").slice(0, MAX_STACK_LINES).join("\n") }
        : {}),
      ...(typeof digest === "string" || typeof digest === "number" ? { digest } : {}),
    };
  }
  if (typeof error === "string") return { name: "NonError", message: error };
  try {
    return { name: "NonError", message: JSON.stringify(redactValue(error)) };
  } catch {
    return { name: "NonError", message: "[unserializable]" };
  }
}

/**
 * Writes one structured line. `level`, `event` and `ts` are written last so a
 * caller-supplied field can never overwrite them. Swallows every failure.
 */
export function log(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown> = {},
): void {
  try {
    if (SEVERITY[level] < SEVERITY[threshold()]) return;

    const payload = {
      ...(redactValue(fields) as Record<string, unknown>),
      ts: new Date().toISOString(),
      level,
      event,
    };

    // `console.log`/`console.error` map to stdout/stderr in Node and to the
    // platform console on the edge runtime, so ONE code path serves both.
    // Reaching for `process.stdout` directly breaks the edge instrumentation
    // bundle (Next compiles `instrumentation.ts` for both runtimes).
    const line = JSON.stringify(payload);
    if (SEVERITY[level] >= SEVERITY.warn) {
      console.error(line);
    } else {
      console.log(line);
    }
  } catch {
    // A failed log must never take the request down with it.
  }
}

/** Convenience wrappers — the shape every call site uses. */
export const logger = {
  debug: (event: string, fields?: Record<string, unknown>) => log("debug", event, fields),
  info: (event: string, fields?: Record<string, unknown>) => log("info", event, fields),
  warn: (event: string, fields?: Record<string, unknown>) => log("warn", event, fields),
  error: (event: string, fields?: Record<string, unknown>) => log("error", event, fields),
};

/**
 * Logs a thrown value as an `error` line under `event`, with the serialized
 * error in the `error` field so every failure has the same queryable shape.
 */
export function logError(
  event: string,
  error: unknown,
  fields: Record<string, unknown> = {},
): void {
  log("error", event, { ...fields, error: serializeError(error) });
}
