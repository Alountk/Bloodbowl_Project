import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MatchCard, type MatchCardProps, matchStatusLabel, formatMatchDate, formatMatchScore } from "./MatchCard";
import type { FixtureDraft } from "./api";

/**
 * Tourplay-style MatchCard (Design B): a per-fixture card whose header is
 * "Partido N · <status>", whose body centers the RESULT (score or "- : -")
 * between the two teams (deterministic emblem + name + race line), that
 * navigates to `/teams/[id]` (scouting) when a team is clicked, and that fires
 * onNegotiate when the card's center score is clicked. Status badge labels
 * Pendiente / Programado (with date) / Jugado (with the winner's VICTORIA chip).
 * Admin-only Forfeit control is surfaced elsewhere (ForfeitModal), not on the card.
 */

const teamNameById = new Map([
  ["th", "Reavers"],
  ["ta", "Orcboyz"],
]);

const raceNameById = new Map([
  ["th", "Human"],
  ["ta", "Orc"],
]);

function fixture(overrides: Partial<FixtureDraft> = {}): FixtureDraft {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "th",
    awayTeamId: "ta",
    createdAt: "2026-02-01",
    scheduledAt: null,
    winnerId: null,
    status: "pending",
    homeOwner: { id: "u1", name: "raul" },
    awayOwner: { id: "u2", name: "maria" },
    proposals: [],
    ...overrides,
  };
}

function renderCard(props: Partial<MatchCardProps> = {}) {
  const onNegotiate = vi.fn();
  const onForfeit = vi.fn();
  render(
    <MatchCard
      fixture={fixture()}
      teamNameById={teamNameById}
      raceNameById={raceNameById}
      currentUserId="u3"
      isLeagueOwner={false}
      onNegotiate={onNegotiate}
      onForfeit={onForfeit}
      {...props}
    />,
  );
  return { onNegotiate, onForfeit };
}

describe("matchStatusLabel", () => {
  it("labels pending as Pendiente", () => {
    expect(matchStatusLabel("pending")).toBe("Pendiente");
  });
  it("labels scheduled as Programado", () => {
    expect(matchStatusLabel("scheduled")).toBe("Programado");
  });
  it("labels played as Jugado", () => {
    expect(matchStatusLabel("played")).toBe("Jugado");
  });
});

describe("formatMatchDate", () => {
  it("returns empty for null and invalid input", () => {
    expect(formatMatchDate(null)).toBe("");
    expect(formatMatchDate("not-a-date")).toBe("");
  });
  it("includes the agreed time for two distinct proposed slots", () => {
    const fmt = (iso: string) =>
      new Intl.DateTimeFormat("es-ES", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(iso));
    expect(formatMatchDate("2026-03-01T10:00:00.000Z")).toBe(fmt("2026-03-01T10:00:00.000Z"));
    expect(formatMatchDate("2026-03-15T20:30:00.000Z")).toBe(fmt("2026-03-15T20:30:00.000Z"));
  });
});

describe("formatMatchScore", () => {
  it("returns the ' : ' score when both scores are recorded", () => {
    expect(formatMatchScore(2, 1)).toBe("2 : 1");
    expect(formatMatchScore(0, 0)).toBe("0 : 0");
  });
  it("returns null when either score is absent", () => {
    expect(formatMatchScore(null, 1)).toBeNull();
    expect(formatMatchScore(2, null)).toBeNull();
    expect(formatMatchScore(null, null)).toBeNull();
  });
});

