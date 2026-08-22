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
export type AuthErrorKey = "loginError" | "signupFailed" | "signupSigninFailed";

export interface AuthSubmitOutcome {
  ok: boolean;
  errorKey?: AuthErrorKey;
  serverError?: string;
}

/**
 * Shared auth submit for the AuthModal and the /login + /signup fallback pages.
 *
 * Single source of the sign-in flow: create the account via POST
 * /api/auth/signup when in signup mode (surfacing the API's own message on
 * failure), then establish the session via the Auth.js Credentials
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
  }

  let result: { error?: string } | null;
  try {
    result = await signIn("credentials", {
      email: values.email,
      password: values.password,
      redirect: false,
    });
  } catch {
    return {
      ok: false,
      errorKey: values.mode === "signup" ? "signupSigninFailed" : "loginError",
    };
  }

  if (result?.error) {
    return {
      ok: false,
      errorKey: values.mode === "signup" ? "signupSigninFailed" : "loginError",
    };
  }
  return { ok: true };
}
