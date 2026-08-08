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

describe("auth config session user id propagation", () => {
  // Cast to a concrete callable shape so the JWT/session callbacks can be
  // invoked directly in tests without the framework's strict param typing.
  const callbacks = authConfig.callbacks as unknown as {
    jwt: (params: never) => unknown;
    session: (params: never) => unknown;
  };

  it("persists the authorize user id into the JWT token at sign-in", () => {
    const token = callbacks.jwt({
      token: { sub: "cls-user-1", name: null, email: "a@test.local" },
      user: { id: "cls-user-1", name: null, email: "a@test.local" },
    } as never) as Record<string, unknown>;
    expect(token.id).toBe("cls-user-1");
    expect(token.sub).toBe("cls-user-1");
  });

  it("keeps an existing token id across refreshes (no user object)", () => {
    const token = callbacks.jwt({
      token: { sub: "cls-user-9", id: "cls-user-9", name: null, email: "b@test.local" },
    } as never) as Record<string, unknown>;
    expect(token.id).toBe("cls-user-9");
  });

  it("exposes the token id as session.user.id", () => {
    const result = callbacks.session({
      session: {
        user: { name: null, email: "a@test.local" },
        expires: new Date("2026-09-07"),
      },
      token: { id: "cls-user-1" },
    } as never) as { user: { id?: string } };
    // The scoped /api/teams routes rely on session.user.id; without it they 401.
    expect(result.user?.id).toBe("cls-user-1");
  });
});
