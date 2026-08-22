import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

const authMock = vi.hoisted(() => vi.fn());
vi.mock("@/auth", () => ({ auth: () => authMock() }));

const cookieHolder = vi.hoisted(() => ({ value: undefined as string | undefined }));
vi.mock("next/headers", () => ({
  cookies: async () => ({
    get: () =>
      cookieHolder.value ? { name: "bb-locale", value: cookieHolder.value } : undefined,
  }),
}));

const prismaMock = vi.hoisted(() => ({
  user: { findUnique: vi.fn() },
}));
vi.mock("@/lib/prisma", () => ({ prisma: prismaMock }));

vi.mock("@/features/rulesets/RulesetManager", () => ({
  RulesetManager: () => <div data-testid="ruleset-manager" />,
}));

beforeEach(() => {
  vi.clearAllMocks();
  cookieHolder.value = undefined;
});

describe("DevRulesetsPage 403 panel (RAU-59 server-side i18n)", () => {
  it("renders the Spanish panel for an es account even when the cookie says en", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", locale: "en" } });
    prismaMock.user.findUnique.mockResolvedValue({ role: "user", locale: "es" });
    cookieHolder.value = "en";

    render(await Page());

    expect(screen.getByRole("heading", { name: "Acceso restringido" })).toBeTruthy();
    expect(screen.getByText("Esta sección es exclusiva para desarrolladores.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver al inicio" }).getAttribute("href")).toBe("/");
  });

  it("renders the English panel for an en account", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", locale: "en" } });
    prismaMock.user.findUnique.mockResolvedValue({ role: "user", locale: "en" });

    render(await Page());

    expect(screen.getByRole("heading", { name: "Restricted access" })).toBeTruthy();
    expect(screen.getByText("This section is exclusive to developers.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Back to home" }).getAttribute("href")).toBe("/");
  });

  it("falls back to the cookie locale when no locale source resolves", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", locale: null } });
    prismaMock.user.findUnique.mockResolvedValue({ role: "user", locale: null });
    cookieHolder.value = "en";

    render(await Page());

    expect(screen.getByRole("heading", { name: "Restricted access" })).toBeTruthy();
  });

  it("defaults to Spanish when nothing is set (anonymous/local mode)", async () => {
    authMock.mockResolvedValue(null);
    prismaMock.user.findUnique.mockResolvedValue(null);

    render(await Page());

    expect(screen.getByRole("heading", { name: "Acceso restringido" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Volver al inicio" })).toBeTruthy();
  });
});

describe("DevRulesetsPage developer gate", () => {
  it("renders the RulesetManager for a developer and no 403 panel", async () => {
    authMock.mockResolvedValue({ user: { id: "u1", locale: "es" } });
    prismaMock.user.findUnique.mockResolvedValue({ role: "developer", locale: "es" });

    render(await Page());

    expect(screen.getByTestId("ruleset-manager")).toBeTruthy();
    expect(
      screen.queryByRole("heading", { name: /Acceso restringido|Restricted access/ }),
    ).toBeNull();
  });
});
