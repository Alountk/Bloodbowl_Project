import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "./index";
import { LocaleSwitcher } from "./LocaleSwitcher";

const COOKIE_KEY = "bb-locale";

type SessionStub = {
  data: { user: { id: string; name: string } } | null;
  status: string;
};

const sessionMock = vi.hoisted(() =>
  vi.fn<() => SessionStub>(() => ({ data: null, status: "unauthenticated" })),
);
vi.mock("next-auth/react", () => ({ useSession: () => sessionMock() }));

const patchMeMock = vi.hoisted(() => vi.fn());
vi.mock("@/features/profile/api", () => ({ patchMe: patchMeMock }));

function setLocaleCookie(locale: string) {
  document.cookie = `${COOKIE_KEY}=${locale}; path=/; max-age=31536000; SameSite=Lax`;
}

function stubNavigatorLanguage(language: string) {
  Object.defineProperty(window.navigator, "language", {
    configurable: true,
    value: language,
  });
}

function renderSwitcher(initialLocale?: "es" | "en") {
  return render(
    <I18nProvider initialLocale={initialLocale}>
      <LocaleSwitcher />
    </I18nProvider>,
  );
}

const esGroup = () => screen.getByRole("group", { name: "Idioma" });
const enGroup = () => screen.getByRole("group", { name: "Language" });

const esPressed = () => screen.getByRole("button", { name: "ES" }).getAttribute("aria-pressed");
const enPressed = () => screen.getByRole("button", { name: "EN" }).getAttribute("aria-pressed");

beforeEach(() => {
  sessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
  patchMeMock.mockReset();
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0`;
  stubNavigatorLanguage("es-ES");
});

describe("LocaleSwitcher (RAU-59 auth-aware)", () => {
  it("marks the ACTIVE locale from the provider locale", () => {
    renderSwitcher("es");

    expect(esPressed()).toBe("true");
    expect(enPressed()).toBe("false");
  });

  it("anonymous: a click only sets the cookie and flips the provider (no PATCH)", async () => {
    renderSwitcher("es");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    await waitFor(() => expect(enGroup()).toBeTruthy());
    await waitFor(() => expect(document.cookie).toContain("bb-locale=en"));
    expect(enPressed()).toBe("true");
    expect(esPressed()).toBe("false");
    expect(patchMeMock).not.toHaveBeenCalled();
  });

  it("authenticated: a click PATCHes the account locale, then flips the provider", async () => {
    sessionMock.mockReturnValue({
      data: { user: { id: "u1", name: "Coach" } },
      status: "authenticated",
    });
    patchMeMock.mockResolvedValue({
      id: "u1",
      name: "Coach",
      email: "c@x.io",
      avatar: null,
      locale: "en",
    });
    renderSwitcher("es");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    await waitFor(() => expect(patchMeMock).toHaveBeenCalledWith({ locale: "en" }));
    await waitFor(() => expect(enGroup()).toBeTruthy());
    expect(enPressed()).toBe("true");
    expect(esPressed()).toBe("false");
    expect(document.cookie).toContain("bb-locale=en");
  });

  it("authenticated: a failed PATCH keeps the current locale and surfaces the inline error", async () => {
    sessionMock.mockReturnValue({
      data: { user: { id: "u1", name: "Coach" } },
      status: "authenticated",
    });
    patchMeMock.mockRejectedValue(new Error("network down"));
    renderSwitcher("es");

    fireEvent.click(screen.getByRole("button", { name: "EN" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("No se pudo guardar el idioma."),
    );
    expect(esGroup()).toBeTruthy();
    expect(esPressed()).toBe("true");
    expect(enPressed()).toBe("false");
    expect(patchMeMock).toHaveBeenCalledWith({ locale: "en" });
  });

  it("renders the inline error in the active locale (en account → English copy)", async () => {
    sessionMock.mockReturnValue({
      data: { user: { id: "u1", name: "Coach" } },
      status: "authenticated",
    });
    patchMeMock.mockRejectedValue(new Error("network down"));
    renderSwitcher("en");

    fireEvent.click(screen.getByRole("button", { name: "ES" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Could not save the language."),
    );
    expect(enGroup()).toBeTruthy();
  });

  it("ignores clicks on the already-active locale", async () => {
    sessionMock.mockReturnValue({
      data: { user: { id: "u1", name: "Coach" } },
      status: "authenticated",
    });
    renderSwitcher("es");

    fireEvent.click(screen.getByRole("button", { name: "ES" }));

    expect(patchMeMock).not.toHaveBeenCalled();
    expect(esPressed()).toBe("true");
  });

  it("starts from the persisted cookie when anonymous (no provider locale prop)", () => {
    setLocaleCookie("en");
    renderSwitcher();

    expect(enPressed()).toBe("true");
    expect(esPressed()).toBe("false");
  });
});
