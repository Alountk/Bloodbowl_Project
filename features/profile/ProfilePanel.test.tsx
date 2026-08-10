import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ProfilePanel } from "./ProfilePanel";

/**
 * ProfilePanel renders the Spanish profile copy, the current avatar (from
 * GET /api/me — a DB read, not the JWT), and the crop/upload control. The full
 * crop→canvas→upload round-trip requires canvas.toBlob, which jsdom does not
 * implement, so it is covered by the PR4 e2e; here we assert the render states
 * that drive it.
 */
const getMeMock = vi.hoisted(() => vi.fn());

vi.mock("./api", () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
}));

afterEach(() => {
  getMeMock.mockReset();
});

function profile(overrides: Partial<{ avatar: string | null }> = {}) {
  return { id: "u1", name: "Coach", email: "c@x.com", avatar: null, ...overrides };
}

describe("ProfilePanel", () => {
  it("shows the Spanish heading and the loaded avatar image when the user has one", async () => {
    getMeMock.mockResolvedValue(profile({ avatar: "/uploads/avatars/u1-a.webp" }));

    render(<ProfilePanel />);

    expect(screen.getByRole("heading", { name: "Mi Perfil" })).toBeTruthy();
    const img = await screen.findByRole("img", { name: /avatar/i });
    expect(img.getAttribute("src")).toBe("/uploads/avatars/u1-a.webp");
    expect(screen.getByRole("button", { name: /Subir foto/i })).toBeTruthy();
  });

  it("renders no avatar image and keeps the upload control when the user has none", async () => {
    getMeMock.mockResolvedValue(profile());

    render(<ProfilePanel />);

    expect(screen.queryByRole("img")).toBeNull();
    expect(await screen.findByRole("button", { name: /Subir foto/i })).toBeTruthy();
  });

  it("shows a Spanish error when the profile cannot be loaded", async () => {
    getMeMock.mockRejectedValue(new Error("Unauthorized"));

    render(<ProfilePanel />);

    expect(await screen.findByText(/No se pudo cargar tu perfil/i)).toBeTruthy();
  });
});