describe("MatchCard", () => {
  it("renders the header 'Partido <n> · <status>' from the fixture", () => {
    renderCard();
    expect(screen.getByText(/Partido 1 · Pendiente/)).toBeTruthy();
  });

  it("centers the pending dash between the two teams with their emblems + race lines", () => {
    renderCard();
    // The center scorebox replaces the old "VS": pending shows "- : -".
    expect(screen.getByTestId("match-card-score").textContent).toMatch(/- : -/);
    // Each team shows its deterministic emblem (initial), name and race line.
    expect(screen.getByTestId("emblem-th").textContent).toBe("R");
    expect(screen.getByTestId("emblem-ta").textContent).toBe("O");
    expect(screen.getByText("Reavers")).toBeTruthy();
    expect(screen.getByText("Orcboyz")).toBeTruthy();
    expect(screen.getByText("Human")).toBeTruthy();
    expect(screen.getByText("Orc")).toBeTruthy();
  });

  it("shows a Programado badge with the scheduled date", () => {
    renderCard({
      fixture: fixture({ status: "scheduled", scheduledAt: "2026-03-01T10:00:00.000Z" }),
    });
    // Label appears in the header and the footer.
    const labels = screen.getAllByText(/Programado/);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/01\/03\/2026/)).toBeTruthy();
  });

  it("shows the agreed time alongside the date in the scheduled footer", () => {
    // The negotiation agrees a date AND a time; the card footer must expose the
    // time so a participant sees the exact slot agreed, not just the day.
    renderCard({
      fixture: fixture({ status: "scheduled", scheduledAt: "2026-03-01T10:00:00.000Z" }),
    });
    expect(
      screen.getByText(/Programado: \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/),
    ).toBeTruthy();
  });

  it("shows a Jugado header with the winner highlighted and the loser grayed when played", () => {
    renderCard({ fixture: fixture({ status: "played", winnerId: "th", homeScore: 2, awayScore: 1 }) });
    const labels = screen.getAllByText(/Jugado/);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    // The winner's side carries the VICTORIA chip and the winner ring.
    expect(screen.getByText("VICTORIA")).toBeTruthy();
    expect(screen.getByTestId("emblem-th").className).toContain("ring-2");
    const winnerSide = screen.getByText("VICTORIA").closest("[data-winner='true']");
    expect(winnerSide).toBeTruthy();
    expect(withinSide(winnerSide as HTMLElement).getByText("Reavers")).toBeTruthy();
  });

  it("renders the final score (home : away) with the winner highlighted on a played result", () => {
    renderCard({ fixture: fixture({ status: "played", winnerId: "th", homeScore: 2, awayScore: 1 }) });
    expect(screen.getByTestId("match-card-score").textContent).toMatch(/2 : 1/);
    expect(screen.getByText("VICTORIA")).toBeTruthy();
  });

  it("keeps the winner highlight when a played result has no raw scores", () => {
    renderCard({ fixture: fixture({ status: "played", winnerId: "th", homeScore: null, awayScore: null }) });
    // No score available → the pending dash; the winner still gets the VICTORIA chip.
    expect(screen.getByTestId("match-card-score").textContent).toMatch(/- : -/);
    expect(screen.getByText("VICTORIA")).toBeTruthy();
  });

  it("renders a draw neutrally (no VICTORIA chip, no winner column)", () => {
    renderCard({ fixture: fixture({ status: "played", winnerId: null, homeScore: 1, awayScore: 1 }) });
    expect(screen.getByTestId("match-card-score").textContent).toMatch(/1 : 1/);
    expect(screen.queryByText("VICTORIA")).toBeNull();
    expect(document.querySelector("[data-winner='true']")).toBeNull();
  });

  it("does not label a winnerId-only forfeit as Jugado when no result is recorded", () => {
    // Server now derives `played` from scores; winnerId alone → pending.
    renderCard({ fixture: fixture({ status: "pending", winnerId: "th" }) });
    expect(screen.getByText(/Pendiente/)).toBeTruthy();
    expect(screen.queryByText(/Jugado/)).toBeNull();
    // No result recorded → no winner chip and a pending dash.
    expect(screen.queryByText("VICTORIA")).toBeNull();
    expect(screen.getByTestId("match-card-score").textContent).toMatch(/- : -/);
  });

  it("shows the pulsing EN VIVO badge and the live score for a running match", () => {
    renderCard({
      fixture: fixture({
        status: "scheduled",
        scheduledAt: "2026-03-01T10:00:00.000Z",
        live: { status: "live", homeScore: 1, awayScore: 0, half: 2, turnNumber: 5 },
      }),
    });
    expect(screen.getAllByText("EN VIVO").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByTestId("match-card-score").textContent).toMatch(/1 : 0/);
    // The live match owns its scoreboard → no result-load control.
    expect(screen.queryByRole("button", { name: /Cargar resultado/ })).toBeNull();
  });

  it("restores the load-result path once the live match is finished", () => {
    renderCard({
      fixture: fixture({
        status: "scheduled",
        scheduledAt: "2026-03-01T10:00:00.000Z",
        homeOwner: { id: "u1", name: "raul" },
        live: { status: "finished", homeScore: 2, awayScore: 1, half: 2, turnNumber: 8 },
      }),
      currentUserId: "u1",
    });
    expect(screen.queryByText("EN VIVO")).toBeNull();
    expect(screen.getByRole("button", { name: /Cargar resultado/ })).toBeTruthy();
  });

  it("links each team's name to its scouting page '/teams/[id]'", () => {
    render(
      <MatchCard
        fixture={fixture()}
        teamNameById={teamNameById}
        raceNameById={raceNameById}
        currentUserId="u3"
        isLeagueOwner={false}
        onNegotiate={vi.fn()}
        onForfeit={vi.fn()}
      />,
    );
    const homeLink = screen.getByRole("link", { name: /Reavers/ });
    const awayLink = screen.getByRole("link", { name: /Orcboyz/ });
    expect(homeLink.getAttribute("href")).toBe("/teams/th");
    expect(awayLink.getAttribute("href")).toBe("/teams/ta");
  });

  it("fires onNegotiate when the card's center score is clicked", () => {
    const { onNegotiate } = renderCard();
    fireEvent.click(screen.getByTestId("match-card-score"));
    expect(onNegotiate).toHaveBeenCalledTimes(1);
  });
});

