import { describe, expect, it } from "vitest";
import { dateProposedMail, type DateProposedMailParams } from "./templates";

const DATE = new Date("2026-03-01T10:00:00.000Z");

function build(overrides: Partial<DateProposedMailParams> = {}): DateProposedMailParams {
  return {
    to: "coach@example.com",
    locale: "es",
    leagueName: "Liga de Prueba",
    proposerName: "Ana",
    opponentTeam: "Orcos",
    date: DATE,
    url: "https://bb.example/leagues/l1",
    ...overrides,
  };
}

describe("dateProposedMail", () => {
  it("renders Spanish copy with the localized date and the url", () => {
    const mail = dateProposedMail(build());

    expect(mail.to).toBe("coach@example.com");
    expect(mail.subject).toBe("Nueva fecha propuesta — Liga de Prueba");
    expect(mail.text).toContain("Ana ha propuesto una nueva fecha");
    expect(mail.text).toContain("Orcos");
    // es-ES month name + year prove the date is localized, not the raw ISO string.
    expect(mail.text).toContain("marzo");
    expect(mail.text).toContain("2026");
    expect(mail.text).toContain("https://bb.example/leagues/l1");
    expect(mail.html).toContain("https://bb.example/leagues/l1");
  });

  it("renders English copy when the locale is en", () => {
    const mail = dateProposedMail(build({ locale: "en" }));

    expect(mail.subject).toBe("New date proposed — Liga de Prueba");
    expect(mail.text).toContain("Ana proposed a new date");
    expect(mail.text).toContain("Orcos");
    expect(mail.text).toContain("March");
    expect(mail.text).toContain("2026");
    expect(mail.text).toContain("https://bb.example/leagues/l1");
  });

  it("falls back to a neutral sender name when the proposer has no name", () => {
    expect(dateProposedMail(build({ proposerName: "  " })).text).toContain(
      "Un entrenador",
    );
    expect(
      dateProposedMail(build({ locale: "en", proposerName: "" })).text,
    ).toContain("A coach");
  });

  it("escapes user-controlled names before interpolating into HTML", () => {
    const mail = dateProposedMail(
      build({ opponentTeam: '<script>alert("x")</script>' }),
    );

    expect(mail.html).not.toContain("<script>");
    expect(mail.html).toContain("&lt;script&gt;");
  });
});
