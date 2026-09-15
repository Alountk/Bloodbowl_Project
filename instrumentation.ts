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
  if (process.env.AUTH_MODE === "auth" && !process.env.AUTH_SECRET) {
    logger.warn("server.misconfigured", {
      reason: "AUTH_MODE=auth without AUTH_SECRET",
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
