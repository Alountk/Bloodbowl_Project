import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const prismaMock = vi.hoisted(() => ({ user: { findUnique: vi.fn() } }));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

const sendMailMock = vi.hoisted(() => vi.fn());
vi.mock("./index", () => ({ sendMail: sendMailMock }));

const logErrorMock = vi.hoisted(() => vi.fn());
const loggerMock = vi.hoisted(() => ({
  debug: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
}));
vi.mock("@/lib/logger", () => ({ logError: logErrorMock, logger: loggerMock }));

import {
  notifyDateProposed,
  notifyEmailVerification,
  type NotifyDateProposedParams,
} from "./notify";

function build(overrides: Partial<NotifyDateProposedParams> = {}): NotifyDateProposedParams {
  return {
    leagueName: "Liga de Prueba",
    homeTeam: { name: "Halcones", userId: "user-1" },
    awayTeam: { name: "Orcos", userId: "user-2" },
    proposerUserId: "user-1",
    date: new Date("2026-03-01T10:00:00.000Z"),
    leagueId: "l1",
    fixtureId: "f1",
    ...overrides,
  };
}

/** Resolves a user row by id from a lookup table. */
function stubUsers(rows: Record<string, unknown>) {
  prismaMock.user.findUnique.mockImplementation(
    async ({ where }: { where: { id: string } }) => rows[where.id] ?? null,
  );
}

