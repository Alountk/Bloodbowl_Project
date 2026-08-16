import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { LiveEventCards } from "./liveEventCards";
import type { LiveMatchView, MatchTeamDetail, LiveMatchEventDto } from "./api";

/**
 * Tourplay event cards (MVT-1/D3): team events at 68% width with the side
 * gradient + turn tag (own side) / minute (opposite side); generic events at
 * 100% centered; TD cards carry the derived partial score; foul/casualty cards
 * carry victim/cause-causer lines (MVT-5). Strict TDD RED suite.
 */

function player(id: string, name: string, positionalKey = "blitzer", valueBonus = 0) {
  return { rosterPlayerId: id, name, positionalKey, pe: 0, skills: {}, injuries: {}, alive: true, valueBonus };
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
  players: [player("p2", "Blitzer B"), player("p8", "Trash", "blocker")],
};

function ev(
  seq: number,
  kind: string,
  side: "home" | "away" | null,
  payload: Record<string, unknown> = {},
  playerRosterId: string | null = null,
  turnNumber = 1,
  at = 1000,
): LiveMatchEventDto {
  return { seq, kind, side, playerRosterId, half: 1, turnNumber, payload, at };
}

function renderCards(events: LiveMatchEventDto[]) {
  const live = {
    seq: events.length,
    status: "finished",
    half: 1,
    turnNumber: 8,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    viewerSide: null,
    startedAt: 1000,
    elapsed: 0,
    homeTurnMs: 0,
    awayTurnMs: 0,
    paused: false,
    homeScore: 1,
    awayScore: 0,
    finishedAt: 5000,
    events,
  } as LiveMatchView;
  return render(<LiveEventCards events={live.events} startedAt={live.startedAt} homeTeam={homeTeam} awayTeam={awayTeam} />);
}

describe("LiveEventCards — team cards 68% + generic 100% (MVT-1/D3)", () => {
  it("renders a home TD as a team card with the turn tag, minute, player and partial score", () => {
    const { container } = renderCards([ev(5, "td", "home", {}, "p1", 4, 241000)]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row).toBeTruthy();
    // The team card is 68%-width-sourced via self-start (home reads left→right);
    // behaviorally it carries a turn tag on the team's side + the minute.
    expect(row.textContent).toContain("T4");
    expect(row.textContent).toContain("4'");
    expect(row.textContent).toContain("Touchdown");
    expect(row.textContent).toContain("Blitzer A");
  });

  it("renders a generic endMatch event as a full-width card with no turn tag", () => {
    const { container } = renderCards([ev(12, "endMatch", null, {}, null, 8, 481000)]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row).toBeTruthy();
    // Generic cards span 100% and center the info; behaviorally they show the
    // minute but NO per-side turn tag (T\d).
    expect(row.textContent).toContain("Fin del partido");
    expect(row.textContent).toContain("8'");
    expect(row.textContent).not.toMatch(/T\d/);
  });

  it("places home turns on the home side clock-wise and renders both team + generic cards in seq order", () => {
    const tds = [
      ev(5, "td", "home", {}, "p1", 4, 4000),
      ev(2, "td", "away", {}, "p2", 5, 4500),
      ev(10, "endMatch", null, {}, null, 8, 5000),
    ];
    renderCards(tds);
    const rows = Array.from(screen.getAllByTestId("live-event-row"));
    // Both card kinds share the container; every row preserves live-event-row.
    expect(rows.length).toBe(3);
  });
});

