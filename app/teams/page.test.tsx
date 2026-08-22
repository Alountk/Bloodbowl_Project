import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import Page from "./page";

// TeamsPage fetches its league-name map (one listLeagues call) and each TeamCard
// fetches its own progression. Stub both so the wrapper test stays focused on
// the route delegating to TeamsPage.
vi.mock("@/features/teams/api", () => ({
  fetchTeamProgression: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/leagues/api", () => ({
  listLeagues: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Teams page route", () => {
  it("renders the TeamsPage (empty state) via the thin wrapper", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) }),
      ),
    );

    // The route must delegate to TeamsPage: with zero teams the page renders
    // its empty state and the create-team CTA (the AppShell wraps this content
    // at the layout provider level, exactly like the /leagues route).
    render(
      <AppProvider store={new InMemoryTeamStore([])}>
        <Page />
      </AppProvider>,
    );

    await waitFor(() =>
      expect(screen.getByRole("link", { name: /crear equipo/i })).toBeTruthy(),
    );
    expect(
      screen.getByRole("link", { name: /crear equipo/i }).getAttribute("href"),
    ).toBe("/teams/create");
  });
});
