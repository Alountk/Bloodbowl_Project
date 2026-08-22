"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { submitAuth, type AuthMode } from "./authSubmit";
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
    setError(null);
    setForgotNote(false);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setForgotNote(false);
    setIsSubmitting(true);
    try {
      const outcome = await submitAuth({ mode, email, password, name });
      if (outcome.ok) {
        // PUSH then REFRESH so the server component re-renders with the session
        // cookie present (guarantees the API-backed store from the first render).
        router.push("/");
        router.refresh();
        return;
      }
      setError(outcome.serverError ?? t(`auth.${outcome.errorKey ?? "loginError"}`));
    } finally {
      setIsSubmitting(false);
    }
  }

  const fieldClass =
    "w-full rounded-none border-[1.5px] border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-900 outline-none focus:border-[#12225a]";
  const labelClass =
    "mb-1 block text-[11px] font-extrabold uppercase tracking-[0.04em] text-slate-500";

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={isLogin ? "Sign in" : "Sign up"}
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/55 px-4 py-8 max-md:items-end max-md:px-0 max-md:py-0"
      onPointerDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pointerDownOnBackdrop.current && e.target === e.currentTarget) onClose();
        pointerDownOnBackdrop.current = false;
      }}
    >
      <div className="flex max-h-[90vh] w-full max-w-[400px] flex-col overflow-y-auto bg-white max-md:max-w-none">
        <header className="flex items-center bg-[#12225a] px-4 py-3.5 text-white">
          <p className="text-[15px] font-extrabold">
            {isLogin ? "Sign in" : "Create your account"}
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
                ? "border-b-[3px] border-[#d11938] text-[#12225a]"
                : "text-slate-500 hover:text-[#12225a]"
            }`}
          >
            Sign in
          </button>
          <button
            type="button"
            aria-pressed={!isLogin}
            onClick={() => switchMode("signup")}
            className={`flex-1 px-4 py-2.5 text-sm font-extrabold transition-colors ${
              !isLogin
                ? "border-b-[3px] border-[#d11938] text-[#12225a]"
                : "text-slate-500 hover:text-[#12225a]"
            }`}
          >
            Sign up
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
            <p role="alert" className="text-sm text-[#d11938]">
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
            className="w-full rounded-none bg-[#d11938] px-4 py-3 text-sm font-extrabold text-white hover:bg-[#e51b40] disabled:opacity-60"
          >
            {isLogin ? "Sign in" : "Sign up"}
          </button>

          <p className="text-center text-xs text-slate-500">
            {isLogin ? (
              <>
                <button
                  type="button"
                  onClick={() => setForgotNote(true)}
                  className="mx-auto mb-1 block font-semibold text-slate-500 hover:text-[#12225a]"
                >
                  Forgot your password?
                </button>
                New here?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("signup")}
                  className="font-extrabold text-[#12225a] hover:underline"
                >
                  Create an account
                </button>
              </>
            ) : (
              <>
                Already have an account?{" "}
                <button
                  type="button"
                  onClick={() => switchMode("login")}
                  className="font-extrabold text-[#12225a] hover:underline"
                >
                  Log in
                </button>
              </>
            )}
          </p>
        </form>
      </div>
    </div>
  );
}
