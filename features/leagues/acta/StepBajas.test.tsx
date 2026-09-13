import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { RosterPlayerRef } from "../MatchResolveModal";
import type { MatchScoreboard, ResultPlayerAction } from "../api";
import {
  actaPrefill,
  buildActaPayload,
  type ActaActionLine,
  type ActaState,
  type ActaTeamDraft,
} from "./actaState";
import { StepBajas } from "./StepBajas";

/**
 * s3b (RAU-122) — Step 4 · Bajas (MAW-6). The casualties are DERIVED from Step 2
 * and shown READ-ONLY; the only manual inputs are the 1D16 injury roll and, for a
 * Permanente band, the extra 1D6. Rolls MUST be written to the CAUSING team's
 * draft — the whole point of `bajasPlan`. Assertions use textContent/regex — this
 * repo has no jest-dom matchers.
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

function casualtyLine(overrides: Partial<ActaActionLine> = {}): ActaActionLine {
  return {
    id: "l1",
    rosterPlayerId: "h1",
    kind: "casualty",
    quantity: 1,
    victimTeam: "away",
    victimRosterPlayerId: "a1",
    ...overrides,
  };
}

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

function state(overrides: Partial<ActaState> = {}): ActaState {
  return { weather: "Perfecto", home: draft(), away: draft(), ...overrides };
}

/** One side of a persisted `MatchResult.scores` snapshot. */
function scoreboardSide(
  overrides: Partial<MatchScoreboard["home"]> = {},
): MatchScoreboard["home"] {
  return { score: 0, casualties: [], pe: [], ...overrides };
}

/** One aggregated per-player action row as the snapshot stores it. */
function actionRow(overrides: Partial<ResultPlayerAction> = {}): ResultPlayerAction {
  return {
    rosterPlayerId: "p1",
    tds: 0,
    casualties: 0,
    completions: 0,
    interceptions: 0,
    fouls: 0,
    throwTeamMates: 0,
    landedSafe: 0,
    ...overrides,
  };
}

/** Both teams cause one casualty each (victim's team differs from causing team). */
function crossCasualties(): ActaState {
  return state({
    home: draft({
      actions: [casualtyLine({ id: "h", victimTeam: "away", victimRosterPlayerId: "a1" })],
    }),
    away: draft({
      actions: [
        casualtyLine({
          id: "a",
          rosterPlayerId: "a1",
          victimTeam: "home",
          victimRosterPlayerId: "h2",
        }),
      ],
    }),
  });
}

/**
 * The adversarial two-casualty case: home causes TWO casualties (a1, a2) and away
 * causes one (h2), so home's roll list has a NON-TRAILING slot 1 — a hole at
 * index 0 can only be trimmed by the client if the payload is positional.
 */
function homeTwoAwayOne(): ActaState {
  return state({
    home: draft({
      actions: [
        casualtyLine({ id: "h1", victimTeam: "away", victimRosterPlayerId: "a1" }),
        casualtyLine({ id: "h2", victimTeam: "away", victimRosterPlayerId: "a2" }),
      ],
    }),
    away: draft({
      actions: [
        casualtyLine({
          id: "a1",
          rosterPlayerId: "a1",
          victimTeam: "home",
          victimRosterPlayerId: "h2",
        }),
      ],
    }),
  });
}

function Harness({ initial }: { initial: ActaState }) {
  const [stateValue, setState] = useState(initial);
  return (
    <>
      <StepBajas
        state={stateValue}
        onChange={setState}
        homeName={homeName}
        awayName={awayName}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
      />
      <output data-testid="payload">{JSON.stringify(buildActaPayload(stateValue))}</output>
    </>
  );
}

interface PayloadSide {
  injuryRoll: (number | null)[];
  permanentRoll: (number | null)[];
  casualties: { team: "home" | "away"; rosterPlayerId: string }[];
}

function payload(): { home: PayloadSide; away: PayloadSide } {
  return JSON.parse(screen.getByTestId("payload").textContent ?? "{}") as {
    home: PayloadSide;
    away: PayloadSide;
  };
}

const injuryLabel = (slot: number, victim: string) => `Tirada 1D16 ${slot} · ${victim}`;
const permanentLabel = (slot: number, victim: string) => `Tirada 1D6 ${slot} · ${victim}`;

describe("StepBajas — derived read-only list", () => {
  it("lists each casualty under the team that CAUSED it, with the victim read-only", () => {
    render(<Harness initial={crossCasualties()} />);

    const home = screen.getByRole("region", { name: homeName });
    const away = screen.getByRole("region", { name: awayName });
    // Home caused the away victim; away caused the home victim.
    expect(home.textContent).toContain("Grishnak Mordaz");
    expect(away.textContent).toContain("Ushtep el Mensajero");
    // No re-entry: no victim/action pickers, only numeric roll inputs.
    expect(screen.queryAllByRole("combobox")).toHaveLength(0);
    expect(screen.queryByRole("button", { name: /añadir/i })).toBeNull();
    expect(screen.getByText(/derivadas del paso 2/i)).toBeTruthy();
  });

  it("shows the permanent 1D6 input ONLY for a Permanente band", () => {
    render(
      <Harness
        initial={state({
          home: draft({ actions: [casualtyLine()] }),
        })}
      />,
    );

    const roll16 = screen.getByLabelText(injuryLabel(1, "Grishnak Mordaz"));
    fireEvent.change(roll16, { target: { value: "9" } });
    expect(screen.getByText("Apaleado")).toBeTruthy();
    expect(screen.queryByLabelText(permanentLabel(1, "Grishnak Mordaz"))).toBeNull();

    fireEvent.change(roll16, { target: { value: "13" } });
    expect(screen.getByText("Permanente")).toBeTruthy();
    expect(screen.getByLabelText(permanentLabel(1, "Grishnak Mordaz"))).toBeTruthy();
  });
});

