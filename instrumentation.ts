/**
 * Next.js instrumentation hooks — the single server-wide place to see what the
 * app is doing, wired to the zero-dependency `lib/logger`.
 *
 * `register()` runs once per server process (boot line + misconfiguration
 * warnings) and `onRequestError()` fires for every server error Next.js
 * captures — an unhandled throw in a route handler, a server component render
 * failure, a server action, or the proxy. Route handlers in this repo return
 * their expected 4xx explicitly, so anything reaching `onRequestError` is an
 * UNEXPECTED failure: exactly the class that used to vanish into a bare 500
 * with nothing in the container logs.
 *
 * The hooks deliberately log a whitelist, never the raw request: `request`
 * carries cookies and `authorization`, and the path can carry the 192-bit
 * `/watch/<token>` share secret — `sanitizePath` masks it.
 */

import type { Instrumentation } from "next";

import { logger, sanitizePath, serializeError } from "./lib/logger";

/** Boot line: one line per process that answers "which build is running?". */
export function register(): void {
  logger.info("server.boot", {
    runtime: process.env.NEXT_RUNTIME ?? "nodejs",
    env: process.env.NODE_ENV ?? "unknown",
    authMode: process.env.AUTH_MODE ?? "local",
    logLevel: process.env.LOG_LEVEL ?? "(default)",
  });

  // AUTH_MODE=auth without a secret boots fine and then fails every session
  // read at runtime; say so once, at boot, instead of leaving it to a 500.
  // In production this is fatal: an unauthenticated-but-signed-looking session
  // is worse than a failed deploy.
  if (process.env.AUTH_MODE === "auth" && !process.env.AUTH_SECRET) {
    const misconfig = {
      reason: "AUTH_MODE=auth without AUTH_SECRET",
    };
    if (process.env.NODE_ENV === "production") {
      logger.error("server.misconfigured", misconfig);
      throw new Error(
        "AUTH_MODE=auth requires AUTH_SECRET in production (refusing to boot)",
      );
    }
    logger.warn("server.misconfigured", misconfig);
  }

  // AUTH_MODE=auth without a mail provider boots fine and then blocks every
  // signup: since #197 the verification code only arrives by email, so the
  // compose defaults (auth + empty RESEND_API_KEY/MAIL_FROM) leave accounts
  // permanently unactivatable. Say it once at boot — the per-send path already
  // WARNs `mail.*.notDelivered` (#317), but an operator should learn this at
  // deploy time, not at the first signup. WARN only, never fatal (product
  // decision #319): a running deploy whose existing users still sign in must
  // stay up. `resolveTransport` needs BOTH values; either missing means the
  // console transport is the sink.
  if (
    process.env.AUTH_MODE === "auth" &&
    !(process.env.RESEND_API_KEY && process.env.MAIL_FROM)
  ) {
    logger.warn("server.misconfigured", {
      reason:
        "AUTH_MODE=auth without a mail provider (set RESEND_API_KEY and MAIL_FROM) — no user can activate their account",
    });
  }
}

/**
 * One structured line per captured server error, with the route context that
 * makes it actionable (which route, which router, render vs route vs action)
 * and the serialized error (name, message, bounded stack, React digest).
 */
export const onRequestError: Instrumentation.onRequestError = async (
  error,
  request,
  context,
) => {
  const userAgent = request.headers["user-agent"];

  logger.error("request.error", {
    method: request.method,
    path: sanitizePath(request.path),
    routePath: context.routePath,
    routeType: context.routeType,
    routerKind: context.routerKind,
    ...(context.renderSource ? { renderSource: context.renderSource } : {}),
    ...(context.revalidateReason ? { revalidateReason: context.revalidateReason } : {}),
    ...(typeof userAgent === "string" ? { userAgent } : {}),
    error: serializeError(error),
  });
};
