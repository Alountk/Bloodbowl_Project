import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onRequestError, register } from "./instrumentation";
import { REDACTED } from "./lib/logger";

/** Captures the logger's writes without touching a terminal. */
function captureStreams() {
  const out: string[] = [];
  const err: string[] = [];
  const logSpy = vi.spyOn(console, "log").mockImplementation(((line: string) => {
    out.push(line);
  }) as never);
  const errorSpy = vi.spyOn(console, "error").mockImplementation(((line: string) => {
    err.push(line);
  }) as never);
  return {
    out,
    err,
    restore: () => {
      logSpy.mockRestore();
      errorSpy.mockRestore();
    },
  };
}

const parse = (lines: string[]) => lines.map((l) => JSON.parse(l) as Record<string, unknown>);

let streams: ReturnType<typeof captureStreams>;

beforeEach(() => {
  streams = captureStreams();
});

afterEach(() => {
  streams.restore();
  vi.unstubAllEnvs();
});

/** The error context Next.js hands to `onRequestError`. */
const context = {
  routerKind: "App Router" as const,
  routePath: "/api/teams/[id]",
  routeType: "route" as const,
  renderSource: undefined,
  revalidateReason: undefined,
};

describe("register", () => {
  it("emits one boot line naming the running configuration", () => {
    vi.stubEnv("AUTH_MODE", "local");
    vi.stubEnv("NODE_ENV", "production");

    register();

    const line = parse(streams.out)[0];
    expect(line.event).toBe("server.boot");
    expect(line.level).toBe("info");
    expect(line.env).toBe("production");
    expect(line.authMode).toBe("local");
    expect(line.runtime).toBe("nodejs");
  });

  it("warns once when AUTH_MODE=auth has no AUTH_SECRET", () => {
    vi.stubEnv("AUTH_MODE", "auth");
    vi.stubEnv("AUTH_SECRET", "");

    register();

    expect(parse(streams.err)[0].event).toBe("server.misconfigured");
  });

  it("does not warn when the auth secret is present", () => {
    vi.stubEnv("AUTH_MODE", "auth");
    vi.stubEnv("AUTH_SECRET", "s3cret");

    register();

    expect(streams.err).toHaveLength(0);
  });
});

describe("onRequestError", () => {
  it("logs the route context and the serialized error", async () => {
    await onRequestError(
      Object.assign(new Error("db down"), { digest: "710933293" }),
      { path: "/api/teams/t1", method: "POST", headers: { "user-agent": "vitest" } },
      context,
    );

    const line = parse(streams.err)[0];
    expect(line.event).toBe("request.error");
    expect(line.level).toBe("error");
    expect(line.method).toBe("POST");
    expect(line.path).toBe("/api/teams/t1");
    expect(line.routePath).toBe("/api/teams/[id]");
    expect(line.routeType).toBe("route");
    expect(line.routerKind).toBe("App Router");
    expect(line.userAgent).toBe("vitest");
    expect((line.error as Record<string, unknown>).message).toBe("db down");
    expect((line.error as Record<string, unknown>).digest).toBe("710933293");
  });

  it("never emits cookies or the authorization header", async () => {
    await onRequestError(
      new Error("boom"),
      {
        path: "/api/me",
        method: "PATCH",
        headers: {
          cookie: "authjs.session-token=super-secret",
          authorization: "Bearer super-secret",
        },
      },
      context,
    );

    const raw = streams.err.join("");
    expect(raw).not.toContain("super-secret");
    expect(parse(streams.err)[0].cookie).toBeUndefined();
    expect(parse(streams.err)[0].authorization).toBeUndefined();
  });

  it("masks the /watch share token in the logged path", async () => {
    const token = "f".repeat(64);

    await onRequestError(
      new Error("boom"),
      { path: `/watch/${token}`, method: "GET", headers: {} },
      context,
    );

    const line = parse(streams.err)[0];
    expect(line.path).toBe(`/watch/${REDACTED}`);
    expect(streams.err.join("")).not.toContain(token);
  });

  it("omits the optional render context when Next does not provide it", async () => {
    await onRequestError(
      new Error("boom"),
      { path: "/api/teams", method: "GET", headers: {} },
      context,
    );

    const line = parse(streams.err)[0];
    expect(line.renderSource).toBeUndefined();
    expect(line.revalidateReason).toBeUndefined();
    expect(line.userAgent).toBeUndefined();
  });
});