beforeEach(() => {
  vi.clearAllMocks();
  sendMailMock.mockResolvedValue("delivered");
  vi.stubEnv("APP_URL", "https://bb.example");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("notifyDateProposed", () => {
  it("emails the counterpart and not the proposer, with a league link", async () => {
    stubUsers({
      "user-1": { name: "Ana" },
      "user-2": { email: "bea@example.com", name: "Bea", locale: "en" },
    });

    await notifyDateProposed(build());

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.to).toBe("bea@example.com");
    expect(mail.subject).toContain("New date proposed");
    // The recipient's opponent is the proposer's team (the home side here).
    expect(mail.text).toContain("Halcones");
    expect(mail.text).toContain("https://bb.example/leagues/l1");
    // The proposer was only looked up for a display name — never emailed.
    expect(sendMailMock).not.toHaveBeenCalledWith(
      expect.objectContaining({ to: "ana@example.com" }),
    );
  });

  it("logs the sent event with the userId, never the email address", async () => {
    stubUsers({
      "user-1": { name: "Ana" },
      "user-2": { email: "bea@example.com", name: "Bea", locale: "es" },
    });

    await notifyDateProposed(build());

    expect(loggerMock.info).toHaveBeenCalledWith("mail.dateProposed.sent", {
      fixtureId: "f1",
      userId: "user-2",
    });
    expect(JSON.stringify(loggerMock.info.mock.calls)).not.toContain("bea@example.com");
  });

  it("skips a recipient without an email", async () => {
    stubUsers({
      "user-1": { name: "Ana" },
      "user-2": { email: null, name: "Bea", locale: "es" },
    });

    await notifyDateProposed(build());

    expect(sendMailMock).not.toHaveBeenCalled();
  });

  it("emails both owners when a privileged non-participant proposes", async () => {
    stubUsers({
      "dev-9": { name: "Admin" },
      "user-1": { email: "ana@example.com", name: "Ana", locale: "es" },
      "user-2": { email: "bea@example.com", name: "Bea", locale: "es" },
    });

    await notifyDateProposed(build({ proposerUserId: "dev-9" }));

    expect(sendMailMock).toHaveBeenCalledTimes(2);
    const recipients = sendMailMock.mock.calls.map((call) => call[0].to).sort();
    expect(recipients).toEqual(["ana@example.com", "bea@example.com"]);
  });

  it("falls back to a relative league link when APP_URL is unset", async () => {
    vi.stubEnv("APP_URL", "");
    stubUsers({
      "user-1": { name: "Ana" },
      "user-2": { email: "bea@example.com", name: "Bea", locale: "es" },
    });

    await notifyDateProposed(build());

    expect(sendMailMock.mock.calls[0][0].text).toContain("/leagues/l1");
  });

  it("never throws and logs when sending fails", async () => {
    stubUsers({
      "user-1": { name: "Ana" },
      "user-2": { email: "bea@example.com", name: "Bea", locale: "es" },
    });
    sendMailMock.mockRejectedValue(new Error("smtp down"));

    await expect(notifyDateProposed(build())).resolves.toBeUndefined();

    expect(logErrorMock).toHaveBeenCalledWith(
      "mail.dateProposed.failed",
      expect.any(Error),
      { fixtureId: "f1", leagueId: "l1" },
    );
  });

  it("never throws when the recipient lookup fails", async () => {
    prismaMock.user.findUnique.mockRejectedValue(new Error("db down"));

    await expect(notifyDateProposed(build())).resolves.toBeUndefined();

    expect(logErrorMock).toHaveBeenCalledWith(
      "mail.dateProposed.failed",
      expect.any(Error),
      expect.objectContaining({ fixtureId: "f1" }),
    );
  });

  it("warns with notDelivered (never .sent) when auth mode has no mail provider", async () => {
    vi.stubEnv("AUTH_MODE", "auth");
    sendMailMock.mockResolvedValue("printed");
    stubUsers({
      "user-1": { name: "Ana" },
      "user-2": { email: "bea@example.com", name: "Bea", locale: "es" },
    });

    await notifyDateProposed(build());

    expect(loggerMock.warn).toHaveBeenCalledWith("mail.dateProposed.notDelivered", {
      fixtureId: "f1",
      userId: "user-2",
      transport: "console",
      reason: expect.stringContaining("RESEND_API_KEY"),
    });
    expect(loggerMock.info).not.toHaveBeenCalledWith(
      "mail.dateProposed.sent",
      expect.anything(),
    );
  });
});

describe("notifyEmailVerification", () => {
  const params = {
    userId: "user-1",
    email: "coach@example.com",
    locale: "es",
    code: "123456",
    token: "tok-abc",
  };

  it("mails the code and an absolute link built from APP_URL with slashes stripped", async () => {
    vi.stubEnv("APP_URL", "https://bb.example///");

    await notifyEmailVerification(params);

    expect(sendMailMock).toHaveBeenCalledTimes(1);
    const mail = sendMailMock.mock.calls[0][0];
    expect(mail.to).toBe("coach@example.com");
    expect(mail.text).toContain("123456");
    // Both halves ride in the query: the stored hashes are domain-separated
    // by the address, so the verify screen must POST the pair back.
    expect(mail.text).toContain(
      "https://bb.example/verify?token=tok-abc&email=coach%40example.com",
    );
    expect(mail.html).toContain('href="https://bb.example/verify?');
    expect(loggerMock.info).toHaveBeenCalledWith("mail.verification.sent", {
      userId: "user-1",
    });
    // The logger does not redact addresses: logs carry userId only.
    expect(JSON.stringify(loggerMock.info.mock.calls)).not.toContain(
      "coach@example.com",
    );
  });

  it("falls back to a relative link when APP_URL is unset", async () => {
    vi.stubEnv("APP_URL", "");

    await notifyEmailVerification(params);

    expect(sendMailMock.mock.calls[0][0].text).toContain("/verify?token=");
    expect(sendMailMock.mock.calls[0][0].text).not.toContain("undefined/verify");
  });

  it("never throws when the transport fails and logs with userId only", async () => {
    sendMailMock.mockRejectedValue(new Error("smtp down"));

    await expect(notifyEmailVerification(params)).resolves.toBeUndefined();

    expect(logErrorMock).toHaveBeenCalledWith(
      "mail.verification.failed",
      expect.any(Error),
      { userId: "user-1" },
    );
    expect(JSON.stringify(logErrorMock.mock.calls)).not.toContain(
      "coach@example.com",
    );
  });

  // The dishonesty guard (#197 review, MAJOR): a default AUTH_MODE=auth deploy
  // with no RESEND_API_KEY prints the code to stdout — the outcome must be a
  // warning, and `.sent` (which the verify UI's resend trust turns into a
  // permanent lockout story) must never be claimed for it.
  it("never claims .sent when only the console printed the code in auth mode", async () => {
    vi.stubEnv("AUTH_MODE", "auth");
    sendMailMock.mockResolvedValue("printed");

    await notifyEmailVerification(params);

    expect(loggerMock.warn).toHaveBeenCalledWith("mail.verification.notDelivered", {
      userId: "user-1",
      transport: "console",
      reason: expect.stringContaining("RESEND_API_KEY"),
    });
    expect(loggerMock.info).not.toHaveBeenCalledWith(
      "mail.verification.sent",
      expect.anything(),
    );
  });

  it("logs the print as informational in local mode (console is the intended sink)", async () => {
    vi.stubEnv("AUTH_MODE", "local");
    sendMailMock.mockResolvedValue("printed");

    await notifyEmailVerification(params);

    expect(loggerMock.info).toHaveBeenCalledWith("mail.verification.printed", {
      userId: "user-1",
      transport: "console",
    });
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });

  it("writes no claim line when the send failed (sendMail logged mail.failed already)", async () => {
    sendMailMock.mockResolvedValue("failed");

    await notifyEmailVerification(params);

    expect(loggerMock.info).not.toHaveBeenCalledWith(
      "mail.verification.sent",
      expect.anything(),
    );
    expect(loggerMock.warn).not.toHaveBeenCalled();
  });
});
