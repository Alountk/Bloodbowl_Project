import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import type { RosterPlayerRef } from "../MatchResolveModal";
import {
  type ActaActionLine,
  type ActaState,
  type ActaTeamDraft,
} from "./actaState";
import { StepRevisar, validateActa } from "./StepRevisar";

/**
 * s4a (RAU-122) — Step 6 · Revisar (MAW-8). The step renders a readable summary
 * of the whole acta and the validation state. Saving is blocked unless
 * Σ anotaciones == marcador AND both teams have an MVP selected. Assertions use
 * textContent/regex — this repo has no jest-dom matchers.
 */

const homeName = "Águilas de Khemri";
const awayName = "Colmillos del Caos";

const homeRoster: RosterPlayerRef[] = [
  { id: "h1", name: "Khalid el Impávido" },
  { id: "h2", name: "Ushtep el Mensajero" },
];
const awayRoster: RosterPlayerRef[] = [
  { id: "a1", name: "Grishnak Mordaz" },
  { id: "a2", name: "Durburz Puño de Hierro" },
];

function draft(overrides: Partial<ActaTeamDraft> = {}): ActaTeamDraft {
  return {
    neverHeld: false,
    inducements: 0,
    score: 0,
    mvpGrantee: "",
    actions: [],
    fanRoll: null,
    injuryRoll: [],
    permanentRoll: [],
    ...overrides,
  };
}

function tdLine(id: string, rosterPlayerId: string, quantity: number): ActaActionLine {
  return { id, rosterPlayerId, kind: "td", quantity };
}

function casualtyLine(overrides: Partial<ActaActionLine> = {}): ActaActionLine {
  return {
    id: "c1",
    rosterPlayerId: "h1",
    kind: "casualty",
    quantity: 1,
    victimTeam: "away",
    victimRosterPlayerId: "a1",
    ...overrides,
  };
}

/**
 * A fully valid acta: home scores 2 (2 TD lines), away scores 0, both MVPs
 * selected, and one derived casualty carrying its 1D16 roll.
 */
function validState(): ActaState {
  return {
    weather: "Perfecto",
    duration: 90,
    home: draft({
      ff: 4,
      score: 2,
      mvpGrantee: "h1",
      actions: [tdLine("h", "h1", 2), casualtyLine()],
      injuryRoll: [9],
    }),
    away: draft({
      ff: 3,
      score: 0,
      neverHeld: true,
      mvpGrantee: "a1",
    }),
  };
}

function renderStep(state: ActaState) {
  return render(
    <StepRevisar
      state={state}
      homeName={homeName}
      awayName={awayName}
      homeRoster={homeRoster}
      awayRoster={awayRoster}
    />,
  );
}

describe("StepRevisar — validation (MAW-8)", () => {
  it("allows saving a valid acta: Σ anotaciones == marcador and both MVPs selected", () => {
    const state = validState();
    const result = validateActa(state, homeName, awayName);
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
    expect(result.homeTds).toBe(2);
    expect(result.awayTds).toBe(0);

    renderStep(state);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.getByText(/MVP completo/i)).toBeTruthy();
  });

  it("blocks saving when Σ anotaciones differs from the marcador", () => {
    const state = validState();
    state.home.score = 3;

    expect(validateActa(state, homeName, awayName).ok).toBe(false);
    renderStep(state);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/anotaciones/i);
    expect(alert.textContent).toContain(homeName);
  });

  it("blocks saving when a team has no MVP selected", () => {
    const state = validState();
    state.home.mvpGrantee = "";

    expect(validateActa(state, homeName, awayName).ok).toBe(false);
    renderStep(state);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/MVP/);
    expect(alert.textContent).toContain(homeName);
  });

  it("names every problem when the score and both MVPs are invalid", () => {
    const state = validState();
    state.home.score = 3;
    state.home.mvpGrantee = "";
    state.away.mvpGrantee = "";

    const result = validateActa(state, homeName, awayName);
    expect(result.errors).toHaveLength(3);
    renderStep(state);

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain(homeName);
    expect(alert.textContent).toContain(awayName);
  });
});

describe("StepRevisar — summary", () => {
  it("summarises the whole acta with casualties, rolls and the winnings preview", () => {
    renderStep(validState());

    const summary = screen.getByRole("region", { name: "Resumen del acta" });
    expect(summary.textContent).toContain("Perfecto");
    expect(summary.textContent).toContain("90 min");
    expect(summary.textContent).toContain(homeName);
    expect(summary.textContent).toContain(awayName);
    expect(summary.textContent).toContain("Khalid el Impávido");
    expect(summary.textContent).toContain("Grishnak Mordaz");
    expect(summary.textContent).toContain("1D16 9");
    expect(summary.textContent).toContain("Apaleado");
    expect(summary.textContent).toContain("★4 PE");
    expect(summary.textContent).toContain("55.000");
    expect(summary.textContent).toContain("45.000");
  });
});
