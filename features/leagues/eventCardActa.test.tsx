import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveEventCardsActa } from "./eventCardActa";
import type { MatchTeamDetail, LiveMatchEventDto } from "./api";

/**
 * The production chronology renderer (MatchView.tsx / WatchMatchView.tsx) —
 * LM-13 acta-vocabulary cards (verifier defect 1, Slice E). A recorded
 * interception / throw-team-mate / landed-safe MUST render like any player
 * event: player name + dorsal, the ★SPP stars and the ack row. Rendering via
 * the unknown-kind fallback (label + turn meta only) silently killed the
 * cotejo surface and refuted the "rival verifies them the same way" claim.
 */

function player(id: string, name: string, positionalKey = "blitzer", valueBonus = 0) {
  return {
    rosterPlayerId: id,
    name,
    positionalKey,
    pe: 0,
    skills: {},
    injuries: {},
    alive: true,
    missNextMatch: false,
    valueBonus,
  };
}

const homeTeam: MatchTeamDetail = {
  id: "team-home",
  name: "Reavers",
  raceId: "human",
  user: { id: "u1", name: "Coach A", email: null },
  players: [player("p1", "Blitzer A"), player("p4", "Arnau", "thrower")],
};

const awayTeam: MatchTeamDetail = {
  id: "team-away",
  name: "Dwarves",
  raceId: "dwarf",
  user: { id: "u2", name: "Coach B", email: null },
  players: [player("p2", "Blitzer B")],
};

function ev(
  overrides: Partial<LiveMatchEventDto> & Pick<LiveMatchEventDto, "kind">,
): LiveMatchEventDto {
  return {
    seq: 1,
    side: "home",
    playerRosterId: "p1",
    half: 1,
    turnNumber: 3,
    payload: {},
    at: 1000,
    ...overrides,
  };
}

function renderActa(events: LiveMatchEventDto[], now = 2000) {
  return render(
    <LiveEventCardsActa
      events={events}
      startedAt={900}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      now={now}
    />,
  );
}

describe("LiveEventCardsActa — LM-13 scored kinds render like any player card (verifier defect 1)", () => {
  const kinds = [
    { kind: "interception", label: "Intercepción", stars: "★2" },
    { kind: "throwTeamMate", label: "Lanzar compañero", stars: "★1" },
    { kind: "landedSafe", label: "Aterrizar sano", stars: "★1" },
  ] as const;

  it.each(kinds)(
    "$kind renders player + dorsal + ★SPP + the ack row (like the completion beside it)",
    ({ kind, label, stars }) => {
      const { container } = renderActa([
        ev({ kind, side: "home", playerRosterId: "p1", seq: 2 }),
        // The verifier's comparison card: a completion renders player + ★1 + ack.
        ev({ kind: "completion", side: "home", playerRosterId: "p4", seq: 1 }),
      ]);
      const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
      expect(rows).toHaveLength(2);
      const row = rows[0] as HTMLElement; // newest first → the new kind
      expect(row.textContent).toContain(label);
      // Player + dorsal (the unknown-kind fallback renders NEITHER).
      expect(row.textContent).toContain("Blitzer A");
      expect(row.textContent).toContain("#1");
      // ★SPP stars for the kind's bb2025 award.
      expect(row.textContent).toContain(stars);
      // The ack row renders on BOTH cards (the cotejo surface the fallback lost).
      expect(screen.getAllByText(/Sin cotejar/)).toHaveLength(2);
    },
  );

  it("keeps the sibling completion card shape unchanged (player + ★1 + ack row)", () => {
    const { container } = renderActa([
      ev({ kind: "completion", side: "home", playerRosterId: "p4", seq: 1 }),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.textContent).toContain("Arnau");
    expect(row.textContent).toContain("#2");
    expect(row.textContent).toContain("★1");
    expect(screen.getByText(/Sin cotejar/)).toBeTruthy();
  });
});
