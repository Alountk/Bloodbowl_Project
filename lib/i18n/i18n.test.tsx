import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DEFAULT_LOCALE, t } from "./dictionaries";
import { I18nProvider, useI18n } from "./index";
import { LocaleSwitcher } from "./LocaleSwitcher";

const STORAGE_KEY = "bb-locale";

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
  it("initializes from the stored bb-locale", () => {
    window.localStorage.setItem(STORAGE_KEY, "en");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("nav-teams").textContent).toBe("Teams");
  });

  it("falls back to the browser language when nothing is stored (en → English)", () => {
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

  it("switches locale and persists the choice to localStorage", () => {
    window.localStorage.setItem(STORAGE_KEY, "es");
    render(
      <I18nProvider>
        <Probe />
      </I18nProvider>,
    );
    expect(screen.getByTestId("locale").textContent).toBe("es");

    fireEvent.click(screen.getByRole("button", { name: "switch-to-en" }));

    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByTestId("nav-teams").textContent).toBe("Teams");
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe("en");
  });
});

describe("LocaleSwitcher", () => {
  it("reflects the provider locale and switches it", () => {
    window.localStorage.setItem(STORAGE_KEY, "es");
    render(
      <I18nProvider>
        <LocaleSwitcher />
        <Probe />
      </I18nProvider>,
    );

    const group = screen.getByRole("group", { name: "Idioma" });
    const esButton = group.querySelector('button[aria-pressed="true"]');
    expect(esButton?.textContent).toBe("ES");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    expect(screen.getByTestId("locale").textContent).toBe("en");
    expect(screen.getByRole("button", { name: "EN" }).getAttribute("aria-pressed")).toBe("true");
  });
});
