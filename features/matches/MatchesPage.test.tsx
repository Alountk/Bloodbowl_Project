import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { UseUpcomingMatchesResult } from "./useUpcomingMatches";
import type { UpcomingFixture } from "./selectUpcomingFixtures";
import { MatchesPage } from "./MatchesPage";

/**
 * MatchesPage (Design B / MP-1, MP-4, MP-5): loads the session user's upcoming
 * fixtures via `useUpcomingMatches`, groups them by date (Hoy / future dates /
 * Sin programar), renders one `UpcomingMatchCard` per fixture, and shows the
 * `matches.empty` panel when nothing is upcoming or the API is unavailable
 * (local/anonymous). No jest-dom — .textContent / regex assertions.
 */

const ME = "u-me";

const sessionMock = vi.hoisted(() =>
  vi.fn<() => { data: { user: { id: string } } | null; status: string }>(() => ({
    data: { user: { id: ME } },
    status: "authenticated",
  })),
);
vi.mock("next-auth/react", () => ({ useSession: () => sessionMock() }));

const hookMock = vi.hoisted(() => vi.fn<() => UseUpcomingMatchesResult>());
vi.mock("./useUpcomingMatches", () => ({ useUpcomingMatches: () => hookMock() }));

function fixture(overrides: Partial<UpcomingFixture> & { id: string }): UpcomingFixture {
  return {
    leagueId: "l1",
    leagueName: "Liga de Verano",
    round: 1,
    homeTeamId: "h",
    awayTeamId: "a",
    homeTeamName: "Halfling Hopper",
    awayTeamName: "Wood Elf Wanderers",
    createdAt: "2026-02-01",
    scheduledAt: null,
    winnerId: null,
    homeScore: null,
    awayScore: null,
    status: "pending",
    homeOwner: { id: ME, name: "Me" },
    awayOwner: { id: "o", name: "Other" },
    proposals: [],
    live: null,
    ...overrides,
  };
}

function state(fixtures: UpcomingFixture[], overrides: Partial<UseUpcomingMatchesResult> = {}) {
  return { fixtures, loading: false, unavailable: false, ...overrides };
}

async function renderDone(useState: UseUpcomingMatchesResult) {
  hookMock.mockReturnValue(useState);
  const view = render(<MatchesPage />);
  // Swing through the async loading gate to the settled state.
  await screen.findAllByText(/Partidos|No tienes|Hoy|Sin programar|Liga|No date/i).catch(() => {});
  return view;
}

describe("MatchesPage", () => {
  beforeEach(() => {
    sessionMock.mockReturnValue({ data: { user: { id: ME } }, status: "authenticated" });
    hookMock.mockReset();
  });

  it("renders the heading, a Hoy group for today's fixtures, and a card link", async () => {
    const today = new Date().toISOString();
    await renderDone(
      state([fixture({ id: "f-today", status: "scheduled", scheduledAt: today })]),
    );

    expect(screen.getByRole("heading", { name: "Partidos" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Hoy" })).toBeTruthy();
    expect(screen.getByText("Liga de Verano")).toBeTruthy();
    // The whole card is a link to the fixture route (accessible name is the
    // full card text, so match by role and check the href).
    const card = screen.getAllByRole("link").find((l) => l.getAttribute("href") === "/leagues/l1/fixtures/f-today");
    expect(card).toBeTruthy();
  });

  it("groups a future-dated fixture under its date and an undated one under Sin programar", async () => {
    const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
    await renderDone(
      state([
        fixture({ id: "f-future", status: "scheduled", scheduledAt: tomorrow }),
        fixture({ id: "f-undated", status: "pending", scheduledAt: null }),
      ]),
    );

    expect(screen.getByRole("heading", { name: "Sin programar" })).toBeTruthy();
    // Both fixtures share the league name.
    expect(screen.getAllByText("Liga de Verano")).toHaveLength(2);
    // The future group heading is the localized day label (es DD/MM/YYYY).
    const tomorrowLabel = new Intl.DateTimeFormat("es-ES", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(new Date(tomorrow));
    expect(screen.getByRole("heading", { name: tomorrowLabel })).toBeTruthy();
  });

  it("renders matches.empty when there are no upcoming fixtures", async () => {
    await renderDone(state([]));
    expect(screen.getByText("No tienes partidos próximos.")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Hoy" })).toBeNull();
  });

  it("renders the empty panel when the league APIs are unavailable (local/anonymous)", async () => {
    await renderDone(state([], { unavailable: true }));
    expect(screen.getByText("No tienes partidos próximos.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Liga de Verano" })).toBeNull();
  });

  it("renders nothing while loading", () => {
    hookMock.mockReturnValue({ fixtures: [], loading: true, unavailable: false });
    render(<MatchesPage />);
    expect(screen.queryByText("No tienes partidos próximos.")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Partidos" })).toBeNull();
  });
});
