import { afterEach, describe, expect, it } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { DEFAULT_THEME } from "./theme";
import { ThemeProvider, useTheme } from "./index";

/**
 * theme-selector client provider tests (TS-3 + TS-5), mirroring the RAU-58
 * `lib/i18n/i18n.test.tsx` shape. The provider seeds from the SSR
 * `initialTheme`, applies `data-theme` on `document.documentElement` and
 * persists the `bb-theme` cookie — never localStorage.
 */

const COOKIE_KEY = "bb-theme";

function setThemeCookie(theme: string) {
  document.cookie = `${COOKIE_KEY}=${theme}; path=/; max-age=31536000; SameSite=Lax`;
}

function clearThemeCookie() {
  document.cookie = `${COOKIE_KEY}=; path=/; max-age=0`;
}

function Probe() {
  const { theme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme">{theme}</span>
      <button type="button" onClick={() => setTheme("scoreboard")}>
        switch-to-scoreboard
      </button>
    </div>
  );
}

function htmlTheme() {
  return document.documentElement.getAttribute("data-theme");
}

afterEach(() => {
  delete document.documentElement.dataset.theme;
  clearThemeCookie();
  window.localStorage.clear();
});

describe("useTheme without a provider", () => {
  it("falls back to DEFAULT_THEME (vintage)", () => {
    render(<Probe />);
    expect(screen.getByTestId("theme").textContent).toBe(DEFAULT_THEME);
  });

  it("setTheme is a no-op without a provider", () => {
    render(<Probe />);
    fireEvent.click(screen.getByRole("button", { name: "switch-to-scoreboard" }));
    expect(screen.getByTestId("theme").textContent).toBe(DEFAULT_THEME);
  });
});

describe("ThemeProvider", () => {
  it("seeds from the SSR initialTheme and applies data-theme + cookie on mount (TS-5)", async () => {
    render(
      <ThemeProvider initialTheme="scoreboard">
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("scoreboard");
    await waitFor(() => expect(htmlTheme()).toBe("scoreboard"));
    expect(document.cookie).toContain(`${COOKIE_KEY}=scoreboard`);
  });

  it("defaults to vintage when no initialTheme is provided (standalone mount)", async () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );
    expect(screen.getByTestId("theme").textContent).toBe("vintage");
    await waitFor(() => expect(htmlTheme()).toBe("vintage"));
  });

  it("the SSR initialTheme wins over a pre-existing client cookie", async () => {
    setThemeCookie("scoreboard");
    render(
      <ThemeProvider initialTheme="vintage">
        <Probe />
      </ThemeProvider>,
    );
    // State + painted attribute follow the SSR value, not the stale cookie.
    expect(screen.getByTestId("theme").textContent).toBe("vintage");
    await waitFor(() => expect(htmlTheme()).toBe("vintage"));
    expect(document.cookie).toContain(`${COOKIE_KEY}=vintage`);
  });

  it("syncs the data-theme attribute and the cookie on change, never localStorage (TS-3)", async () => {
    render(
      <ThemeProvider initialTheme="vintage">
        <Probe />
      </ThemeProvider>,
    );
    await waitFor(() => expect(htmlTheme()).toBe("vintage"));
    expect(window.localStorage.getItem(COOKIE_KEY)).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "switch-to-scoreboard" }));

    expect(screen.getByTestId("theme").textContent).toBe("scoreboard");
    await waitFor(() => expect(htmlTheme()).toBe("scoreboard"));
    expect(document.cookie).toContain(`${COOKIE_KEY}=scoreboard`);
    // The cookie is the ONLY persisted source of truth.
    expect(window.localStorage.getItem(COOKIE_KEY)).toBeNull();
  });
});
