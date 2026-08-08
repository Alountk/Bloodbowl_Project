"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { signIn } from "next-auth/react";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setIsSubmitting(true);

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

    // Establish the session via the Credentials provider, then land on `/`.
    const result = await signIn("credentials", { email, password, redirect: false });
    if (result?.error) {
      setError("Signup succeeded, but signing you in failed. Please log in.");
    } else {
      router.push("/");
    }
    setIsSubmitting(false);
  }

  return (
    <div className="flex min-h-full flex-col items-center justify-center bg-[#f8fafc] px-4 py-12">
      <div className="w-full max-w-sm bg-white p-6 shadow-[0_4px_8px_rgba(0,0,0,0.35)]">
        <header className="bg-[#12225a] px-4 py-[22px] text-white">
          <h1 className="text-2xl font-black tracking-[0.02em]">Sign up</h1>
          <p className="mt-1 text-[13px] text-[#cbd5e1]">Create a Bloodbowl Teams account</p>
        </header>

        <form onSubmit={handleSubmit} noValidate className="mt-6 space-y-4">
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
            <p className="mt-1 text-xs text-slate-500">At least 8 characters.</p>
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
            Sign up
          </button>
        </form>

        <p className="mt-4 text-center text-sm text-slate-600">
          Already have an account?{" "}
          <Link href="/login" className="font-medium text-[#12225a] underline">
            Log in
          </Link>
        </p>
      </div>
    </div>
  );
}
