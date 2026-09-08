import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "./index";
import { ThemeSwitcher } from "./ThemeSwitcher";
import type { Theme } from "./theme";

const COOKIE_KEY = "bb-theme";

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

function renderSwitcher(initialTheme: Theme, initialLocale: "es" | "en" = "es") {
  return render(
    <I18nProvider initialLocale={initialLocale}>
      <ThemeProvider initialTheme={initialTheme}>
        <ThemeSwitcher />
      </ThemeProvider>
    </I18nProvider>,
  );
}

const esGroup = () => screen.getByRole("group", { name: "Tema" });
const enGroup = () => screen.getByRole("group", { name: "Theme" });

const esVintagePressed = () =>
  screen.getByRole("button", { name: "Reglamento vintage" }).getAttribute("aria-pressed");
const esScoreboardPressed = () =>
  screen.getByRole("button", { name: "Tablón americano" }).getAttribute("aria-pressed");

const authenticatedUser = { data: { user: { id: "u1", name: "Coach" } }, status: "authenticated" };

beforeEach(() => {
  sessionMock.mockReturnValue({ data: null, status: "unauthenticated" });
  patchMeMock.mockReset();
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0`;
});

describe("ThemeSwitcher (AS-8 auth-aware)", () => {
  it("marks the ACTIVE theme from the provider theme", () => {
    renderSwitcher("vintage");

    expect(esVintagePressed()).toBe("true");
    expect(esScoreboardPressed()).toBe("false");
  });

  it("anonymous: a click only flips the provider and writes the cookie (no PATCH)", async () => {
    renderSwitcher("vintage");

    fireEvent.click(screen.getByRole("button", { name: "Tablón americano" }));

    await waitFor(() => expect(esGroup()).toBeTruthy());
    await waitFor(() => expect(document.cookie).toContain("bb-theme=scoreboard"));
    expect(esScoreboardPressed()).toBe("true");
    expect(esVintagePressed()).toBe("false");
    expect(patchMeMock).not.toHaveBeenCalled();
  });

  it("authenticated: a click PATCHes the account theme, then flips the provider", async () => {
    sessionMock.mockReturnValue(authenticatedUser);
    patchMeMock.mockResolvedValue({
      id: "u1",
      name: "Coach",
      email: "c@x.io",
      avatar: null,
      locale: "es",
      theme: "scoreboard",
    });
    renderSwitcher("vintage");

    fireEvent.click(screen.getByRole("button", { name: "Tablón americano" }));

    await waitFor(() => expect(patchMeMock).toHaveBeenCalledWith({ theme: "scoreboard" }));
    await waitFor(() => expect(esGroup()).toBeTruthy());
    expect(esScoreboardPressed()).toBe("true");
    expect(esVintagePressed()).toBe("false");
    expect(document.cookie).toContain("bb-theme=scoreboard");
  });

  it("authenticated: a failed PATCH keeps the current theme and surfaces the inline error", async () => {
    sessionMock.mockReturnValue(authenticatedUser);
    patchMeMock.mockRejectedValue(new Error("network down"));
    renderSwitcher("vintage");

    fireEvent.click(screen.getByRole("button", { name: "Tablón americano" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("No se pudo guardar el tema."),
    );
    expect(esVintagePressed()).toBe("true");
    expect(esScoreboardPressed()).toBe("false");
    expect(patchMeMock).toHaveBeenCalledWith({ theme: "scoreboard" });
  });

  it("renders the inline error in the active locale (en account → English copy)", async () => {
    sessionMock.mockReturnValue(authenticatedUser);
    patchMeMock.mockRejectedValue(new Error("network down"));
    renderSwitcher("scoreboard", "en");

    fireEvent.click(screen.getByRole("button", { name: "Vintage rulebook" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Could not save the theme."),
    );
    expect(enGroup()).toBeTruthy();
  });

  it("ignores clicks on the already-active theme", async () => {
    sessionMock.mockReturnValue(authenticatedUser);
    renderSwitcher("scoreboard");

    fireEvent.click(screen.getByRole("button", { name: "Tablón americano" }));

    expect(patchMeMock).not.toHaveBeenCalled();
    expect(esScoreboardPressed()).toBe("true");
  });
});
