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
  return { rosterPlayerId: id, name, positionalKey, pe: 0, skills: {}, injuries: {}, alive: true, missNextMatch: false, valueBonus };
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
    // The team card is 68%-width-sourced via the module `.ev--home` (home reads
    // left→right); behaviorally it carries a turn tag on the team's side + the minute.
    expect(row.textContent).toContain("T4");
    expect(row.textContent).toContain("4'");
    expect(row.textContent).toContain("Touchdown");
    expect(row.textContent).toContain("Blitzer A");
    // v7 structure: navy turn tag + navy helmet token + dorsal column +
    // name/position, then the right detail column with the ★3 dline + partial.
    expect(row.querySelector(".turn-tag")?.className).toContain("turn-tag--home");
    expect(row.querySelector(".token")?.className).toContain("token--home");
    expect(row.querySelector(".token svg")).toBeTruthy();
    expect(row.querySelector(".dorsal")?.textContent).toBe("#1");
    expect(row.querySelector(".name")?.textContent).toBe("Blitzer A");
    expect(row.querySelector(".pos")?.textContent).toBe("Human Blitzer");
    const dline = row.querySelector(".dline");
    expect(dline?.textContent).toContain("Touchdown");
    expect(dline?.textContent).toContain("(★3)");
    expect(row.querySelector(".score-note")?.textContent).toBe("(1 - 0)");
  });

  it("mirrors an away team card (red gradient, right-aligned, reversed body, tag right / minute left)", () => {
    const { container } = renderCards([ev(5, "td", "away", {}, "p2", 5, 241000)]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.className).toContain("ev--away");
    // Away corners: red turn tag top-right, minute bottom-left, red token tint.
    expect(row.querySelector(".turn-tag")?.className).toContain("turn-tag--away");
    expect(row.querySelector(".minute")?.textContent).toBe("4'");
    expect(row.querySelector(".token")?.className).toContain("token--away");
    // The away body mirrors (row-reverse via the module's `.ev--away .card-body`
    // rule) with the name right-aligned and the detail column left-aligned; the
    // DOM still reads token → dorsal → who → detail before the visual flip.
    expect(row.querySelector(".card-body")).toBeTruthy();
    expect(row.querySelector(".card-body")?.firstElementChild?.className).toContain("token");
    expect(row.querySelector(".who")).toBeTruthy();
    expect(row.querySelector(".detail")).toBeTruthy();
    expect(row.querySelector(".dline")?.className).toContain("dline--away");
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
    // v7: the finish wall-clock sub (from the event's own timestamp) + the
    // right minute data slot.
    expect(row.querySelector(".csub")?.textContent).toMatch(/^\d{2}:\d{2}$/);
    expect(row.querySelector(".cright")?.textContent).toBe("8'");
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
    // The victim is an OPPONENT (LM-12): its mini-token carries the RIVAL red
    // tint on the home card (`vtoken--away`).
    expect(row.querySelector(".vtoken")?.className).toContain("vtoken--away");
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

describe("LiveEventCards — casualty band sub-lines (v7)", () => {
  it("renders ¡Muerto! / Se pierde el próximo partido / Lesión molesta under the label", () => {
    const { container } = renderCards([
      ev(9, "casualty", "home", { band: "dead" }, "p1", 3, 2000),
      ev(10, "casualty", "home", { band: "apaleado" }, "p1", 3, 2100),
      ev(11, "casualty", "home", { band: "bruise" }, "p1", 3, 2200),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    // Newest-first ordering: seq 11 (bruise), 10 (apaleado), 9 (dead).
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain("Herida");
    expect(rows[0].textContent).toContain("Lesión molesta");
    expect(rows[1].textContent).toContain("Baja");
    expect(rows[1].textContent).toContain("Se pierde el próximo partido");
    expect(rows[2].textContent).toContain("Baja");
    expect(rows[2].textContent).toContain("¡Muerto!");
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
    // Team-card treatment: 68% width + home (navy) side gradient + left edge
    // (all module-owned via `.ev--home`).
    expect(row.className).toContain("ev--home");
    // Team-specific text instead of the generic audit label.
    expect(row.textContent).toContain("Turno Reavers");
    expect(row.textContent).toContain("T4");
    expect(row.textContent).not.toContain("Tu turno");
    // v7 body: 30×30 token (NO dorsal), "Empieza el turno" position line and a
    // hand detail line repeating the "Turno {team}" label.
    expect(row.querySelector(".token")).toBeTruthy();
    expect(row.querySelector(".dorsal")).toBeNull();
    expect(row.textContent).toContain("Empieza el turno");
    expect(row.querySelector(".dline")?.textContent).toContain("Turno Reavers");
  });

  it("renders an away turnStart with the away (red) gradient and 'Turno Dwarves'", () => {
    const { container } = renderCards([ev(6, "turnStart", "away", {}, null, 5, 4500)]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row.className).toContain("ev--away");
    expect(row.textContent).toContain("Turno Dwarves");
    expect(row.textContent).not.toContain("Tu turno");
    // Away turn card mirrors: red token tint + the turn-start position line.
    expect(row.querySelector(".token")?.className).toContain("token--away");
    expect(row.textContent).toContain("Empieza el turno");
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
    // MVT-6: team card width + the navy (home) side gradient (module `.ev--home`).
    expect(row.className).toContain("ev--home");
    // Label, outcome label and the es-ES treasury line.
    expect(row.textContent).toContain("Error costoso");
    expect(row.textContent).toContain("Incidente grave");
    expect(row.textContent).toContain("234.000 → 214.000 M.O.");
    // v7 kbody: money-bag kcicon + "{team} · {outcome}" sub + treasury line.
    expect(row.textContent).toContain("Reavers · Incidente grave");
    expect(row.querySelector(".kcicon svg")).toBeTruthy();
    expect(row.querySelector(".ksub")?.textContent).toBe("Reavers · Incidente grave");
    expect(row.querySelector(".ktreasury")?.textContent).toBe("234.000 → 214.000 M.O.");
    // The tabular-nums styling moved to the module `.kwho .ktreasury`; the card
    // keeps its kbody structure.
    expect(row.querySelector(".kbody")).toBeTruthy();
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
    expect(row.className).toContain("ev--away");
    expect(row.textContent).toContain("Error costoso");
    expect(row.textContent).toContain("Incidente menor");
    expect(row.textContent).toContain("Dwarves · Incidente menor");
    expect(row.querySelector(".kcicon")?.className).toContain("kcicon--away");
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

describe("LiveEventCards — concede centered card (RAU-38)", () => {
  it("renders a concede as a centered 100% card with the surrender/victory sub-line", () => {
    const { container } = renderCards([
      ev(9, "concede", "home", { winnerSide: "away" }, null, 3, 4000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    expect(row).toBeTruthy();
    // Centered 100% width (generic branch) with the white-flag glyph.
    expect(row.className).toContain("ev--center");
    expect(row.querySelector(".cicon svg")).toBeTruthy();
    expect(row.querySelector(".ctitle")?.textContent).toBe("Concesión");
    // "{surrendering team} se rinde · Victoria de {acceptor team}" — the event
    // side is the SURRENDERING side, payload.winnerSide the acceptor.
    expect(row.querySelector(".csub")?.textContent).toBe("Reavers se rinde · Victoria de Dwarves");
    // The card carries no turn tag / minute (generic row).
    expect(row.querySelector(".turn-tag")).toBeNull();
  });

  it("renders the away-surrender mirror and a label-only fallback when the payload lacks the winner", () => {
    const { container } = renderCards([
      ev(10, "concede", "away", { winnerSide: "home" }, null, 5, 5000),
      ev(11, "concede", "home", {}, null, 5, 5100),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    expect(rows).toHaveLength(2);
    const awaySurrender = rows.find((li) => li.textContent?.includes("Dwarves se rinde"));
    expect(awaySurrender).toBeTruthy();
    expect(awaySurrender!.textContent).toContain("Victoria de Reavers");
    // A concede without the payload winner (legacy/malformed) still renders the
    // bare "Concesión" row with no sub-line and never throws.
    const fallback = rows.find((li) => li.textContent?.includes("Concesión") && !li.textContent?.includes("se rinde"));
    expect(fallback).toBeTruthy();
    expect(fallback!.querySelector(".csub")).toBeNull();
  });
});

describe("LiveEventCards — derived ACTION card on the causer's side (RAU-39)", () => {
  it("renders a caused casualty as TWO cards: the injury card (victim) AND the action card (causer + cause + roll/band)", () => {
    // The victim is Blitzer B (away, p2); the causer Arnau (home, p4) is an
    // OPPONENT of the victim (LM-12), so the action card mirrors on home.
    const { container } = renderCards([
      ev(
        9,
        "casualty",
        "away",
        { victimRosterId: "p2", causerRosterId: "p4", cause: "blitz", roll16: 13, roll6: 4, band: "permanent", permanentAttribute: "ps" },
        "p2",
        6,
        3000,
      ),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    expect(rows).toHaveLength(2);
    const injury = rows.find((li) => li.textContent?.includes("Blitzer B"));
    // The action card's MAIN player is the causer — disambiguate from the
    // injury card's "por Arnau" cause line via the card's name node.
    const action = rows.find((li) => li.querySelector(".name")?.textContent === "Arnau");
    expect(injury).toBeTruthy();
    expect(action).toBeTruthy();
    // Injury card: victim side (away, red) + band sub-line + roll line + cause.
    expect(injury!.className).toContain("ev--away");
    expect(injury!.textContent).toContain("Se pierde el próximo partido");
    expect(injury!.textContent).toContain("Tirada 1D16: 13");
    expect(injury!.textContent).toContain("por Arnau (#2) · Blitz");
    // Action card: causer side (home, navy) + cause label + "{causer} hace una
    // herida a {victim}" sub-line + the ★2 SPP the CAUSER earns.
    expect(action!.className).toContain("ev--home");
    expect(action!.textContent).toContain("Blitz");
    expect(action!.textContent).toContain("Arnau hace una herida a Blitzer B");
    expect(action!.textContent).toContain("(★2)");
    // The ROLL belongs to the injury card; RAU-47 keeps the ★2 on the injury
    // card too so the points are visible even when no causer/action card exists.
    expect(injury!.textContent).toContain("Tirada 1D16: 13");
    expect(injury!.textContent).toContain("(★2)");
  });

  it("renders NO action card for a self-inflicted (dodge/crowd) casualty — only the injury card", () => {
    const { container } = renderCards([
      ev(9, "casualty", "away", { victimRosterId: "p2", cause: "crowd", roll16: 12, band: "grave" }, "p2", 6, 3000),
      ev(10, "casualty", "home", { victimRosterId: "p1", cause: "dodge", roll16: 8, band: "bruise" }, "p1", 6, 3100),
    ]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    // Exactly one row per casualty — self-inflicted casualties have no causer.
    expect(rows).toHaveLength(2);
    expect(rows[0].textContent).not.toContain("por ");
    expect(rows[1].textContent).not.toContain("por ");
  });

  it("keeps a legacy casualty (no cause/causer) as a SINGLE card with no action card", () => {
    const { container } = renderCards([ev(9, "casualty", "home", { band: "dead" }, "p1", 6, 3000)]);
    const rows = Array.from(container.querySelectorAll("[data-testid='live-event-row']"));
    expect(rows).toHaveLength(1);
  });
});

describe("LiveEventCards — kickoff fan_factor centered row (MVT-6/LM-24)", () => {
  it("renders as a centered 100% row with the compact per-team totals copy", () => {
    const { container } = renderCards([
      ev(7, "fan_factor", null, { home: { base: 2, dice: 2, total: 4 }, away: { base: 1, dice: 3, total: 4 } }, null, 1, 1000),
    ]);
    const row = container.querySelector("[data-testid='live-event-row']") as HTMLElement;
    // Centered 100% width (generic branch, module `.ev--center`) + the dice glyph.
    expect(row.className).toContain("ev--center");
    expect(row.textContent).toContain("Factor de aficionados");
    // Compact per-team copy with people-before-base and dice-before-roll glyphs.
    expect(row.textContent).toContain("Local: 👥2 + 🎲2 = 4");
    expect(row.textContent).toContain("Visitante: 👥1 + 🎲3 = 4");
    expect(row.querySelector(".cbody")).toBeTruthy();
    // v7: the fan line is 11px/600 in ink (not slate) and the row carries NO
    // right data slot (the validated card has no cright). The line styling now
    // lives in the module `.cbody .ff-line`.
    expect(row.querySelector(".ff-line")).toBeTruthy();
    expect(row.querySelector(".cright")).toBeNull();
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
