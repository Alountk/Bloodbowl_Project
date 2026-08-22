import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_LOCALE, dictionaries, t } from "./dictionaries";
import { I18nProvider, useI18n } from "./index";

const COOKIE_KEY = "bb-locale";

/** Sets the persisted locale cookie the way the app does (max-age 1 year). */
function setLocaleCookie(locale: string) {
  document.cookie = `${COOKIE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

function stubNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language,
  });
}

function Probe() {
  const i18n = useI18n();
  return (
    <div>
      <span data-testid="locale">{i18n.locale}</span>
      <span data-testid="nav-teams">{i18n.t("nav.teams")}</span>
      <button type="button" onClick={() => i18n.setLocale("en")}>
        switch-to-en
      </button>
    </div>
  );
}

afterEach(() => {
  window.localStorage.clear();
  document.cookie = "bb-locale=; path=/; max-age=0";
  stubNavigatorLanguage("en-US");
});

describe("t (dictionaries)", () => {
  it("replaces {name} params with the provided values", () => {
    expect(t("es", "match.turnOf", { team: "Reavers" })).toBe("Turno de Reavers");
    expect(t("en", "match.turnOf", { team: "Reavers" })).toBe("Reavers's turn");
    expect(t("es", "teams.deleteAction", { name: 7 })).toBe("Eliminar 7");
  });

  it("returns the key itself when the key is missing", () => {
    expect(t("es", "missing.key")).toBe("missing.key");
    expect(t("en", "missing.key", { team: "Reavers" })).toBe("missing.key");
  });

  it("leaves unknown placeholders untouched instead of crashing", () => {
    expect(t("es", "match.turnOf", {})).toBe("Turno de {team}");
  });

  it("exports the Spanish default locale", () => {
    expect(DEFAULT_LOCALE).toBe("es");
  });

  it("keeps es and en dictionaries key-for-key in sync", () => {
    const esKeys = Object.keys(dictionaries.es).sort();
    const enKeys = Object.keys(dictionaries.en).sort();
    expect(enKeys).toEqual(esKeys);
    expect(esKeys.length).toBeGreaterThan(20);
  });
});

describe("useI18n without a provider", () => {
  it("falls back to the es dictionary", () => {
    render(<Probe />);
    expect(screen.getByTestId("locale").textContent).toBe("es");
    expect(screen.getByTestId("nav-teams").textContent).toBe("Equipos");
  });

  it("setLocale is a no-op without a provider", () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "switch-to-en" }));
    expect(screen.getByTestId("locale").textContent).toBe("es");
  });
});

describe("I18nProvider", () => {
  it("initializes from the bb-locale cookie", () => {
    setLocaleCookie("en");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("nav-teams").textContent).toBe("Teams");
  });

  it("initialLocale (SSR cookie) wins over the client cookie", () => {
    setLocaleCookie("en");
    render(
      <I18nProvider initialLocale="es">
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("es");
    expect(screen.getByTestId("nav-teams").textContent).toBe("Equipos");
  });

  it("falls back to the browser language when no cookie is present (en → English)", () => {
    stubNavigatorLanguage("en-US");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("nav-teams").textContent).toBe("Teams");
  });

  it("defaults to es for a non-English browser language", () => {
    stubNavigatorLanguage("fr-FR");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("es");
    expect(screen.getByTestId("nav-teams").textContent).toBe("Equipos");
  });

  it("switches locale and persists the choice to the cookie (never localStorage)", () => {
    // No cookie + a non-English browser language → the default (es) start.
    stubNavigatorLanguage("fr-FR");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("es");

    fireEvent.click(screen.getByRole("button", { name: "switch-to-en" }));

    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("nav-teams").textContent).toBe("Teams");
    // The cookie is the only persisted source of truth now.
    expect(document.cookie).toContain("bb-locale=en");
    expect(window.localStorage.getItem("bb-locale")).toBeNull();
  });
});
