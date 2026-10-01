import { describe, expect, it } from "vitest";
import {
  dateProposedMail,
  verificationMail,
  type DateProposedMailParams,
  type VerificationMailParams,
} from "./templates";
import { CODE_TTL_MS, LINK_TOKEN_TTL_MS } from "@/lib/verification";

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

function buildVerification(
  overrides: Partial<VerificationMailParams> = {},
): VerificationMailParams {
  return {
    to: "coach@example.com",
    locale: "es",
    code: "123456",
    url: "https://bb.example/verify?token=abc&email=coach%40example.com",
    ...overrides,
  };
}

describe("verificationMail", () => {
  it("renders Spanish copy with the code, the link, and both paths stated", () => {
    const mail = verificationMail(buildVerification());

    expect(mail.to).toBe("coach@example.com");
    expect(mail.subject).toBe("Confirma tu dirección de correo");
    expect(mail.text).toContain("Código de confirmación: 123456");
    // The link is carried in full, and the copy says the closed-tab fallback exists…
    expect(mail.text).toContain(
      "https://bb.example/verify?token=abc&email=coach%40example.com",
    );
    expect(mail.text).toContain("por si cierras el alta sin querer");
    // …and that EITHER path activates the account.
    expect(mail.text).toContain(
      "Tanto el código como el enlace activan la cuenta",
    );
    expect(mail.html).toContain('href="https://bb.example/verify?token=abc');
    expect(mail.html).toContain("123456");
  });

  it("renders English copy when the locale is en", () => {
    const mail = verificationMail(buildVerification({ locale: "en" }));

    expect(mail.subject).toBe("Confirm your email address");
    expect(mail.text).toContain("Confirmation code: 123456");
    expect(mail.text).toContain(
      "https://bb.example/verify?token=abc&email=coach%40example.com",
    );
    expect(mail.text).toContain(
      "Either the code or the link activates the account",
    );
    expect(mail.html).toContain("Either the code or the link activates");
  });

  it("keeps the link absolute in the HTML anchor", () => {
    const mail = verificationMail(
      buildVerification({ url: "https://bb.example/verify?token=t&email=a@b.es" }),
    );
    expect(mail.html).toMatch(/href="https:\/\/bb\.example\/verify\?/);
    // A relative link would break in mail clients that have no base URL.
    expect(mail.html).not.toContain('href="/verify');
  });

  it("escapes the interpolated url (and therefore its query separators)", () => {
    const mail = verificationMail(
      buildVerification({ url: "https://bb.example/verify?token=a&email=b@c.es" }),
    );
    expect(mail.html).toContain("token=a&amp;email=b");
    expect(mail.html).not.toContain("token=a&email=b");
    // The plain-text body keeps the URL raw so it stays copy-pasteable.
    expect(mail.text).toContain("token=a&email=b");
  });

  it("quotes the TTLs that lib/verification.ts enforces", () => {
    const es = verificationMail(buildVerification());
    const en = verificationMail(buildVerification({ locale: "en" }));
    const minutes = CODE_TTL_MS / 60_000;
    const hours = LINK_TOKEN_TTL_MS / (60 * 60 * 1000);
    expect(en.text).toContain(`${minutes} minutes`);
    expect(en.text).toContain(`${hours} hours`);
    expect(es.text).toContain(`${minutes} minutos`);
    expect(es.text).toContain(`${hours} horas`);
  });
});
