"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useI18n } from "@/lib/i18n";

type LinkStatus = "pending" | "ok" | "failed";

/**
 * Activation landing page for the mailed link `${APP_URL}/verify?token=…&email=…`
 * (issue #197). The mail promises that EITHER the typed code OR this link
 * activates the account, so the route must be reachable WITHOUT a session —
 * `resolveAuthGate` lists `/verify` as public, and an anonymous click must not
 * bounce to `/login`.
 *
 * Same sessionless contract as the code screen: POST `{ token, email }` to
 * `/api/auth/verify/token` once, then report the outcome here. Wrong, expired,
 * and consumed tokens all land on the same failure copy (the endpoint has no
 * oracle and the page must not invent one).
 */
function VerifyToken() {
  const params = useSearchParams();
  const token = params.get("token");
  const email = params.get("email");
  const { t } = useI18n();
  // A link without its pair can never match the stored hash (it is
  // domain-separated by the address) — fail up front, with the same copy.
  const [status, setStatus] = useState<LinkStatus>(() =>
    token && email ? "pending" : "failed",
  );
  // Fire-once guard: React StrictMode (and any re-run of the effect) must not
  // POST twice — a second call would draw from the shared attempt budget and,
  // after a success, re-post an already-consumed secret (a self-inflicted 400).
  const fired = useRef(false);

  useEffect(() => {
    if (fired.current || !token || !email) return;
    fired.current = true;
    fetch("/api/auth/verify/token", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ token, email }),
    })
      .then((response) => setStatus(response.ok ? "ok" : "failed"))
      .catch(() => setStatus("failed"));
  }, [token, email]);

  return (
    <main className="flex min-h-screen items-start justify-center bg-background px-4 py-16">
      <div className="w-full max-w-[400px] bg-panel">
        <header className="bg-navy px-4 py-3.5 text-white">
          <p className="text-[15px] font-extrabold">{t("auth.verify.title")}</p>
        </header>
        <div
          role="status"
          aria-live="polite"
          className="space-y-3 p-4 text-sm text-slate-600"
        >
          {status === "pending" ? <p>{t("auth.verify.linkPending")}</p> : null}
          {status === "ok" ? (
            <>
              <p>{t("auth.verify.linkOk")}</p>
              <Link
                href="/login"
                className="font-bold text-navy underline-offset-2 hover:underline"
              >
                {t("auth.verify.linkSignIn")}
              </Link>
            </>
          ) : null}
          {status === "failed" ? (
            <>
              <p>{t("auth.verify.linkFailed")}</p>
              <Link
                href="/login"
                className="font-bold text-navy underline-offset-2 hover:underline"
              >
                {t("auth.verify.linkSignIn")}
              </Link>
            </>
          ) : null}
        </div>
      </div>
    </main>
  );
}

/** Suspense shell: `useSearchParams` needs a boundary for static rendering. */
export default function VerifyPage() {
  return (
    <Suspense fallback={null}>
      <VerifyToken />
    </Suspense>
  );
}
