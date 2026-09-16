"use client";

import { getSession } from "next-auth/react";
import { hardNavigate } from "@/lib/navigation";

/**
 * How long to let the session reads that were already in flight land before the
 * next clear. Measured, not guessed: the #269 traces show a read that was sent
 * just before the clear answering ~130 ms after it, and reads answering in
 * ~230 ms on a loaded dev server, so this leaves margin. It only ever costs on a
 * logout the user already expects to navigate away from.
 */
const SESSION_READ_DRAIN_MS = 400;

/**
 * Bounded so a session that never settles cannot hang the logout. Each attempt
 * is a real request, so the loop normally ends on the first verification; the
 * rest is headroom for a slower connection.
 */
const MAX_CLEAR_ATTEMPTS = 3;

/** Clears the session cookie server-side (see `app/api/logout/route.ts`). */
async function clearSession(): Promise<void> {
  await fetch("/api/logout", { credentials: "same-origin" });
}

/**
 * Signs the user out and returns to the landing.
 *
 * The session cookie is cleared by the server, and the clear is drained and
 * verified. Every part of that is load-bearing:
 *
 * Auth.js re-signs and re-sets the session cookie on EVERY `GET
 * /api/auth/session` (see the route for the source reference). So a session
 * read that `SessionProvider` had already put in flight when we cleared answers
 * with a `Set-Cookie` that re-issues the session. The cookie jar is
 * last-write-wins, and the browser applies those writes in the order the
 * network delivers them — NOT the order the requests were sent — so a read sent
 * BEFORE the clear can still write AFTER it. The #269 traces caught exactly
 * that: the clear landed, a session read sent 57 ms earlier re-issued the
 * cookie ~130 ms later, and the user stayed signed in.
 *
 * Asking "is there a session?" is not enough on its own: a read that reports no
 * session can still be followed by a late re-issue (that is how the first
 * attempt at this fix failed). So the clear is drained first — giving the reads
 * already in flight time to land — and then verified. A session read issued
 * after the clear carries no cookie and therefore cannot re-issue one, so a
 * verification that reports nothing means the clear held; if it reports a
 * session, a late write slipped in and we drain and clear again.
 *
 * Finally the navigation is a FULL document load (see `hardNavigate`), so the
 * server re-decides Landing vs Dashboard with the cookie gone, instead of the
 * Router Cache replaying the signed-in payload.
 */
export async function logout(): Promise<void> {
  await clearSession();

  for (let attempt = 0; attempt < MAX_CLEAR_ATTEMPTS; attempt++) {
    await new Promise((resolve) => setTimeout(resolve, SESSION_READ_DRAIN_MS));
    await clearSession();
    // `broadcast: false`: this read is a private check, it must not ping other
    // tabs into re-reading the session.
    if ((await getSession({ broadcast: false })) === null) break;
  }

  hardNavigate("/");
}
