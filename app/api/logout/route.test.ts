import { describe, expect, it, vi, beforeEach } from "vitest";
import { NextRequest } from "next/server";

const signOutMock = vi.hoisted(() => vi.fn());

// The route delegates the cookie clearing to Auth.js; the mock stands in for it
// so the assertions can pin the cookies the route puts on the response.
vi.mock("@/auth", () => ({
  signOut: signOutMock,
}));

import { GET } from "./route";

/** The deletion Auth.js returns for a JWT session cookie. */
function sessionClearingResult() {
  return {
    cookies: [
      {
        name: "authjs.session-token",
        value: "",
        options: { path: "/", httpOnly: true, sameSite: "lax", maxAge: 0 },
      },
    ],
  };
}

function logoutRequest(headers: Record<string, string> = {}) {
  return new NextRequest("http://localhost:3000/api/logout", { headers });
}

describe("GET /api/logout", () => {
  beforeEach(() => vi.clearAllMocks());

  it("clears the session cookie", async () => {
    signOutMock.mockResolvedValue(sessionClearingResult());

    const res = await GET(logoutRequest({ "sec-fetch-site": "same-origin" }));

    // 204: this route only clears the session. The caller owns the navigation,
    // because it is the side that can tell when the clear actually held (a
    // session read in flight can re-issue the cookie — see the route comment).
    expect(res.status).toBe(204);

    const setCookie = res.headers.get("set-cookie") ?? "";
    expect(setCookie).toContain("authjs.session-token=;");
    // A real deletion (`Expires` in the past), not an empty cookie left behind:
    // re-`set`ting the value makes Next drop the `Max-Age`.
    expect(setCookie).toContain("Expires=Thu, 01 Jan 1970");
    expect(signOutMock).toHaveBeenCalledWith({ redirect: false });
  });

  it("refuses a cross-site logout without touching the session", async () => {
    const res = await GET(logoutRequest({ "sec-fetch-site": "cross-site" }));

    expect(res.status).toBe(403);
    expect(signOutMock).not.toHaveBeenCalled();
    expect(res.headers.get("set-cookie")).toBeNull();
  });

  it("allows a direct load that carries no Sec-Fetch-Site header", async () => {
    signOutMock.mockResolvedValue(sessionClearingResult());

    const res = await GET(logoutRequest());

    expect(res.status).toBe(204);
    expect(signOutMock).toHaveBeenCalled();
  });
});
