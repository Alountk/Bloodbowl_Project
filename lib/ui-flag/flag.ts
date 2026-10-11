/**
 * ui-refresh flag resolver (UIR-1).
 *
 * The V2 UI flag is cookie-only (no `NEXT_PUBLIC_*` env, no DB read): the
 * per-browser `bb-ui` cookie is read server-side in the root layout and seeded
 * into the client `UiFlagProvider`, so the server and the client agree on
 * first paint (anti-FOUC). The flag is ON iff the cookie is EXACTLY "next";
 * absent, empty, other casing, and every unknown/malformed value resolve OFF
 * (legacy), and the resolver never throws.
 */

/** The per-browser UI-flag cookie key (read server-side in the layout). */
export const UI_FLAG_COOKIE = "bb-ui";

/**
 * Pure, injectable resolver: `true` ONLY for the exact value `"next"`.
 *
 * @param cookieUi the raw `bb-ui` cookie value (`undefined` when absent)
 * @returns `true` for `"next"`, `false` for absent/empty/anything else
 */
export function resolveUiFlag(cookieUi?: string | null): boolean {
  return cookieUi === "next";
}
