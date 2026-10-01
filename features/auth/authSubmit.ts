import { signIn } from "next-auth/react";

export type AuthMode = "login" | "signup";

export interface AuthSubmitValues {
  mode: AuthMode;
  email: string;
  password: string;
  /** Optional display name; only sent to the signup route (not used by login). */
  name?: string;
}

/**
 * Error keys are relative to the `auth.` i18n namespace, so the caller renders
 * `t(\`auth.\${errorKey}\`)`. When the signup API returns its own message it is
 * surfaced as `serverError` (it is already user-readable).
 */
export type AuthErrorKey =
  | "loginError"
  | "signupFailed"
  | "emailNotVerified"
  | "verifyFailed";

export interface AuthSubmitOutcome {
  ok: boolean;
  /** Present only on success: `verify` = the auth-mode signup still needs the
   *  mailed code before any session exists. Absent = navigate home (login, or
   *  a local-mode signup). */
  next?: "verify";
  errorKey?: AuthErrorKey;
  serverError?: string;
}

/** The subset of Auth.js's `signIn` response we read (beta returns `code`
 *  parsed from the error redirect URL — see `EmailNotVerifiedSignin`). */
interface SignInOutcome {
  error?: string | null;
  code?: string | null;
}

/** Single sign-in path: one place maps the `email_not_verified` code to its
 *  distinct (non-enumerating: only reachable with the correct password) key. */
async function signInWithCredentials(
  email: string,
  password: string,
): Promise<AuthSubmitOutcome> {
  let result: SignInOutcome | null;
  try {
    result = await signIn("credentials", { email, password, redirect: false });
  } catch {
    return { ok: false, errorKey: "loginError" };
  }
  if (result?.error) {
    return {
      ok: false,
      errorKey: result.code === "email_not_verified" ? "emailNotVerified" : "loginError",
    };
  }
  return { ok: true };
}

/**
 * Shared auth submit for the AuthModal and the /login + /signup fallback pages.
 *
 * Signup mode: create the account via POST /api/auth/signup (surfacing the
 * API's own message on failure) and then STOP — since issue #197 it never
 * signs in; the outcome says `next: "verify"` (auth mode) or home (local mode,
 * where the response's `verifyRequired: false` means there is no session to
 * wait for: the LocalStorage dashboard is the signed-in state).
 *
 * Login mode: establish the session via the Auth.js Credentials
 * `signIn("credentials", …)`. The caller navigates on `ok`.
 */
export async function submitAuth(values: AuthSubmitValues): Promise<AuthSubmitOutcome> {
  if (values.mode === "signup") {
    let response: Response;
    try {
      response = await fetch("/api/auth/signup", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email: values.email,
          password: values.password,
          name: values.name?.trim() || undefined,
        }),
      });
    } catch {
      return { ok: false, errorKey: "signupFailed" };
    }
    if (!response.ok) {
      const body = (await response.json().catch(() => ({}))) as { error?: string };
      return { ok: false, errorKey: "signupFailed", serverError: body.error };
    }
    const body = (await response.json().catch(() => ({}))) as {
      verifyRequired?: boolean;
    } | null;
    // Fail closed: anything but an explicit `false` (AUTH_MODE=local) means
    // the code screen — a missing/garbled body must never skip verification.
    return body?.verifyRequired === false ? { ok: true } : { ok: true, next: "verify" };
  }

  return signInWithCredentials(values.email, values.password);
}

/**
 * Post-signup step: confirm the mailed 6-digit code (sessionless endpoint),
 * then establish the session with the same credentials — the account is
 * verified by then, so the Credentials provider accepts it.
 */
export async function submitVerification(values: {
  email: string;
  password: string;
  code: string;
}): Promise<AuthSubmitOutcome> {
  try {
    const response = await fetch("/api/auth/verify/code", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ email: values.email, code: values.code }),
    });
    if (!response.ok) return { ok: false, errorKey: "verifyFailed" };
  } catch {
    return { ok: false, errorKey: "verifyFailed" };
  }
  return signInWithCredentials(values.email, values.password);
}
