import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

const getMeMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/profile/api", () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
}));

afterEach(() => {
  getMeMock.mockReset();
});

describe("Profile page route", () => {
  it("renders the Spanish profile panel with the loaded avatar", async () => {
    getMeMock.mockResolvedValue({ id: "u1", name: "Coach", email: "c@x.com", avatar: "/uploads/avatars/u1.webp" });

    render(<Page />);

    expect(screen.getByRole("heading", { name: "Mi Perfil" })).toBeTruthy();
    const img = await screen.findByRole("img", { name: /avatar/i });
    expect(img.getAttribute("src")).toBe("/uploads/avatars/u1.webp");
  });
});
