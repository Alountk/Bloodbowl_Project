import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RosterPlayerRef } from "../MatchResolveModal";
import { aggregateActions, type ActaActionLine, type ActaState, type ActaTeamDraft } from "./actaState";
import { StepAcciones } from "./StepAcciones";

/**
 * RAU-122 — Step 2 · Acciones tally parity. The displayed "Σ anotaciones" and
 * "bajas causadas" MUST equal the totals `buildActaPayload` transmits, i.e. the
 * sums of `aggregateActions(...)`. A line with no player is dropped by the
 * payload, so it must not inflate the display. No jest-dom matchers in this repo.
 */

const homeName = "Águilas de Khemri";
const awayName = "Colmillos del Caos";
const homeRoster: RosterPlayerRef[] = [{ id: "h1", name: "Khalid el Impávido" }];
const awayRoster: RosterPlayerRef[] = [{ id: "a1", name: "Grishnak Mordaz" }];

function line(overrides: Partial<ActaActionLine> = {}): ActaActionLine {
  return { id: "l1", rosterPlayerId: "h1", kind: "td", quantity: 1, ...overrides };
}

/** A valid casualty line: a causing player plus a victim. */
function casualty(id: string, rosterPlayerId: string): ActaActionLine {
  return line({
    id,
    rosterPlayerId,
    kind: "casualty",
    victimTeam: "away",
    victimRosterPlayerId: "a1",
  });
}

function draft(actions: ActaActionLine[]): ActaTeamDraft {
  return {
    neverHeld: false,
    inducements: 0,
    score: 0,
    mvpGrantee: "",
    actions,
    fanRoll: null,
    injuryRoll: [],
    permanentRoll: [],
  };
}

function renderAcciones(home: ActaTeamDraft) {
  const state: ActaState = { weather: "Perfecto", home, away: draft([]) };
  return render(
    <StepAcciones
      state={state}
      onChange={() => {}}
      homeName={homeName}
      awayName={awayName}
      homeRoster={homeRoster}
      awayRoster={awayRoster}
    />,
  );
}

/** Reads the two displayed counters out of a team region. */
function displayedCounters(region: HTMLElement) {
  const text = region.textContent ?? "";
  return {
    tds: Number(/Σ anotaciones\s*(\d+)/.exec(text)?.[1] ?? "NaN"),
    casualties: Number(/bajas causadas\s*(\d+)/.exec(text)?.[1] ?? "NaN"),
  };
}

/** The payload's own totals for one team's action lines. */
function payloadTotals(actions: ActaActionLine[]) {
  return aggregateActions(actions).reduce(
    (totals, row) => ({
      tds: totals.tds + row.tds,
      casualties: totals.casualties + row.casualties,
    }),
    { tds: 0, casualties: 0 },
  );
}

/**
 * Raw totals (5 tds / 2 casualties) exceed the payload totals (2 / 1) because
 * two lines name no player: the display must follow the payload, not the lines.
 */
const incomplete: ActaActionLine[] = [
  line({ id: "t1", quantity: 2 }),
  line({ id: "t2", rosterPlayerId: "", quantity: 3 }),
  casualty("c1", "h1"),
  casualty("c2", ""),
];

describe("StepAcciones — tally parity with the payload", () => {
  it("displays the aggregateActions totals, never the raw line totals", () => {
    renderAcciones(draft(incomplete));
    const home = screen.getByRole("region", { name: homeName });
    expect(displayedCounters(home)).toEqual(payloadTotals(incomplete));
    // Pins the exact values: the two player-less lines are not counted.
    expect(displayedCounters(home)).toEqual({ tds: 2, casualties: 1 });
  });

  it("hints at the dropped lines only when something is dropped", () => {
    const { unmount } = renderAcciones(draft(incomplete));
    expect(screen.getByRole("region", { name: homeName }).textContent).toMatch(/sin jugador/i);
    unmount();

    renderAcciones(draft([line({ id: "t1", quantity: 2 }), casualty("c1", "h1")]));
    const clean = screen.getByRole("region", { name: homeName });
    expect(clean.textContent).not.toMatch(/sin jugador/i);
    expect(displayedCounters(clean)).toEqual({ tds: 2, casualties: 1 });
  });
});
