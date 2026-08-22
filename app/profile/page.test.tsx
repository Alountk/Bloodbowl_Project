import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

const getMeMock = vi.hoisted(() => vi.fn());
const getStatsMock = vi.hoisted(() => vi.fn());

vi.mock("@/features/profile/api", () => ({
  getMe: (...args: unknown[]) => getMeMock(...args),
  getStats: (...args: unknown[]) => getStatsMock(...args),
}));

afterEach(() => {
  getMeMock.mockReset();
  getStatsMock.mockReset();
});

describe("Profile page route", () => {
  it("renders the Spanish profile panel with the loaded avatar", async () => {
    getMeMock.mockResolvedValue({ id: "u1", name: "Coach", email: "c@x.com", avatar: "/uploads/avatars/u1.webp" });
    getStatsMock.mockResolvedValue({
      championships: 0,
      teams: 0,
      leaguesOwned: 0,
      leaguesMember: 0,
      leagues: 0,
      matches: 0,
      wins: 0,
      draws: 0,
      losses: 0,
    });

    render(<Page />);

    expect(screen.getByRole("heading", { name: "Mi Perfil" })).toBeTruthy();
    const img = await screen.findByRole("img", { name: /avatar/i });
    expect(img.getAttribute("src")).toBe("/uploads/avatars/u1.webp");
  });
});