describe("StepBajas — roll binding", () => {
  it("writes each 1D16 to the CAUSING team's draft, never the victim's", () => {
    render(<Harness initial={crossCasualties()} />);

    fireEvent.change(screen.getByLabelText(injuryLabel(1, "Grishnak Mordaz")), {
      target: { value: "9" },
    });
    fireEvent.change(screen.getByLabelText(injuryLabel(1, "Ushtep el Mensajero")), {
      target: { value: "14" },
    });

    const p = payload();
    // Home caused the a1 casualty → the roll lands on `home`, not on `away`.
    expect(p.home.injuryRoll[0]).toBe(9);
    expect(p.away.injuryRoll[0]).toBe(14);
    // Each side's roll array is exactly the one casualty it caused.
    expect(p.home.injuryRoll).toHaveLength(1);
    expect(p.away.injuryRoll).toHaveLength(1);
    // The victims keep their own teams in the payload.
    expect(p.home.casualties).toEqual([{ team: "away", rosterPlayerId: "a1" }]);
    expect(p.away.casualties).toEqual([{ team: "home", rosterPlayerId: "h2" }]);
  });

  it("keeps a later casualty's roll at its own index when an earlier one is left unset", () => {
    render(<Harness initial={homeTwoAwayOne()} />);

    // Fill ONLY the SECOND home casualty (slot 2 · Durburz Puño de Hierro). The
    // wire payload must be [null, 13], never [13]: a hole at a non-trailing index
    // keeps the value on its own victim instead of shifting it down.
    fireEvent.change(screen.getByLabelText(injuryLabel(2, "Durburz Puño de Hierro")), {
      target: { value: "13" },
    });

    const p = payload();
    expect(p.home.injuryRoll[1]).toBe(13);
    // Index 0 stays a hole (null on the wire) — the 13 did NOT migrate onto a1.
    expect(p.home.injuryRoll[0] == null).toBe(true);
    // The first casualty's input is still empty; the value did not shift onto it.
    expect(
      (screen.getByLabelText(injuryLabel(1, "Grishnak Mordaz")) as HTMLInputElement).value,
    ).toBe("");
    // The away side (one casualty) is untouched by home's partial entry.
    expect(p.away.injuryRoll).toEqual([]);
  });

  it("writes the permanent 1D6 to the CAUSING team's draft", () => {
    render(
      <Harness
        initial={state({
          home: draft({ actions: [casualtyLine()] }),
        })}
      />,
    );

    fireEvent.change(screen.getByLabelText(injuryLabel(1, "Grishnak Mordaz")), {
      target: { value: "13" },
    });
    fireEvent.change(screen.getByLabelText(permanentLabel(1, "Grishnak Mordaz")), {
      target: { value: "6" },
    });

    const p = payload();
    expect(p.home.permanentRoll[0]).toBe(6);
    expect(p.home.injuryRoll[0]).toBe(13);
    expect(p.away.permanentRoll).toEqual([]);
  });

  it("ignores out-of-range roll input instead of recording a false 0", () => {
    render(
      <Harness
        initial={state({
          home: draft({ actions: [casualtyLine()] }),
        })}
      />,
    );

    const roll16 = screen.getByLabelText(injuryLabel(1, "Grishnak Mordaz"));
    fireEvent.change(roll16, { target: { value: "17" } });
    expect((roll16 as HTMLInputElement).value).toBe("");
    expect(payload().home.injuryRoll).toEqual([]);
  });
});

describe("StepBajas — sections", () => {
  it("shows an empty state for a team that caused no casualties", () => {
    render(<Harness initial={state({ home: draft({ actions: [casualtyLine()] }) })} />);
    const away = screen.getByRole("region", { name: awayName });
    expect(within(away).getByText(/sin bajas causadas/i)).toBeTruthy();
  });
});

describe("StepBajas — legacy-casualties warning (s6a corrective)", () => {
  it("warns that a legacy acta has no stored actions and that saving clears the casualties", () => {
    // FIX-B: the persisted victims exist, but the snapshot has no `actions` to
    // attribute them to, so the derived list is empty. The warning is
    // informational (role="status") and MUST NOT block the save.
    const legacy = actaPrefill({
      home: scoreboardSide({
        casualties: [
          { team: "away", rosterPlayerId: "a1", outcome: { kind: "dead" } },
        ],
      }),
      away: scoreboardSide(),
      winnerId: null,
    });
    render(<Harness initial={legacy} />);

    const warning = screen.getByRole("alert");
    expect(warning.textContent).toMatch(/acciones guardadas/i);
    expect(warning.textContent).toMatch(/borrarán las bajas/i);
  });

  it("does not warn for a normal extended acta whose actions attribute the casualties", () => {
    const extended = actaPrefill({
      home: scoreboardSide({
        actions: [actionRow({ rosterPlayerId: "h1", casualties: 1 })],
      }),
      away: scoreboardSide({
        casualties: [
          { team: "away", rosterPlayerId: "a2", outcome: { kind: "permanent" } },
        ],
      }),
      winnerId: null,
    });
    render(<Harness initial={extended} />);

    expect(screen.queryByRole("alert")).toBeNull();
  });
});
