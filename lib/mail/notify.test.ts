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

import { notifyDateProposed, type NotifyDateProposedParams } from "./notify";

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
  sendMailMock.mockResolvedValue(true);
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
});
