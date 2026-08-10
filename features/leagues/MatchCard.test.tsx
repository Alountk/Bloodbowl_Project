import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MatchCard, type MatchCardProps, matchStatusLabel, formatMatchDate } from "./MatchCard";
import type { FixtureDraft } from "./api";

/**
 * Pattern B MatchCard: a per-fixture card whose header is "Partido N · <status>",
 * whose body centers a "VS" with each team on its own side (team name + the
 * owner user's name below from the API's homeOwner/awayOwner), that navigates to
 * `/teams/[id]` (scouting) when a team is clicked, and that fires onNegotiate
 * when the card (its VS area) is clicked. Status badge labels Pendiente /
 * Programado (with date) / Jugado (with winner). Admin-only Forfeit control is
 * surfaced elsewhere (ForfeitModal), not on the card.
 */

const teamNameById = new Map([
  ["th", "Reavers"],
  ["ta", "Orcboyz"],
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
    expect(matchStatusLabel("pending", null, null)).toBe("Pendiente");
  });
  it("labels scheduled as Programado", () => {
    expect(matchStatusLabel("scheduled", "2026-03-01T10:00:00.000Z", null)).toBe("Programado");
  });
  it("labels played as Jugado", () => {
    expect(matchStatusLabel("played", null, "th")).toBe("Jugado");
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

describe("MatchCard", () => {
  it("renders the header 'Partido <n> · <status>' from the fixture", () => {
    renderCard();
    expect(screen.getByText(/Partido 1 · Pendiente/)).toBeTruthy();
  });

  it("centers a VS between the two team names with each owner's name below", () => {
    renderCard();
    expect(screen.getByText("VS")).toBeTruthy();
    // Each team shows its name (from the league member teams map) and the owner
    // user's name directly below (from the API's homeOwner/awayOwner).
    expect(screen.getByText("Reavers")).toBeTruthy();
    expect(screen.getByText("Orcboyz")).toBeTruthy();
    expect(screen.getByText("raul")).toBeTruthy();
    expect(screen.getByText("maria")).toBeTruthy();
  });

  it("shows the owner's name even when it differs from the team name", () => {
    renderCard({ fixture: fixture({ homeOwner: { id: "u1", name: "Coach Raul" } }) });
    expect(screen.getByText("Coach Raul")).toBeTruthy();
    expect(screen.getByText("Reavers")).toBeTruthy();
  });

  it("renders the owner avatar beside the name when the owner has one", () => {
    renderCard({
      fixture: fixture({
        homeOwner: { id: "u1", name: "raul", avatar: "/uploads/avatars/u-1.webp" },
        awayOwner: { id: "u2", name: "maria", avatar: "/uploads/avatars/u-2.webp" },
      }),
    });
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(2);
    expect(imgs[0].getAttribute("src")).toBe("/uploads/avatars/u-1.webp");
    expect(imgs[1].getAttribute("src")).toBe("/uploads/avatars/u-2.webp");
    // The name fallback stays rendered beside the avatar.
    expect(screen.getByText("raul")).toBeTruthy();
    expect(screen.getByText("maria")).toBeTruthy();
  });

  it("renders no avatar image for an owner without one, keeping the name fallback", () => {
    const { container } = render(
      <MatchCard
        fixture={fixture({ homeOwner: { id: "u1", name: "raul", avatar: null }, awayOwner: { id: "u2", name: "maria" } })}
        teamNameById={teamNameById}
        currentUserId="u3"
        isLeagueOwner={false}
        onNegotiate={vi.fn()}
        onForfeit={vi.fn()}
      />,
    );
    expect(container.querySelector("img")).toBeNull();
    expect(screen.getByText("raul")).toBeTruthy();
    expect(screen.getByText("maria")).toBeTruthy();
  });

  it("renders nothing (no img) when the home owner avatar is absent but the away has one", () => {
    renderCard({
      fixture: fixture({
        homeOwner: { id: "u1", name: "raul" },
        awayOwner: { id: "u2", name: "maria", avatar: "/uploads/avatars/u-2.webp" },
      }),
    });
    const imgs = screen.getAllByRole("img");
    expect(imgs).toHaveLength(1);
    expect(imgs[0].getAttribute("src")).toBe("/uploads/avatars/u-2.webp");
  });

  it("shows a Programado badge with the scheduled date", () => {
    renderCard({
      fixture: fixture({ status: "scheduled", scheduledAt: "2026-03-01T10:00:00.000Z" }),
    });
    // Label appears in the badge and the footer.
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

  it("shows a Jugado badge with the winner when played", () => {
    renderCard({ fixture: fixture({ status: "played", winnerId: "th" }) });
    const labels = screen.getAllByText(/Jugado/);
    expect(labels.length).toBeGreaterThanOrEqual(1);
    // The footer names the winner team.
    expect(screen.getByText(/Ganador: Reavers/)).toBeTruthy();
  });

  it("links each team's name to its scouting page '/teams/[id]'", () => {
    render(
      <MatchCard
        fixture={fixture()}
        teamNameById={teamNameById}
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

  it("fires onNegotiate when the card's VS area is clicked", () => {
    const { onNegotiate } = renderCard();
    fireEvent.click(screen.getByText("VS"));
    expect(onNegotiate).toHaveBeenCalledTimes(1);
  });
});
