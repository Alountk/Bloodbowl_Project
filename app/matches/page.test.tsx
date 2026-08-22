import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import Page from "./page";

// The matches page reads the session user id and delegates to useUpcomingMatches.
// Stub both so the wrapper test is focused on the route rendering MatchesPage.
const sessionMock = vi.hoisted(() =>
  vi.fn(() => ({ data: { user: { id: "u1" } }, status: "authenticated" })),
);
vi.mock("next-auth/react", () => ({ useSession: () => sessionMock() }));

const hookMock = vi.hoisted(() =>
  vi.fn(() => ({ fixtures: [], loading: false, unavailable: false })),
);
vi.mock("@/features/matches/useUpcomingMatches", () => ({
  useUpcomingMatches: () => hookMock(),
}));

describe("Matches page route", () => {
  it("renders the MatchesPage empty state via the thin wrapper", async () => {
    hookMock.mockReturnValue({ fixtures: [], loading: false, unavailable: false });
    render(<Page />);

    await screen.findAllByText("No tienes partidos próximos.");
    expect(screen.getByRole("heading", { name: "Partidos" })).toBeTruthy();
  });
});
