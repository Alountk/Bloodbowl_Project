import type { NextConfig } from "next";

/**
 * Response security headers applied to every route.
 *
 * - `frame-ancestors 'none'` / X-Frame-Options: DENY — clickjacking.
 * - `X-Content-Type-Options: nosniff` — no MIME sniffing of uploads/scripts.
 * - `Referrer-Policy: strict-origin-when-cross-origin` — no full URL leak cross-origin.
 * - `Permissions-Policy` — deny camera/mic/geolocation this app never uses.
 * - HSTS only when the public APP_URL is actually https (no broken LAN HTTP).
 * - CSP is on by default but escape-hatchable (`CSP=off`) because Next 16
 *   inline bootstrap + Storybook/Chromatic + sharp blob canvases are easy to
 *   break; when `APP_URL` (or `CSP_IMG_SRC`) is set it is appended to img-src
 *   so S3-backed emblems keep loading.
 *
 * `script-src` keeps `'unsafe-inline' 'unsafe-eval'` for Next's runtime
 * bootstrap (same tradeoff as every default Next deploy); tightening that is a
 * separate hardening follow-up, not a silent regression here.
 */
const CSP_OFF = process.env.CSP === "off";
const appUrl = process.env.APP_URL ?? "";
const isHttpsApp = appUrl.startsWith("https://");
const extraImgSrc = process.env.CSP_IMG_SRC ?? (appUrl && !isHttpsApp ? "" : appUrl);

function csp(): string {
  if (CSP_OFF) return "";
  const img = ["'self'", "blob:", "data:", extraImgSrc].filter(Boolean).join(" ");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
    "style-src 'self' 'unsafe-inline'",
    `img-src ${img}`,
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
}

const baseHeaders: Record<string, string> = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Permissions-Policy": "camera=(), microphone=(), geolocation=()",
  ...(CSP_OFF ? {} : { "Content-Security-Policy": csp() }),
  ...(isHttpsApp
    ? { "Strict-Transport-Security": "max-age=31536000; includeSubDomains" }
    : {}),
};

const nextConfig: NextConfig = {
  allowedDevOrigins: ["111.111.111.100"],
  // Standalone output for the Docker image (minimal Node server, no node_modules).
  output: "standalone",
  // Polling for Docker bind mounts (macOS has no inotify). Only in the dev
  // container; local dev keeps native file watching.
  watchOptions: process.env.DOCKER_DEV ? { pollIntervalMs: 300 } : undefined,
  async headers() {
    return [
      {
        source: "/:path*",
        headers: Object.entries(baseHeaders).map(([key, value]) => ({ key, value })),
      },
    ];
  },
};

export default nextConfig;
