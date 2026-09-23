import { describe, expect, it } from "vitest";
import { isApiPath, isAuthEnabled, isPublicApiPath, resolveAuthGate } from "./auth-mode";

describe("isAuthEnabled", () => {
  it("is disabled by default when no auth mode env var is set", () => {
    expect(isAuthEnabled({})).toBe(false);
  });

  it("treats an explicit 'local' mode as disabled", () => {
    expect(isAuthEnabled({ AUTH_MODE: "local" })).toBe(false);
  });

  it("treats an explicit 'auth' mode as enabled", () => {
    expect(isAuthEnabled({ AUTH_MODE: "auth" })).toBe(true);
  });

  it("is case-insensitive for the enabled value", () => {
    expect(isAuthEnabled({ AUTH_MODE: "AUTH" })).toBe(true);
  });
});

describe("isApiPath / isPublicApiPath", () => {
  it("classifies /api paths", () => {
    expect(isApiPath("/api")).toBe(true);
    expect(isApiPath("/api/teams")).toBe(true);
    expect(isApiPath("/apiary")).toBe(false);
    expect(isApiPath("/teams")).toBe(false);
  });

  it("keeps Auth.js, share reads, and logout public", () => {
    expect(isPublicApiPath("/api/auth/session")).toBe(true);
    expect(isPublicApiPath("/api/auth")).toBe(true);
    expect(isPublicApiPath("/api/watch/tok")).toBe(true);
    expect(isPublicApiPath("/api/logout")).toBe(true);
    expect(isPublicApiPath("/api/teams")).toBe(false);
    expect(isPublicApiPath("/api/authenticate")).toBe(false);
  });
});

describe("resolveAuthGate", () => {
  it("allows every route when auth mode is disabled", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/teams/create", authEnabled: false })).toBe(
      "allow",
    );
  });

  it("allows protected API paths when auth mode is disabled", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/api/teams", authEnabled: false })).toBe(
      "allow",
    );
  });

  it("redirects an unauthenticated user on a protected route to /login", () => {
    expect(
      resolveAuthGate({ auth: null, pathname: "/teams/create", authEnabled: true }),
    ).toBe("redirect-login");
  });

  it("denies an unauthenticated protected API path with deny-api (401 JSON)", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/api/teams", authEnabled: true })).toBe(
      "deny-api",
    );
    expect(resolveAuthGate({ auth: null, pathname: "/api/leagues/l1", authEnabled: true })).toBe(
      "deny-api",
    );
  });

  it("allows an authenticated user on a protected API path", () => {
    expect(
      resolveAuthGate({
        auth: { user: { id: "u1" } } as never,
        pathname: "/api/teams",
        authEnabled: true,
      }),
    ).toBe("allow");
  });

  it("allows the public API prefixes even for anonymous callers", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/api/auth/session", authEnabled: true })).toBe(
      "allow",
    );
    expect(resolveAuthGate({ auth: null, pathname: "/api/watch/tok", authEnabled: true })).toBe(
      "allow",
    );
    expect(resolveAuthGate({ auth: null, pathname: "/api/logout", authEnabled: true })).toBe(
      "allow",
    );
  });

  it("allows an authenticated user on a protected route", () => {
    expect(
      resolveAuthGate({ auth: { user: { id: "u1" } } as never, pathname: "/", authEnabled: true }),
    ).toBe("allow");
  });

  it("redirects an authenticated user away from /login to home", () => {
    expect(
      resolveAuthGate({ auth: { user: { id: "u1" } } as never, pathname: "/login", authEnabled: true }),
    ).toBe("redirect-home");
  });

  it("redirects an authenticated user away from /signup to home", () => {
    expect(
      resolveAuthGate({ auth: { user: { id: "u1" } } as never, pathname: "/signup", authEnabled: true }),
    ).toBe("redirect-home");
  });

  it("allows an unauthenticated user to reach the auth pages", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/login", authEnabled: true })).toBe("allow");
    expect(resolveAuthGate({ auth: null, pathname: "/signup", authEnabled: true })).toBe("allow");
  });

  it("allows an unauthenticated user on the public landing (root)", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/", authEnabled: true })).toBe("allow");
  });

  it("allows an unauthenticated user on the public share prefix", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/watch/abc123", authEnabled: true })).toBe(
      "allow",
    );
    expect(resolveAuthGate({ auth: null, pathname: "/watch", authEnabled: true })).toBe("allow");
  });

  it("allows an authenticated user on the public share prefix", () => {
    expect(
      resolveAuthGate({
        auth: { user: { id: "u1" } } as never,
        pathname: "/watch/abc123",
        authEnabled: true,
      }),
    ).toBe("allow");
  });

  it("does not open a route that merely starts with the watch word", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/watchdog", authEnabled: true })).toBe(
      "redirect-login",
    );
  });

  it("keeps redirecting an unauthenticated user on protected routes other than the landing", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/teams", authEnabled: true })).toBe(
      "redirect-login",
    );
    expect(resolveAuthGate({ auth: null, pathname: "/leagues", authEnabled: true })).toBe(
      "redirect-login",
    );
    expect(resolveAuthGate({ auth: null, pathname: "/teams/create", authEnabled: true })).toBe(
      "redirect-login",
    );
  });
});