describe("LiveEventCards — per-TD partial score (MVT-1/D5)", () => {
  it("shows (1 - 0) on the home TD then (1 - 1) on the away TD", () => {
    const { container } = renderCards([
      ev(5, "td", "home", {}, "p1", 3, 2000),
      ev(7, "td", "away", {}, "p2", 5, 4500),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    const homeTd = rows.find((li) => li.textContent?.includes("Blitzer A"));
    const awayTd = rows.find((li) => li.textContent?.includes("Blitzer B"));
    expect(homeTd).toBeTruthy();
    expect(awayTd).toBeTruthy();
    expect(homeTd!.textContent).toContain("(1 - 0)");
    expect(awayTd!.textContent).toContain("(1 - 1)");
  });

  it("renders no partial score on non-TD cards", () => {
    const { container } = renderCards([ev(6, "completion", "home", {}, "p1", 3, 2000)]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.textContent).not.toMatch(/\(\d+ - \d+\)/);
  });
});

describe("LiveEventCards — victim and cause lines (MVT-5)", () => {
  it("renders a foul victim line 'a {name} (#{dorsal})' from victimRosterId", () => {
    const { container } = renderCards([
      ev(8, "foul", "home", { victimRosterId: "p8" }, "p1", 3, 2000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.textContent).toContain("a Trash (#2)");
  });

  it("renders a casualty cause + causer line 'por {name} (#{dorsal}) · {cause}'", () => {
    const { container } = renderCards([
      ev(9, "casualty", "away", { band: "grave", cause: "blitz", causerRosterId: "p4" }, "p2", 6, 3000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    // Victim (Blitzer B) main row + causer Arnau (away roster p4 → #2) · Blitz.
    expect(row.textContent).toContain("Blitzer B");
    expect(row.textContent).toContain("por Arnau (#2) · Blitz");
  });

  it("renders 'El público' for a crowd casualty with no causer and the bare cause for a self-inflicted dodge", () => {
    const { container } = renderCards([
      ev(9, "casualty", "away", { band: "grave", cause: "crowd" }, "p2", 6, 3000),
      ev(10, "casualty", "home", { band: "bruise", cause: "dodge" }, "p1", 6, 3100),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    const crowd = rows.find((li) => li.textContent?.includes("Blitzer B"));
    const dodge = rows.find((li) => li.textContent?.includes("Blitzer A"));
    expect(crowd).toBeTruthy();
    expect(dodge).toBeTruthy();
    expect(crowd!.textContent).toContain("El público");
    expect(dodge!.textContent).toContain("Esquivando — se cayó");
    expect(dodge!.textContent).not.toContain("por ");
  });
});

describe("LiveEventCards — legacy fallback (LM-6) and unknown cause pass-through", () => {
  it("renders a legacy casualty with an empty payload as a plain Baja row (no victim/cause line, no error)", () => {
    const { container } = renderCards([
      ev(9, "casualty", "home", {}, "p1", 3, 2000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.textContent).toContain("Baja");
    expect(row.textContent).not.toContain("por ");
    expect(row.textContent).not.toContain("a ");
  });

  it("passes an unknown cause through unchanged without throwing", () => {
    const { container } = renderCards([
      ev(9, "casualty", "home", { band: "grave", cause: "meteorite" }, "p1", 3, 2000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.textContent).toContain("meteorite");
  });
});

describe("LiveEventCards — turn transition (RAU-36/37)", () => {
  it("does NOT render the generic 'turn' (Fin de turno) event as a card", () => {
    const { container } = renderCards([
      ev(5, "turn", null, {}, null, 4, 4000),
      ev(6, "td", "home", {}, "p1", 4, 4100),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    // Only the TD survives — the turn-pass noise is dropped from the feed.
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain("Touchdown");
    expect(container.textContent).not.toContain("Fin de turno");
  });

  it("renders a home turnStart as a team-assigned 68% card labeled 'Turno Reavers'", () => {
    const { container } = renderCards([ev(5, "turnStart", "home", {}, null, 4, 4000)]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row).toBeTruthy();
    // Team-card treatment: 68% width, home (navy) side gradient, self-start.
    expect(row.className).toContain("w-[68%]");
    expect(row.className).toContain("linear-gradient(90deg,rgba(18,34,90,0.12)");
    expect(row.className).toContain("self-start");
    // Team-specific text instead of the generic audit label.
    expect(row.textContent).toContain("Turno Reavers");
    expect(row.textContent).toContain("T4");
    expect(row.textContent).not.toContain("Tu turno");
  });

  it("renders an away turnStart with the away (red) gradient and 'Turno Dwarves'", () => {
    const { container } = renderCards([ev(6, "turnStart", "away", {}, null, 5, 4500)]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.className).toContain("w-[68%]");
    expect(row.className).toContain("linear-gradient(270deg,rgba(209,25,56,0.12)");
    expect(row.className).toContain("self-end");
    expect(row.textContent).toContain("Turno Dwarves");
    expect(row.textContent).not.toContain("Tu turno");
  });
});

describe("LiveEventCards — kickoff expensive_mistake team card (MVT-6/LM-24)", () => {
  it("renders a home em as a 68% team card with the money-bag glyph, outcome label and treasury before → after (LM-24)", () => {
    const { container } = renderCards([
      ev(
        6,
        "expensive_mistake",
        "home",
        { outcome: "serious-incident", treasuryBefore: 234000, treasuryAfter: 214000 },
        null,
        1,
        1000,
      ),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    // MVT-6: team card width + the navy (home) side gradient.
    expect(row.className).toContain("w-[68%]");
    expect(row.className).toContain("linear-gradient(90deg,rgba(18,34,90,0.12)");
    // Label, outcome label and the es-ES treasury line.
    expect(row.textContent).toContain("Error costoso");
    expect(row.textContent).toContain("Incidente grave");
    expect(row.textContent).toContain("234.000 → 214.000 M.O.");
  });

  it("renders the away em with the away (red) gradient and money-bag glyph", () => {
    const { container } = renderCards([
      ev(
        7,
        "expensive_mistake",
        "away",
        { outcome: "minor-incident", amountLost: 20000, treasuryBefore: 234000, treasuryAfter: 214000 },
        null,
        1,
        1000,
      ),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.className).toContain("w-[68%]");
    expect(row.className).toContain("linear-gradient(270deg,rgba(209,25,56,0.12)");
    expect(row.textContent).toContain("Error costoso");
    expect(row.textContent).toContain("Incidente menor");
  });

  it("renders a label-only fallback when treasury fields are missing (no line, no throw)", () => {
    const { container } = renderCards([
      ev(8, "expensive_mistake", "home", { outcome: "crisis-evaded" }, null, 1, 1000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.textContent).toContain("Error costoso");
    expect(row.textContent).toContain("Crisis evitada");
    // No treasury before→after line, and must not throw.
    expect(row.textContent).not.toMatch(/→/);
    expect(row.textContent).not.toMatch(/M\.O\./);
  });

  it("keeps the live-event-row testid on the em card (MVT-6 continuity)", () => {
    const { container } = renderCards([
      ev(6, "expensive_mistake", "home", { outcome: "crisis-evaded", treasuryBefore: 100000, treasuryAfter: 100000 }, null, 1, 1000),
    ]);
    expect(container.querySelectorAll("[data-testid='live-event-row']")).toHaveLength(1);
  });
});

describe("LiveEventCards — kickoff fan_factor centered row (MVT-6/LM-24)", () => {
  it("renders as a centered 100% row with the compact per-team totals copy", () => {
    const { container } = renderCards([
      ev(7, "fan_factor", null, { home: { base: 2, dice: 2, total: 4 }, away: { base: 1, dice: 3, total: 4 } }, null, 1, 1000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    // Centered 100% width (generic branch, w-full) + the dice glyph.
    expect(row.className).toContain("w-full");
    expect(row.textContent).toContain("Factor de aficionados");
    // Compact per-team copy with people-before-base and dice-before-roll glyphs.
    expect(row.textContent).toContain("Local: 👥2 + 🎲2 = 4");
    expect(row.textContent).toContain("Visitante: 👥1 + 🎲3 = 4");
    expect(row.className).toContain("justify-self-stretch");
  });

  it("renders the per-team totals from a different roll (triangulation)", () => {
    const { container } = renderCards([
      ev(7, "fan_factor", null, { home: { base: 3, dice: 1, total: 4 }, away: { base: 2, dice: 2, total: 4 } }, null, 1, 1000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.textContent).toContain("Local: 👥3 + 🎲1 = 4");
    expect(row.textContent).toContain("Visitante: 👥2 + 🎲2 = 4");
  });
});
