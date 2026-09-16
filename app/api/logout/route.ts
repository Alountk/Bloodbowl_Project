import { NextResponse, type NextRequest } from "next/server";
import { signOut } from "@/auth";

/**
 * GET /api/logout — clears the session cookie. Returns 204; the caller owns the
 * navigation (see `lib/auth/logout`).
 *
 * WHY THE SERVER CLEARS IT, not the browser client: Auth.js re-signs and
 * re-sets the session cookie on EVERY `GET /api/auth/session` — see
 * `@auth/core`'s session action, "Refresh JWT expiry by re-signing it, with an
 * updated expiry date". The JWT strategy does that unconditionally, with no
 * opt-out. So every session read is also a cookie WRITE, and the browser
 * client's `signOut({ redirect: false })` fires one of those reads itself,
 * right after the sign-out POST.
 *
 * WHY THE CALLER HAS TO INSIST (this route is called more than once): a session
 * read that is already in flight when this deletion lands answers with a
 * `Set-Cookie` that re-issues the session, and the cookie jar is last-write-wins
 * — so the deletion only sticks once nothing is still in flight. The server
 * cannot see the browser's pending requests, so the client is the side that
 * drains, verifies and insists. See `lib/auth/logout` for the ordering and the
 * measurements.
 */
export async function GET(request: NextRequest) {
  // Clearing the session is a state change, so refuse cross-site requests: a
  // third-party `<img src="/api/logout">` must not be able to log the user out.
  // `Sec-Fetch-Site` is sent by every current browser; a missing header (older
  // clients, non-browser callers) is allowed rather than breaking the flow.
  const site = request.headers.get("sec-fetch-site");
  if (site && site !== "same-origin" && site !== "none") {
    return new NextResponse(null, { status: 403 });
  }

  // `redirect: false` keeps Auth.js from building a redirect from the server's
  // own host (inside the container that produced `0.0.0.0:3444`). The returned
  // cookies carry the session deletion, and Auth.js knows the real cookie name
  // (plain or `__Secure-` prefixed) plus any chunked variants, so we take the
  // names from there instead of hardcoding them.
  const result = await signOut({ redirect: false });

  const response = new NextResponse(null, { status: 204 });
  for (const cookie of result?.cookies ?? []) {
    // Auth.js signals a deletion with an empty value. Re-`set` it and Next
    // drops the `Max-Age`, leaving an empty cookie behind instead of removing
    // it; `delete` is what actually clears the jar.
    if (cookie.value === "") {
      response.cookies.delete(cookie.name);
    } else {
      response.cookies.set(cookie.name, cookie.value, cookie.options);
    }
  }
  return response;
}
