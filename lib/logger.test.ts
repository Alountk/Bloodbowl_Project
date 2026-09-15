import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  REDACTED,
  log,
  logError,
  logger,
  redactValue,
  sanitizePath,
  serializeError,
} from "./logger";

/**
 * Captures what the logger writes, without touching a terminal. The logger goes
 * through `console` (portable across the Node and edge runtimes), so the spies
 * sit on `console.log` / `console.error`.
 */
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

/** The single parsed line the logger emitted on `out`. */
function onlyLine(lines: string[]): Record<string, unknown> {
  expect(lines).toHaveLength(1);
  return JSON.parse(lines[0]) as Record<string, unknown>;
}

let streams: ReturnType<typeof captureStreams>;

beforeEach(() => {
  streams = captureStreams();
});

afterEach(() => {
  streams.restore();
  vi.unstubAllEnvs();
});

describe("log — shape and routing", () => {
  it("writes exactly one JSON line carrying ts, level and event", () => {
    logger.info("team.created", { teamId: "t1" });

    const line = onlyLine(streams.out);
    expect(line.event).toBe("team.created");
    expect(line.level).toBe("info");
    expect(line.teamId).toBe("t1");
    expect(typeof line.ts).toBe("string");
    expect(new Date(line.ts as string).toISOString()).toBe(line.ts);
  });

  it("routes warn and error to stderr, debug and info to stdout", () => {
    logger.debug("a");
    logger.info("b");
    logger.warn("c");
    logger.error("d");

    expect(streams.out.map((l) => JSON.parse(l).event)).toEqual(["a", "b"]);
    expect(streams.err.map((l) => JSON.parse(l).event)).toEqual(["c", "d"]);
  });

  it("lets caller fields never overwrite level, event or ts", () => {
    log("info", "real.event", { level: "hacked", event: "hacked", ts: "hacked" });

    const line = onlyLine(streams.out);
    expect(line.level).toBe("info");
    expect(line.event).toBe("real.event");
    expect(line.ts).not.toBe("hacked");
  });
});

describe("log — level threshold", () => {
  it("suppresses anything below LOG_LEVEL", () => {
    vi.stubEnv("LOG_LEVEL", "warn");

    logger.debug("dropped");
    logger.info("dropped");
    logger.warn("kept");

    expect(streams.out).toHaveLength(0);
    expect(onlyLine(streams.err).event).toBe("kept");
  });

  it("emits everything at debug", () => {
    vi.stubEnv("LOG_LEVEL", "debug");

    logger.debug("kept");

    expect(onlyLine(streams.out).event).toBe("kept");
  });

  it("falls back to info in production for an invalid level", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    vi.stubEnv("NODE_ENV", "production");

    logger.debug("dropped");
    logger.info("kept");

    expect(onlyLine(streams.out).event).toBe("kept");
  });

  it("falls back to debug outside production for an invalid level", () => {
    vi.stubEnv("LOG_LEVEL", "verbose");
    vi.stubEnv("NODE_ENV", "development");

    logger.debug("kept");

    expect(onlyLine(streams.out).event).toBe("kept");
  });
});

describe("redaction", () => {
  it("masks every sensitive key, at any depth and in arrays", () => {
    const redacted = redactValue({
      password: "p",
      newPassword: "p",
      bbThemeToken: "t",
      authorization: "Bearer x",
      cookie: "s=1",
      sessionId: "s",
      apiKey: "k",
      "x-api-key": "k",
      dsn: "https://x",
      user: { credentials: "c", name: "Coach" },
      tokens: ["a", "b"],
      list: [{ password: "p" }, { name: "ok" }],
    }) as Record<string, unknown>;

    for (const key of [
      "password",
      "newPassword",
      "bbThemeToken",
      "authorization",
      "cookie",
      "sessionId",
      "apiKey",
      "x-api-key",
      "dsn",
    ]) {
      expect(redacted[key], key).toBe(REDACTED);
    }
    expect((redacted.user as Record<string, unknown>).credentials).toBe(REDACTED);
    expect((redacted.user as Record<string, unknown>).name).toBe("Coach");
    // A sensitive KEY redacts its whole value, array included…
    expect(redacted.tokens).toBe(REDACTED);
    // …while a non-sensitive array key still redacts per element.
    expect(redacted.list).toEqual([{ password: REDACTED }, { name: "ok" }]);
  });

  it("masks sensitive keys on the emitted line, not just in the helper", () => {
    logger.info("auth.attempt", { email: "c@x.com", password: "hunter2" });

    const line = onlyLine(streams.out);
    expect(line.password).toBe(REDACTED);
    expect(line.email).toBe("c@x.com");
  });

  it("bounds arrays and depth so one payload cannot flood a line", () => {
    const deep: Record<string, unknown> = {};
    let cursor = deep;
    for (let i = 0; i < 10; i++) {
      cursor.next = {};
      cursor = cursor.next as Record<string, unknown>;
    }

    const redacted = redactValue({ many: Array.from({ length: 200 }, (_, i) => i), deep }) as {
      many: unknown[];
      deep: Record<string, unknown>;
    };

    expect(redacted.many).toHaveLength(50);
    expect(JSON.stringify(redacted.deep)).toContain("[truncated]");
  });
});

describe("sanitizePath", () => {
  it("masks the opaque share token so the /watch secret never lands in a log", () => {
    const token = "a".repeat(64);

    expect(sanitizePath(`/watch/${token}`)).toBe(`/watch/${REDACTED}`);
  });

  it("drops the query string wholesale", () => {
    expect(sanitizePath("/api/teams?token=secret&x=1")).toBe("/api/teams?[query]");
  });

  it("keeps short, human-readable ids readable", () => {
    expect(sanitizePath("/teams/cmu2qqxbs007guqcp81pk1wy7")).toBe(
      "/teams/cmu2qqxbs007guqcp81pk1wy7",
    );
  });
});

describe("serializeError", () => {
  it("keeps name, message, a bounded stack and the React digest", () => {
    const error = Object.assign(new Error("boom"), { digest: "710933293" });
    error.stack = Array.from({ length: 40 }, (_, i) => `at frame ${i}`).join("\n");

    const serialized = serializeError(error);

    expect(serialized.name).toBe("Error");
    expect(serialized.message).toBe("boom");
    expect(serialized.digest).toBe("710933293");
    expect((serialized.stack as string).split("\n")).toHaveLength(12);
  });

  it("degrades a string and a circular object without throwing", () => {
    expect(serializeError("plain failure")).toEqual({
      name: "NonError",
      message: "plain failure",
    });

    const circular: Record<string, unknown> = { a: 1 };
    circular.self = circular;
    expect(() => serializeError(circular)).not.toThrow();
    expect(serializeError(circular).name).toBe("NonError");
  });
});

describe("resilience", () => {
  it("never throws when the console itself fails", () => {
    vi.spyOn(console, "log").mockImplementation((() => {
      throw new Error("EPIPE");
    }) as never);

    expect(() => logger.info("boot")).not.toThrow();
  });

  it("never throws on a payload that cannot be serialized", () => {
    const circular: Record<string, unknown> = {};
    circular.self = circular;

    expect(() => logger.info("weird", { circular })).not.toThrow();
  });
});

describe("logError", () => {
  it("wraps the thrown value under a uniform error field", () => {
    logError("team.create.failed", new Error("db down"), { teamId: "t1" });

    const line = onlyLine(streams.err);
    expect(line.event).toBe("team.create.failed");
    expect(line.level).toBe("error");
    expect(line.teamId).toBe("t1");
    expect((line.error as Record<string, unknown>).message).toBe("db down");
  });
});
