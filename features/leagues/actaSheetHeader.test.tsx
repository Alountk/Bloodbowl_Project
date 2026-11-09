import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import {
  ActaSheetHeader,
  bribesOf,
  casualtyTurnsOf,
  turnStateOf,
  type ActaSheetHeaderProps,
} from "./actaSheetHeader";
import type { LiveMatchEventDto, MatchDetail } from "./api";

/**
 * Acta en Vivo shell (MVA-1/MVA-2/MVA-3 turn-stepper half — T7 Slice A):
 * the top sections of `design/match-report-redesign/08-acta-en-vivo.html`,
 * data-bound. These tests pin the BINDING rules:
 *  - league name + round come from props (S5, "Liga Nuffle CRUAB") and are
 *    never hardcoded in the component (source pin),
 *  - the score line + "TURNO N EN JUEGO" badge reflect live state (MVA-2),
 *  - the T1-T8 stepper carries done / casualty-marked / active / upcoming
 *    states (MVA-3 stepper half),
 *  - the RR/bribes line binds team data and degrades to "—" when unknown.
 * Assertions are `.textContent`/regex (the repo has no jest-dom matchers).
 */

function baseProps(overrides: Partial<ActaSheetHeaderProps> = {}): ActaSheetHeaderProps {
  return {
    leagueName: "Liga Nuffle CRUAB",
    round: 4,
    status: "live",
    half: 1,
    turnNumber: 6,
    home: { name: "Reikland Reavers", score: 2, rerolls: 2, bribes: 0 },
    away: { name: "Gouged Eye", score: 1, rerolls: 3, bribes: 1 },
    weather: null,
    casualtyTurns: [],
    ...overrides,
  };
}

describe("ActaSheetHeader — data binding (MVA-1/MVA-2)", () => {
  it("status line: league name + round come from props (S5, 'Liga Nuffle CRUAB')", () => {
    render(<ActaSheetHeader {...baseProps()} />);

    const status = screen.getByTestId("ui-v2-match-status");
    expect(status.textContent).toMatch(/Liga Nuffle CRUAB/i);
    expect(status.textContent).toMatch(/Jornada 4/);
    // The "Oficial" status chip is part of the subheader row (artboard 08).
    expect(status.textContent).toContain("Oficial");
  });

  it("league name is NEVER hardcoded in the component source (MVA-1)", () => {
    const source = readFileSync(path.join(__dirname, "actaSheetHeader.tsx"), "utf8");
    expect(source).not.toMatch(/Nuffle/i);
    expect(source).not.toMatch(/Reikland|Gouged/i);
  });

  it("top bar: the score line binds both team names and the running score (MVA-2)", () => {
    render(<ActaSheetHeader {...baseProps()} />);

    const header = screen.getByTestId("ui-v2-match-header");
    expect(header.textContent).toMatch(/Reikland Reavers\s*2\s*-\s*1\s*Gouged Eye/);
  });

  it("turn badge: 'TURNO N EN JUEGO' only while the match is live (MVA-2)", () => {
    const { unmount } = render(<ActaSheetHeader {...baseProps()} />);
    expect(screen.getByTestId("ui-v2-match-stepper").textContent).toContain("TURNO 6 EN JUEGO");
    unmount();

    render(<ActaSheetHeader {...baseProps({ status: "finished" })} />);
    expect(screen.getByTestId("ui-v2-match-stepper").textContent).not.toContain("EN JUEGO");
  });

  it("teams line: RR and Soborno render per team from data", () => {
    render(<ActaSheetHeader {...baseProps()} />);

    const score = screen.getByTestId("ui-v2-match-score");
    expect(score.textContent).toMatch(/Reikland Reavers/);
    expect(score.textContent).toMatch(/RR: 2/);
    expect(score.textContent).toMatch(/Soborno: 0/);
    expect(score.textContent).toMatch(/RR: 3/);
    expect(score.textContent).toMatch(/Soborno: 1/);
  });

  it("teams line: unknown rerolls degrade to — (never invented data)", () => {
    render(
      <ActaSheetHeader
        {...baseProps({
          home: { name: "Reikland Reavers", score: 2, rerolls: null, bribes: 0 },
          away: { name: "Gouged Eye", score: 1, rerolls: null, bribes: 0 },
        })}
      />,
    );
    expect(screen.getByTestId("ui-v2-match-score").textContent).toMatch(/RR: —/);
  });

  it("weather line binds the rolled weather and shows the half label", () => {
    render(<ActaSheetHeader {...baseProps({ weather: "heat" })} />);
    expect(screen.getByTestId("ui-v2-match-status").textContent).toMatch(/1ª Mitad/);
    expect(screen.getByTestId("ui-v2-match-status").textContent).toMatch(/Calor asfixiante/);
  });
});

