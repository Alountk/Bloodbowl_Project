"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export type AuthMode = "login" | "signup";

interface AuthCardProps {
  initialMode: AuthMode;
}

/**
 * Rulebook-styled auth card shared by /login and /signup.
 * Each route renders it with its canonical mode; the tabs switch between
 * the two pages so the URL always reflects what the user is doing.
 * Both modes land on "/" (the teams page) on success; signout returns to /login.
 */
export function AuthCard({ initialMode }: AuthCardProps) {
  const router = useRouter();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

    if (mode === "signup") {
      let response: Response;
      try {
        response = await fetch("/api/auth/signup", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
      } catch {
        setError("Signup failed. Please try again.");
        setIsSubmitting(false);
        return;
      }
      if (!response.ok) {
        const body = (await response.json().catch(() => ({}))) as { error?: string };
        setError(body.error ?? "Signup failed. Please try again.");
        setIsSubmitting(false);
        return;
      }
    }

    // Establish the session via the Credentials provider, then land on the
    // teams page with a FULL navigation. A client-side router.push("/") can
    // mount the home before useSession propagates "authenticated", so the
    // store falls back to localStorage and teams/leagues appear empty until a
    // manual reload. A hard navigation guarantees the session cookie is used
    // from the very first render.
    const result = await signIn("credentials", { email, password, redirect: false });
    setIsSubmitting(false);
    if (result?.error) {
      setError(
        mode === "signup"
          ? "Signup succeeded, but signing you in failed. Please log in."
          : "Invalid email or password",
      );
      return;
    }
    window.location.assign("/");
  }

  function switchMode(next: AuthMode) {
    setMode(next);
    setError(null);
    router.push(next === "login" ? "/login" : "/signup");
  }

  const isLogin = mode === "login";

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#f8fafc] px-4 py-12">
      <div className="w-full max-w-sm bg-white shadow-[0_4px_8px_rgba(0,0,0,0.35)]">
        <header className="bg-[#12225a] px-4 py-[22px] text-white">
          <h1 className="text-2xl font-black tracking-[0.02em]">
            {isLogin ? "Log in" : "Sign up"}
          </h1>
          <p className="mt-1 text-[13px] text-[#cbd5e1]">Bloodbowl Teams</p>
        </header>

        {/* Mode tabs */}
        <div className="flex border-b border-slate-200">
          <button
            type="button"
            aria-pressed={isLogin}
            onClick={() => switchMode("login")}
            className={`flex-1 px-4 py-2.5 text-sm font-bold transition-colors ${
              isLogin
                ? "border-b-[3px] border-[#d11938] text-[#12225a]"
                : "text-slate-500 hover:text-[#12225a]"
            }`}
          >
            Log in
          </button>
          <button
            type="button"
            aria-pressed={!isLogin}
            onClick={() => switchMode("signup")}
            className={`flex-1 px-4 py-2.5 text-sm font-bold transition-colors ${
              !isLogin
                ? "border-b-[3px] border-[#d11938] text-[#12225a]"
                : "text-slate-500 hover:text-[#12225a]"
            }`}
          >
            Sign up
          </button>
        </div>

        <form onSubmit={handleSubmit} noValidate className="space-y-4 p-6">
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-medium text-slate-700">
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-[#12225a]"
            />
          </div>

          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-medium text-slate-700">
              Password
            </label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="w-full rounded border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-[#12225a]"
            />
          </div>

          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full rounded-md bg-[#12225a] px-4 py-2 font-semibold text-white transition-colors hover:bg-[#0f1d48] disabled:opacity-60"
          >
            {isLogin ? "Log in" : "Sign up"}
          </button>
        </form>

        <p className="pb-6 text-center text-sm text-slate-600">
          {isLogin ? "No account?" : "Already have an account?"}{" "}
          <button
            type="button"
            onClick={() => switchMode(isLogin ? "signup" : "login")}
            className="font-medium text-[#12225a] underline"
          >
            {isLogin ? "Sign up" : "Log in"}
          </button>
        </p>
      </div>
    </div>
  );
}