describe("MatchCard — Ver partido navigation (MV-4)", () => {
  function linksInOrder() {
    return screen.getAllByRole("link").map((l) => ({
      text: l.textContent?.trim() ?? "",
      href: l.getAttribute("href"),
    }));
  }

  it("renders 'Ver partido' as the LAST link in ALL states and hrefs to the match page", () => {
    const states: { status: FixtureDraft["status"] }[] = [
      { status: "pending" },
      { status: "scheduled" },
      { status: "played" },
    ];
    for (const { status } of states) {
      const overrides: Partial<FixtureDraft> = { status };
      if (status === "scheduled") overrides.scheduledAt = "2026-03-01T10:00:00.000Z";
      if (status === "played") {
        overrides.winnerId = "th";
        overrides.homeScore = 2;
        overrides.awayScore = 1;
      }
      const { unmount } = render(
        <MatchCard
          fixture={fixture(overrides)}
          teamNameById={teamNameById}
          raceNameById={raceNameById}
          currentUserId="u3"
          isLeagueOwner={false}
          onNegotiate={vi.fn()}
          onForfeit={vi.fn()}
        />,
      );

      const links = linksInOrder();
      const last = links[links.length - 1];
      // "Ver partido" is the LAST DOM link.
      expect(last.text).toBe("Ver partido");
      expect(last.href).toBe("/leagues/l1/fixtures/f1");
      // The team links remain the first two (Jornadas fixturesTeamNames reads them).
      expect(links[0].text).toBe("Reavers");
      expect(links[1].text).toBe("Orcboyz");
      unmount();
    }
  });

  it("keeps the scheduled footer byte-identical and renders the link last", () => {
    render(
      <MatchCard
        fixture={fixture({ status: "scheduled", scheduledAt: "2026-03-01T10:00:00.000Z" })}
        teamNameById={teamNameById}
        raceNameById={raceNameById}
        currentUserId="u3"
        isLeagueOwner={false}
        onNegotiate={vi.fn()}
        onForfeit={vi.fn()}
      />,
    );
    // Exact existing scheduled line: Programado: DD/MM/YYYY, HH:MM
    expect(screen.getByText(/Programado: \d{2}\/\d{2}\/\d{4}, \d{2}:\d{2}/)).toBeTruthy();
    const links = linksInOrder();
    expect(links[links.length - 1].text).toBe("Ver partido");
  });

  it("moves the played score to the center and renders the link last", () => {
    render(
      <MatchCard
        fixture={fixture({ status: "played", winnerId: "th", homeScore: 2, awayScore: 1 })}
        teamNameById={teamNameById}
        raceNameById={raceNameById}
        currentUserId="u3"
        isLeagueOwner={false}
        onNegotiate={vi.fn()}
        onForfeit={vi.fn()}
      />,
    );
    // The result moved to the CENTER (Tourplay); the footer no longer repeats it.
    expect(screen.getByTestId("match-card-score").textContent).toMatch(/2 : 1/);
    expect(screen.queryByText(/Ganador:/)).toBeNull();
    const links = linksInOrder();
    expect(links[links.length - 1].text).toBe("Ver partido");
  });

  it("renders 'Ver partido' for pending with no state line (header labels Pendiente)", () => {
    renderCard();
    // Pending shows no Programado/Jugado line...
    expect(screen.queryByText(/Programado:/)).toBeNull();
    expect(screen.queryByText(/Jugado/)).toBeNull();
    // ...but the nav link still renders.
    const links = linksInOrder();
    expect(links[links.length - 1].text).toBe("Ver partido");
  });
});

