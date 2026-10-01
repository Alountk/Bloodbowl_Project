/**
 * Fixed 6-digit email-verification code for the auth E2E suites (issue #197).
 *
 * The app stores only `sha256(code + ":" + email)`, so a Playwright worker can
 * never read a generated code back from anywhere — the server must GENERATE a
 * KNOWN value instead. `playwright.config.auth.ts` feeds this same constant to
 * the dev server via `webServer.env.E2E_VERIFICATION_CODE`, and the specs fill
 * it into the code field: one source, so the two sides can never drift (an
 * externally exported E2E_VERIFICATION_CODE wins on both ends).
 *
 * `lib/verification.ts` honours the variable ONLY when NODE_ENV !== "production",
 * so a production build cannot obey it; the hash, TTL, attempt cap and resend
 * cooldown stay real in the suites either way.
 */
export const E2E_VERIFICATION_CODE = process.env.E2E_VERIFICATION_CODE ?? "042133";
