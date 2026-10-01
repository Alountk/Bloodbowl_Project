import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { resolveTransport, sendMail } from "./index";
import type { MailMessage } from "./transport";

const message: MailMessage = {
  to: "coach@example.com",
  subject: "Nueva fecha",
  html: "<p>hola</p>",
  text: "hola",
};

/** Captures the structured lines the logger writes to stdout/stderr. */
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

let streams: ReturnType<typeof captureStreams>;

beforeEach(() => {
  streams = captureStreams();
});

afterEach(() => {
  streams.restore();
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("resolveTransport", () => {
  it("returns the Resend transport when both env vars are set", () => {
    vi.stubEnv("RESEND_API_KEY", "key-123");
    vi.stubEnv("MAIL_FROM", "BB <no-reply@x.com>");

    expect(resolveTransport().name).toBe("resend");
  });

  it("returns the console transport when neither env var is set", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");

    expect(resolveTransport().name).toBe("console");
  });

  it("returns the console transport when only the key is set", () => {
    vi.stubEnv("RESEND_API_KEY", "key-123");
    vi.stubEnv("MAIL_FROM", "");

    expect(resolveTransport().name).toBe("console");
  });

  it("returns the console transport when only the from address is set", () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "BB <no-reply@x.com>");

    expect(resolveTransport().name).toBe("console");
  });
});

describe("sendMail", () => {
  it("returns printed and logs mail.printed on the console transport", async () => {
    vi.stubEnv("RESEND_API_KEY", "");
    vi.stubEnv("MAIL_FROM", "");

    await expect(sendMail(message)).resolves.toBe("printed");

    // The transport line must claim a print, never a delivery — `printed` is
    // what notify.ts maps to a warning in AUTH_MODE=auth.
    expect(JSON.parse(streams.out[0])).toMatchObject({
      event: "mail.printed",
      transport: "console",
    });
  });

  it("returns delivered (and logs nothing extra) when the provider accepts the message", async () => {
    vi.stubEnv("RESEND_API_KEY", "key-123");
    vi.stubEnv("MAIL_FROM", "BB <no-reply@x.com>");
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200 }));

    await expect(sendMail(message)).resolves.toBe("delivered");

    expect(streams.out).toEqual([]);
    expect(streams.err).toEqual([]);
  });

  it("returns failed, logs mail.failed and never throws when the transport fails", async () => {
    vi.stubEnv("RESEND_API_KEY", "key-123");
    vi.stubEnv("MAIL_FROM", "BB <no-reply@x.com>");
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("provider down")));

    await expect(sendMail(message)).resolves.toBe("failed");

    const line = JSON.parse(streams.err[0]);
    expect(line.event).toBe("mail.failed");
    expect(line.level).toBe("error");
    expect(line.subject).toBe("Nueva fecha");
    expect((line.error as Record<string, unknown>).message).toBe("provider down");
  });
});
