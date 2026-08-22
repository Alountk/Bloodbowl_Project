import { describe, expect, it } from "vitest";
import { isAuthEnabled, resolveAuthGate } from "./auth-mode";

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

describe("resolveAuthGate", () => {
  it("allows every route when auth mode is disabled", () => {
    expect(resolveAuthGate({ auth: null, pathname: "/teams/create", authEnabled: false })).toBe(
      "allow",
    );
  });

  it("redirects an unauthenticated user on a protected route to /login", () => {
    expect(
      resolveAuthGate({ auth: null, pathname: "/teams/create", authEnabled: true }),
    ).toBe("redirect-login");
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
