import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ProfilePanel } from "./ProfilePanel";

/**
 * ProfilePanel renders the Spanish profile copy, the current avatar (from
 * GET /api/me — a DB read, not the JWT), the crop/upload control, the RAU-57
 * career-stats cards (GET /api/me/stats) and the change-password form
 * (PATCH /api/me/password). The full crop→canvas→upload round-trip requires
 * canvas.toBlob, which jsdom does not implement, so it is covered by the PR4
 * e2e; here we assert the render + form states that drive it.
 */
const getMeMock = vi.hoisted(() => vi.fn());
const getStatsMock = vi.hoisted(() => vi.fn());
const changePasswordMock = vi.hoisted(() => vi.fn());

vi.mock("./api", () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
  getStats: (...args: unknown[]) => getStatsMock(...args),
  changePassword: (...args: unknown[]) => changePasswordMock(...args),
}));

afterEach(() => {
  getMeMock.mockReset();
  getStatsMock.mockReset();
  changePasswordMock.mockReset();
});

function profile(overrides: Partial<{ avatar: string | null }> = {}) {
  return { id: "u1", name: "Coach", email: "c@x.com", avatar: null, ...overrides };
}

function zeroStats() {
  return {
    championships: 0,
    teams: 0,
    leaguesOwned: 0,
    leaguesMember: 0,
    leagues: 0,
    matches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
  };
}

function fillPasswordForm(current: string, next: string, confirm: string) {
  fireEvent.change(screen.getByLabelText("Contraseña actual"), {
    target: { value: current },
  });
  fireEvent.change(screen.getByLabelText("Nueva contraseña"), {
    target: { value: next },
  });
  fireEvent.change(screen.getByLabelText("Confirmar nueva contraseña"), {
    target: { value: confirm },
  });
  fireEvent.click(screen.getByRole("button", { name: "Cambiar contraseña" }));
}

/** Asserts an element's textContent (the repo has no jest-dom matchers). */
function hasText(el: HTMLElement, expected: string) {
  expect(el.textContent).toContain(expected);
}

/** Reads a labelled input's value (no jest-dom `toHaveValue` in this repo). */
function inputValue(label: string): string {
  return (screen.getByLabelText(label) as HTMLInputElement).value;
}

describe("ProfilePanel", () => {
  it("shows the Spanish heading and the loaded avatar image when the user has one", async () => {
    getMeMock.mockResolvedValue(profile({ avatar: "/uploads/avatars/u1-a.webp" }));
    getStatsMock.mockResolvedValue(zeroStats());

    render(<ProfilePanel />);

    expect(screen.getByRole("heading", { name: "Mi Perfil" })).toBeTruthy();
    const img = await screen.findByRole("img", { name: /avatar/i });
    expect(img.getAttribute("src")).toBe("/uploads/avatars/u1-a.webp");
    expect(screen.getByRole("button", { name: /Subir foto/i })).toBeTruthy();
  });

  it("renders no avatar image and keeps the upload control when the user has none", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockResolvedValue(zeroStats());

    render(<ProfilePanel />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(await screen.findByRole("button", { name: /Subir foto/i })).toBeTruthy();
  });

  it("shows a Spanish error when the profile cannot be loaded", async () => {
    getMeMock.mockRejectedValue(new Error("Unauthorized"));
    getStatsMock.mockResolvedValue(zeroStats());

    render(<ProfilePanel />);

    expect(await screen.findByText(/No se pudo cargar tu perfil/i)).toBeTruthy();
  });
});