describe("ActaSheetHeader — turn stepper (MVA-3 half, artboard 08)", () => {
  it("renders T1-T8 with done / casualty-marked / active / upcoming states", () => {
    // GIVEN turns 1-4 done, turn 5 completed with a casualty, turn 6 active.
    const { container } = render(
      <ActaSheetHeader {...baseProps({ casualtyTurns: [5] })} />,
    );

    const chips = Array.from(container.querySelectorAll("li[data-turn]"));
    expect(chips.length).toBe(8);
    const states = chips.map((chip) => `${chip.getAttribute("data-turn")}:${chip.getAttribute("data-state")}`);
    expect(states).toEqual([
      "1:done",
      "2:done",
      "3:done",
      "4:done",
      "5:casualty",
      "6:active",
      "7:upcoming",
      "8:upcoming",
    ]);
    // Done chips carry the check glyph (artboard: done = ✓).
    expect(chips[0].querySelector("svg")).toBeTruthy();
    // The active chip carries the round label.
    expect(chips[5].textContent).toContain("T6");
  });

  it("pending match: every turn renders upcoming and the badge is absent", () => {
    const { container } = render(
      <ActaSheetHeader {...baseProps({ status: "pending", turnNumber: 1, casualtyTurns: [] })} />,
    );

    const states = Array.from(container.querySelectorAll("li[data-turn]")).map(
      (chip) => chip.getAttribute("data-state"),
    );
    expect(states.every((state) => state === "upcoming")).toBe(true);
    expect(screen.getByTestId("ui-v2-match-stepper").textContent).not.toContain("EN JUEGO");
  });

  it("turnStateOf boundaries (triangulate): finished turns count as done up to turnNumber", () => {
    expect(turnStateOf(6, "live", 6, [])).toBe("active");
    expect(turnStateOf(5, "live", 6, [5])).toBe("casualty");
    expect(turnStateOf(6, "finished", 6, [])).toBe("done");
    expect(turnStateOf(7, "finished", 6, [])).toBe("upcoming");
    expect(turnStateOf(1, "ready", 1, [])).toBe("upcoming");
    // Casualty marker only inside the played range, never on upcoming turns.
    expect(turnStateOf(8, "live", 6, [8])).toBe("upcoming");
  });
});

describe("acta helpers (pure)", () => {
  it("casualtyTurnsOf collects casualty turns of the CURRENT half only", () => {
    const events = [
      { seq: 1, kind: "casualty", side: "home", playerRosterId: null, half: 1, turnNumber: 5, payload: {}, at: 1 },
      { seq: 2, kind: "td", side: "away", playerRosterId: null, half: 1, turnNumber: 3, payload: {}, at: 2 },
      { seq: 3, kind: "casualty", side: "away", playerRosterId: null, half: 1, turnNumber: 5, payload: {}, at: 3 },
      { seq: 4, kind: "casualty", side: "home", playerRosterId: null, half: 2, turnNumber: 2, payload: {}, at: 4 },
    ] as LiveMatchEventDto[];

    expect(casualtyTurnsOf(events, 1)).toEqual([5]);
    expect(casualtyTurnsOf(events, 2)).toEqual([2]);
    expect(casualtyTurnsOf([], 1)).toEqual([]);
  });

  it("bribesOf reads the live inducement cart, then the result snapshot, else 0", () => {
    const withCart = {
      live: {
        inducements: {
          home: [{ id: "bribes", count: 2 }],
          away: [],
        },
      },
      result: null,
    } as unknown as Pick<MatchDetail, "live" | "result">;
    expect(bribesOf(withCart, "home")).toBe(2);
    expect(bribesOf(withCart, "away")).toBe(0);

    const withResult = {
      live: null,
      result: {
        scores: {
          home: { inducements: { budget: 0, cards: [{ name: "Sobornos", count: 1 }] } },
          away: { inducements: null },
        },
      },
    } as unknown as Pick<MatchDetail, "live" | "result">;
    expect(bribesOf(withResult, "home")).toBe(1);
    expect(bribesOf(withResult, "away")).toBe(0);
  });
});
