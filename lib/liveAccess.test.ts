import { describe, expect, it } from "vitest";
import { resolveLiveAccess, type LiveAccessInput } from "./liveAccess";

/**
 * Role matrix for the live-match access gate (AC-1/LM-2, D9). The SSE routes in
 * slice 2 consume this pure decision function; control POSTs use the same gate
 * with `action: "control"`.
 */
const startedLeague: LiveAccessInput["league"] = {
  ownerId: "owner-1",
  status: "started",
  memberUserIds: ["member-1"],
};
const openLeague: LiveAccessInput["league"] = {
  ownerId: "owner-1",
  status: "open",
  memberUserIds: ["member-1"],
};

describe("resolveLiveAccess", () => {
  it("returns 401 when auth is disabled (local-mode parity)", () => {
    expect(
      resolveLiveAccess({
        authEnabled: false,
        userId: "user-1",
        league: openLeague,
        action: "read",
      }),
    ).toBe(401);
  });

  it("returns 401 when there is no session in auth mode", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: null,
        league: openLeague,
        action: "read",
      }),
    ).toBe(401);
  });

  it("returns 404 when the league is unknown/missing (no existence leak)", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "user-1",
        league: null,
        action: "read",
      }),
    ).toBe(404);
  });

  it("allows any authenticated user to read an OPEN league (200 semantics)", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "some-guest",
        league: openLeague,
        action: "read",
      }),
    ).toBe("allow");
  });

  it("returns 404 for a foreign non-member reading a STARTED league", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "guest",
        league: startedLeague,
        action: "read",
      }),
    ).toBe(404);
  });

  it("allows the owner to read a STARTED league", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "owner-1",
        league: startedLeague,
        action: "read",
      }),
    ).toBe("allow");
  });

  it("allows any member to read a STARTED league", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "member-1",
        league: startedLeague,
        action: "read",
      }),
    ).toBe("allow");
  });

  it("returns 403 for a known-but-unauthorized user attempting control on an OPEN league", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "guest",
        league: openLeague,
        action: "control",
      }),
    ).toBe(403);
  });

  it("returns 404 for a foreign non-member attempting control on a STARTED league (no leak)", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "guest",
        league: startedLeague,
        action: "control",
      }),
    ).toBe(404);
  });

  it("allows the owner to control an OPEN league", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "owner-1",
        league: openLeague,
        action: "control",
      }),
    ).toBe("allow");
  });

  it("allows a member to control an OPEN league", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "member-1",
        league: openLeague,
        action: "control",
      }),
    ).toBe("allow");
  });

  it("allows the owner to control a STARTED league", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "owner-1",
        league: startedLeague,
        action: "control",
      }),
    ).toBe("allow");
  });

  it("allows a member to control a STARTED league", () => {
    expect(
      resolveLiveAccess({
        authEnabled: true,
        userId: "member-1",
        league: startedLeague,
        action: "control",
      }),
    ).toBe("allow");
  });
});
