"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitAuth, submitVerification, type AuthMode } from "./authSubmit";
import { useI18n } from "@/lib/i18n";

interface AuthModalProps {
  /** Controlled open state: when false nothing renders. */
  open: boolean;
  /** Invoked on close (×, Escape, backdrop click). */
  onClose: () => void;
  /** Tab shown on open (login by default). */
  initialMode?: AuthMode;
}

/**
 * Reusable auth modal (approved nav-auth-preview): Sign in / Sign up tabs with
 * the shared `submitAuth` flow. Centered card on desktop, bottom sheet on
 * mobile (`max-md:items-end`). The /login and /signup pages mount this same
 * component as their fallback content.
 *
 * The dialog only mounts while `open`, so its state (tab, fields) starts fresh
 * on every open and the router/nav hooks never run while closed.
 */
export function AuthModal({ open, onClose, initialMode = "login" }: AuthModalProps) {
  if (!open) return null;
  return <AuthModalDialog onClose={onClose} initialMode={initialMode} />;
}

function AuthModalDialog({ onClose, initialMode }: { onClose: () => void; initialMode: AuthMode }) {
  const router = useRouter();
  const { t } = useI18n();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [forgotNote, setForgotNote] = useState(false);
  // Two-step signup (#197): after a successful signup POST the panel switches
  // to the "check your email" code screen instead of navigating home.
  const [view, setView] = useState<"form" | "verify">("form");
  const [code, setCode] = useState("");
  const [isVerifying, setIsVerifying] = useState(false);
  // Resend (#197): `idle` until the user asks; `sent`/`cooldown`/`failed`
  // cover the three answer classes the route has (200, 429, anything else).
  const [resendState, setResendState] = useState<"idle" | "sent" | "cooldown" | "failed">(
    "idle",
  );
  const [cooldownSeconds, setCooldownSeconds] = useState(60);
  const [isResending, setIsResending] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  // Guards the backdrop-close against a click whose mousedown started on an
  // inner control (RAU-11 pattern): without it a click retargeted to the
  // overlay mid-interaction would read as a backdrop click and close the modal.
  const pointerDownOnBackdrop = useRef(false);

  useEffect(() => {
    emailRef.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isLogin = mode === "login";

  function switchMode(next: AuthMode) {
    setMode(next);
    setView("form");
    setCode("");
    setError(null);
    setForgotNote(false);
    setResendState("idle");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setForgotNote(false);
    // Signup requires a coach name (the nav pill shows it; without it the user
    // menu falls back to the email). Login never needs it.
    if (mode === "signup" && !name.trim()) {
      setError(t("auth.errors.nameRequired"));
      return;
    }
    setIsSubmitting(true);
    try {
      const outcome = await submitAuth({ mode, email, password, name });
      if (outcome.ok) {
        if (outcome.next === "verify") {
          // Signup no longer signs in (#197): show the code screen — there is
          // no session yet, so navigating would bounce to /login.
          setView("verify");
          return;
        }
        // PUSH then REFRESH so the server component re-renders with the session
        // cookie present (guarantees the API-backed store from the first render).
        router.push("/");
        router.refresh();
        return;
      }
      // `email_not_verified` is ONLY reachable with the correct password
      // (auth.ts authorize), so this login is the moment the user learns they
      // must verify — send them straight to the code screen. Email and
      // password are already in state, so `submitVerification` completes the
      // sign-in from here exactly as after signup; staying on the form would
      // leave no code field, no resend and no way out (#197 lockout).
      if (outcome.errorKey === "emailNotVerified") {
        setView("verify");
        setResendState("idle");
        return;
      }
      setError(outcome.serverError ?? t(`auth.${outcome.errorKey ?? "loginError"}`));
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsVerifying(true);
    try {
      const outcome = await submitVerification({ email, password, code: code.trim() });
      if (outcome.ok) {
        router.push("/");
        router.refresh();
        return;
      }
      setError(t(`auth.${outcome.errorKey ?? "verifyFailed"}`));
    } finally {
      setIsVerifying(false);
    }
  }

  /**
   * Resend the mailed code (#197): re-issues the pair and mails it again.
   * Three outcomes, all shown as plain copy — the raw `{ error: "Too many
   * requests" }` body is never surfaced: 200 = calm confirmation, 429 = the
   * cooldown with the server's own `retry-after` seconds, anything else (or a
   * network throw) = a generic failure note. The route answers 200 for unknown
   * addresses too (no oracle), so "sent" only ever claims what we asked for.
   */
  async function handleResend() {
    if (isResending) return;
    setIsResending(true);
    try {
      const response = await fetch("/api/auth/verify/resend", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setResendState("sent");
        return;
      }
      if (response.status === 429) {
        const retryAfter = Number(response.headers.get("retry-after"));
        setCooldownSeconds(
          Number.isFinite(retryAfter) && retryAfter >= 1 ? retryAfter : 60,
        );
        setResendState("cooldown");
        return;
      }
      setResendState("failed");
    } catch {
      setResendState("failed");
    } finally {
      setIsResending(false);
    }
  }

  const fieldClass =
    "w-full rounded-none border-[1.5px] border-slate-200 bg-panel px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-navy";
  const labelClass =
    "mb-1 block text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500";

  // Two-step signup (#197): the post-signup state is its own focused panel
  // (same shell, no tabs) showing the target address + the 6-digit code field,
  // with a way back to the form. All hooks above still run in this view.
  if (view === "verify") {
    return (
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("auth.verify.title")}
        className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4 py-8 max-md:items-start max-md:px-0 max-md:py-0"
        onPointerDown={(e) => {
          pointerDownOnBackdrop.current = e.target === e.currentTarget;
        }}
        onClick={(e) => {
          if (pointerDownOnBackdrop.current && e.target === e.currentTarget) onClose();
          pointerDownOnBackdrop.current = false;
        }}
      >
        <div className="flex max-h-[90vh] w-full max-w-[400px] flex-col overflow-y-auto bg-panel max-md:max-w-none">
          <header className="flex items-center bg-navy px-4 py-3.5 text-white">
            <p className="text-[15px] font-extrabold">{t("auth.verify.title")}</p>
            <button
              type="button"
              aria-label="Close"
              onClick={onClose}
              className="ml-auto text-[20px] leading-none hover:text-slate-300"
            >
              ×
            </button>
          </header>

          <form onSubmit={handleVerify} noValidate className="space-y-3 p-4">
            <p className="text-sm text-slate-600">{t("auth.verify.sentTo", { email })}</p>
            <div>
              <label htmlFor="auth-modal-code" className={labelClass}>
                {t("auth.verify.codeLabel")}
              </label>
              <input
                id="auth-modal-code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={code}
                onChange={(e) => setCode(e.target.value)}
                className={fieldClass}
              />
            </div>

            {error ? (
              <p role="alert" className="text-sm text-red">
                {error}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isVerifying}
              className="w-full rounded-none bg-red px-4 py-3 text-sm font-extrabold text-white hover:bg-red-hover-bright disabled:opacity-60"
            >
              {t("auth.verify.submit")}
            </button>
            <button
              type="button"
              disabled={isResending}
              onClick={handleResend}
              className="w-full rounded-none border-[1.5px] border-slate-200 px-4 py-2.5 text-sm font-bold text-navy hover:border-navy disabled:opacity-60"
            >
              {t("auth.verify.resend")}
            </button>
            {resendState === "sent" ? (
              <p role="status" className="text-sm text-navy">
                {t("auth.verify.resendSent", { email })}
              </p>
            ) : null}
            {resendState === "cooldown" ? (
              <p role="status" className="text-sm text-slate-600">
                {t("auth.verify.resendCooldown", { seconds: cooldownSeconds })}
              </p>
            ) : null}
            {resendState === "failed" ? (
              <p role="alert" className="text-sm text-red">
                {t("auth.verify.resendFailed")}
              </p>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setView("form");
                setCode("");
                setError(null);
                setResendState("idle");
              }}
              className="w-full text-center text-xs font-semibold text-slate-500 hover:text-navy"
            >
              {t("auth.verify.back")}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isLogin ? t("auth.loginTitle") : t("auth.signupTitle")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4 py-8 max-md:items-start max-md:px-0 max-md:py-0"
      onPointerDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pointerDownOnBackdrop.current && e.target === e.currentTarget) onClose();
        pointerDownOnBackdrop.current = false;
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[400px] flex-col overflow-y-auto bg-panel max-md:max-w-none">
        <header className="flex items-center bg-navy px-4 py-3.5 text-white">
          <p className="text-[15px] font-extrabold">
            {isLogin ? t("auth.loginTitle") : t("auth.signupTitle")}
          </p>
          <button
            type="button"
            aria-label="Close"
            onClick={onClose}
            className="ml-auto text-[20px] leading-none hover:text-slate-300"
          >
            ×
          </button>
        </header>

        <div className="flex border-b border-slate-200">
          <button
            type="button"
            aria-pressed={isLogin}
            onClick={() => switchMode("login")}
            className={`flex-1 px-4 py-2.5 text-sm font-extrabold transition-colors ${
              isLogin
                ? "border-b-[3px] border-red text-navy"
                : "text-slate-500 hover:text-navy"
            }`}
          >
            {t("auth.loginTitle")}
          </button>
          <button
            type="button"
            aria-pressed={!isLogin}
            onClick={() => switchMode("signup")}
            className={`flex-1 px-4 py-2.5 text-sm font-extrabold transition-colors ${
              !isLogin
                ? "border-b-[3px] border-red text-navy"
                : "text-slate-500 hover:text-navy"
            }`}
          >
            {t("auth.signupTitle")}
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-3 p-4">
          {!isLogin ? (
            <div>
              <label htmlFor="auth-modal-name" className={labelClass}>
                {t("auth.name")}
              </label>
              <input
                id="auth-modal-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={fieldClass}
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="auth-modal-email" className={labelClass}>
              {t("auth.email")}
            </label>
            <input
              id="auth-modal-email"
              ref={emailRef}
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className={fieldClass}
            />
          </div>

          <div>
            <label htmlFor="auth-modal-password" className={labelClass}>
              {t("auth.password")}
            </label>
            <input
              id="auth-modal-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className={fieldClass}
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red">
              {error}
            </p>
          ) : null}

          {forgotNote ? (
            <p role="status" className="text-xs text-slate-500">
              {t("auth.forgotNote")}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-none bg-red px-4 py-3 text-sm font-extrabold text-white hover:bg-red-hover-bright disabled:opacity-60"
          >
            {isLogin ? t("auth.loginTitle") : t("auth.signupTitle")}
          </button>

          <p className="text-center text-xs text-slate-500">
            {isLogin ? (
              <>
                <button
                  type="button"
                  onClick={() => setForgotNote(true)}
                  className="mx-auto mb-1 block font-semibold text-slate-500 hover:text-navy"
                >
                  {t("auth.forgotPassword")}
                </button>
                {t("auth.noAccount")}{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="font-extrabold text-navy hover:underline"
                >
                  {t("auth.signupTitle")}
                </button>
              </>
            ) : (
              <>
                {t("auth.hasAccount")}{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-extrabold text-navy hover:underline"
                >
                  {t("auth.loginTitle")}
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