describe("MatchCard — correction + forfeit visibility (PR 4 correction)", () => {
  it("shows 'Corregir resultado' to a participant captain on a played fixture", () => {
    renderCard({
      fixture: fixture({ status: "played", winnerId: "th", homeScore: 2, awayScore: 1 }),
      currentUserId: "u1", // home team owner (participant captain)
      isLeagueOwner: false,
      onCorrectResult: vi.fn(),
    });
    expect(screen.getByRole("button", { name: /Corregir resultado/ })).toBeTruthy();
  });

  it("shows 'Corregir resultado' to the league admin on a played fixture", () => {
    renderCard({
      fixture: fixture({ status: "played", winnerId: "th", homeScore: 2, awayScore: 1 }),
      currentUserId: "u3",
      isLeagueOwner: true,
      onCorrectResult: vi.fn(),
    });
    expect(screen.getByRole("button", { name: /Corregir resultado/ })).toBeTruthy();
  });

  it("keeps the forfeit button admin-only (a participant captain does NOT see 'Otorgar victoria')", () => {
    renderCard({
      fixture: fixture({ status: "scheduled", scheduledAt: "2026-03-01T18:00:00.000Z" }),
      currentUserId: "u1", // participant, not admin
      isLeagueOwner: false,
    });
    expect(screen.queryByRole("button", { name: /Otorgar victoria/ })).toBeNull();
    // The admin DOES see it.
    const { unmount } = render(
      <MatchCard
        fixture={fixture({ status: "scheduled", scheduledAt: "2026-03-01T18:00:00.000Z" })}
        teamNameById={teamNameById}
        raceNameById={raceNameById}
        currentUserId="u3"
        isLeagueOwner
        onNegotiate={vi.fn()}
        onForfeit={vi.fn()}
      />,
    );
    expect(screen.getAllByRole("button", { name: /Otorgar victoria/ }).length).toBeGreaterThan(0);
    unmount();
  });

  it("hides 'Corregir resultado' on a non-played (scheduled) fixture for a participant", () => {
    renderCard({
      fixture: fixture({ status: "scheduled", scheduledAt: "2026-03-01T18:00:00.000Z" }),
      currentUserId: "u1",
      isLeagueOwner: false,
      onCorrectResult: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: /Corregir resultado/ })).toBeNull();
  });
});

describe("MatchCard — finished league (RAU-40)", () => {
  it("hides result load / forfeit controls and disables the negotiation click", () => {
    const { onNegotiate, onForfeit } = renderCard({
      leagueFinished: true,
      isLeagueOwner: true,
      currentUserId: "u1",
      fixture: fixture({ status: "scheduled", scheduledAt: "2026-03-01T10:00:00.000Z" }),
      onLoadResult: vi.fn(),
      onCorrectResult: vi.fn(),
    });
    // The admin would normally see Cargar resultado + Otorgar victoria.
    expect(screen.queryByRole("button", { name: /Cargar resultado/ })).toBeNull();
    expect(screen.queryByRole("button", { name: /Otorgar victoria/ })).toBeNull();
    // Clicking the card does NOT open the negotiation panel.
    fireEvent.click(screen.getByTestId("match-card-score"));
    expect(onNegotiate).not.toHaveBeenCalled();
    expect(onForfeit).not.toHaveBeenCalled();
  });

  it("hides the correction affordance on a played fixture of a finished league", () => {
    renderCard({
      leagueFinished: true,
      isLeagueOwner: true,
      currentUserId: "u1",
      fixture: fixture({ status: "played", winnerId: "th", homeScore: 2, awayScore: 1 }),
      onCorrectResult: vi.fn(),
    });
    expect(screen.queryByRole("button", { name: /Corregir resultado/ })).toBeNull();
  });
});

/** Scoped queries within a winner/loser column (asserts the highlight layout). */
function withinSide(side: HTMLElement) {
  return {
    getByText: (text: string) => {
      const found = Array.from(side.querySelectorAll("a")).find(
        (a) => a.textContent?.trim() === text,
      );
      expect(found).toBeTruthy();
      return found as HTMLElement;
    },
  };
}