describe("ProfilePanel — career stats section", () => {
  it("renders the zero state with the four Spanish labels", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockResolvedValue(zeroStats());

    render(<ProfilePanel />);

    expect(await screen.findByText("Estadísticas de carrera")).toBeTruthy();
    expect(screen.getByTestId("stat-championships").textContent).toContain("0");
    expect(screen.getByTestId("stat-teams").textContent).toContain("Equipos creados");
    expect(screen.getByTestId("stat-leagues").textContent).toContain("Ligas");
    expect(screen.getByTestId("stat-matches").textContent).toContain("Partidos");
    expect(screen.getByText(/Victorias 0 · Empates 0 · Derrotas 0/)).toBeTruthy();
  });

  it("renders the loaded numbers across the cards", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockResolvedValue({
      championships: 2,
      teams: 3,
      leaguesOwned: 1,
      leaguesMember: 2,
      leagues: 2,
      matches: 5,
      wins: 3,
      draws: 1,
      losses: 1,
    });

    render(<ProfilePanel />);

    expect(await screen.findByTestId("stat-championships")).toBeTruthy();
    expect(screen.getByTestId("stat-championships").textContent).toContain("2");
    expect(screen.getByTestId("stat-teams").textContent).toContain("3");
    expect(screen.getByTestId("stat-leagues").textContent).toContain("2");
    expect(screen.getByTestId("stat-matches").textContent).toContain("5");
    expect(screen.getByText(/Victorias 3 · Empates 1 · Derrotas 1/)).toBeTruthy();
  });

  it("shows a Spanish error when the stats cannot be loaded", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockRejectedValue(new Error("Unauthorized"));

    render(<ProfilePanel />);

    expect(await screen.findByText(/No se pudieron cargar tus estadísticas/i)).toBeTruthy();
  });
});

describe("ProfilePanel — change password", () => {
  it("renders the Spanish form with current/new/confirm fields and the hint", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockResolvedValue(zeroStats());

    render(<ProfilePanel />);

    expect(await screen.findByRole("heading", { name: "Cambiar contraseña" })).toBeTruthy();
    expect(screen.getByLabelText("Contraseña actual")).toBeTruthy();
    expect(screen.getByLabelText("Nueva contraseña")).toBeTruthy();
    expect(screen.getByLabelText("Confirmar nueva contraseña")).toBeTruthy();
    expect(screen.getByText("Mínimo 8 caracteres.")).toBeTruthy();
  });

  it("rejects a mismatched confirmation client-side without calling the API", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockResolvedValue(zeroStats());

    render(<ProfilePanel />);
    await screen.findByRole("heading", { name: "Cambiar contraseña" });
    fillPasswordForm("old-password", "new-password-1", "different-pass");

    hasText(await screen.findByRole("alert"), "Las contraseñas no coinciden.");
    expect(changePasswordMock).not.toHaveBeenCalled();
  });

  it("shows the wrong-current error mapped from the route error code", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockResolvedValue(zeroStats());
    const err = new Error("Current password is incorrect") as Error & { code?: string };
    err.code = "wrong-current-password";
    changePasswordMock.mockRejectedValue(err);

    render(<ProfilePanel />);
    await screen.findByRole("heading", { name: "Cambiar contraseña" });
    fillPasswordForm("nope", "new-password-1", "new-password-1");

    hasText(await screen.findByRole("alert"), "La contraseña actual no es correcta.");
    expect(changePasswordMock).toHaveBeenCalledWith({
      currentPassword: "nope",
      newPassword: "new-password-1",
    });
  });

  it("shows the weak-new error with the shared minimum length", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockResolvedValue(zeroStats());
    const err = new Error("too short") as Error & { code?: string };
    err.code = "weak-new-password";
    changePasswordMock.mockRejectedValue(err);

    render(<ProfilePanel />);
    await screen.findByRole("heading", { name: "Cambiar contraseña" });
    fillPasswordForm("old-password", "short", "short");

    hasText(await screen.findByRole("alert"), "La contraseña debe tener al menos 8 caracteres.");
  });

  it("clears the form and shows the success status on a successful change", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockResolvedValue(zeroStats());
    changePasswordMock.mockResolvedValue({ ok: true });

    render(<ProfilePanel />);
    await screen.findByRole("heading", { name: "Cambiar contraseña" });
    fillPasswordForm("old-password", "new-password-1", "new-password-1");

    hasText(await screen.findByRole("status"), "Contraseña actualizada.");
    await waitFor(() => {
      expect(inputValue("Contraseña actual")).toBe("");
      expect(inputValue("Nueva contraseña")).toBe("");
      expect(inputValue("Confirmar nueva contraseña")).toBe("");
    });
  });

  it("falls back to a generic Spanish error for any other failure", async () => {
    getMeMock.mockResolvedValue(profile());
    getStatsMock.mockResolvedValue(zeroStats());
    changePasswordMock.mockRejectedValue(new Error("network"));

    render(<ProfilePanel />);
    await screen.findByRole("heading", { name: "Cambiar contraseña" });
    fillPasswordForm("old-password", "new-password-1", "new-password-1");

    hasText(await screen.findByRole("alert"), "No se pudo cambiar la contraseña.");
  });
});
