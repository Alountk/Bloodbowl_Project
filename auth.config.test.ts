import { describe, expect, it, vi } from "vitest";
import type { NextAuthConfig } from "next-auth";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

import { authConfig } from "./auth.config";

type Authorized = NonNullable<NonNullable<NextAuthConfig["callbacks"]>["authorized"]>;

/** Builds a minimal NextRequest-like object for the authorized callback. */
function makeRequest(pathname: string): Parameters<Authorized>[0]["request"] {
  return {
    nextUrl: new URL(pathname, "http://localhost:3000"),
  } as Parameters<Authorized>[0]["request"];
}

describe("auth config route gate", () => {
  it("exposes the jwt session strategy and login page", () => {
    expect(authConfig.session?.strategy).toBe("jwt");
    expect(authConfig.pages?.signIn).toBe("/login");
  });

  it("allows an unauthenticated request through when auth is disabled", async () => {
    const authorized = authConfig.callbacks?.authorized;
    vi.stubEnv("AUTH_MODE", "local");
    const result = await authorized?.({
      auth: null,
      request: makeRequest("/teams/create"),
    });
    expect(result).toBe(true);
    vi.unstubAllEnvs();
  });

  it("redirects an unauthenticated protected-route request to /login when auth is enabled", async () => {
    const authorized = authConfig.callbacks?.authorized;
    vi.stubEnv("AUTH_MODE", "auth");
    const result = (await authorized?.({
      auth: null,
      request: makeRequest("/teams/create"),
    })) as Response;
    expect(result.status).toBe(307);
    const location = result.url || result.headers.get("location")!;
    expect(new URL(location).pathname).toBe("/login");
    vi.unstubAllEnvs();
  });

  it("allows an authenticated user through on a protected route when auth is enabled", async () => {
    const authorized = authConfig.callbacks?.authorized;
    vi.stubEnv("AUTH_MODE", "auth");
    const result = await authorized?.({
      auth: { user: { id: "u1" } } as never,
      request: makeRequest("/"),
    });
    expect(result).toBe(true);
    vi.unstubAllEnvs();
  });

  it("redirects an authenticated user off /login to home when auth is enabled", async () => {
    const authorized = authConfig.callbacks?.authorized;
    vi.stubEnv("AUTH_MODE", "auth");
    const result = (await authorized?.({
      auth: { user: { id: "u1" } } as never,
      request: makeRequest("/login"),
    })) as Response;
    expect(result.status).toBe(307);
    const location = result.url || result.headers.get("location")!;
    expect(new URL(location).pathname).toBe("/");
    vi.unstubAllEnvs();
  });
});
