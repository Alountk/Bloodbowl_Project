import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { computeWinnings } from "@/lib/rules/winnings";
import {
  buildActaPayload,
  type ActaActionLine,
  type ActaState,
  type ActaTeamDraft,
} from "./actaState";
import { StepFinal } from "./StepFinal";

/**
 * s3c (RAU-122) — Step 5 · Final (MAW-7). The winnings are a READ-ONLY client
 * PREVIEW computed with the SAME pure `computeWinnings` the server runs; the
 * client never transmits an amount (no winnings field in the payload). The ONLY
 * manual input is the fan-factor 1D6 per team, which rides `buildActaPayload` as
 * `fanRoll`. Assertions use textContent/regex — this repo has no jest-dom matchers.
 */

const homeName = "Águilas de Khemri";
const awayName = "Colmillos del Caos";

const homeFf = 4;
const awayFf = 3;

function tdLine(id: string, rosterPlayerId: string, quantity: number): ActaActionLine {
  return { id, rosterPlayerId, kind: "td", quantity };
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

/** Home scores 3 TDs (held the ball); away scores 1 and never held the ball. */
function knownState(awayNeverHeld = true): ActaState {
  return {
    weather: "Perfecto",
    home: draft({ ff: homeFf, score: 3, actions: [tdLine("h", "h1", 3)] }),
    away: draft({
      ff: awayFf,
      score: 1,
      neverHeld: awayNeverHeld,
      actions: [tdLine("a", "a1", 1)],
    }),
  };
}

function Harness({ initial }: { initial: ActaState }) {
  const [state, setState] = useState(initial);
  return (
    <>
      <StepFinal
        state={state}
        onChange={setState}
        homeName={homeName}
        awayName={awayName}
      />
      <output data-testid="payload">{JSON.stringify(buildActaPayload(state))}</output>
    </>
  );
}

/** Spanish thousands grouping, matching the component's deterministic format. */
function expectedGold(amount: number): string {
  return `${amount.toString().replace(/\B(?=(\d{3})+(?!\d))/g, ".")} M.O.`;
}

function payload(): {
  home: { fanRoll: number | null };
  away: { fanRoll: number | null };
} {
  return JSON.parse(screen.getByTestId("payload").textContent ?? "{}");
}

const fanLabel = (name: string) => `Afición · tirada 1D6 · ${name}`;

describe("StepFinal — read-only winnings preview (MAW-7)", () => {
  it("renders the breakdown and total matching computeWinnings for a known input", () => {
    render(<Harness initial={knownState()} />);

    const home = screen.getByRole("region", { name: homeName });
    const away = screen.getByRole("region", { name: awayName });

    const homeTotal = computeWinnings({
      ffHome: homeFf,
      ffAway: awayFf,
      ownTds: 3,
      heldBall: true,
    });
    const awayTotal = computeWinnings({
      ffHome: homeFf,
      ffAway: awayFf,
      ownTds: 1,
      heldBall: false,
    });
    expect(homeTotal).toBe(65_000);
    expect(awayTotal).toBe(55_000);

    // The visible total is the SAME value the pure function returns.
    expect(home.textContent).toContain(expectedGold(homeTotal));
    expect(away.textContent).toContain(expectedGold(awayTotal));

    // The breakdown components are visible: the (FF_home + FF_away)/2 term,
    // the team's own TDs and the never-held-ball bonus.
    expect(within(home).getByText(/Anotaciones/)).toBeTruthy();
    expect(home.textContent).toContain("3,5");
    expect(home.textContent).toContain("+0");
    expect(away.textContent).toContain("+1");
    expect(home.textContent).toContain("Ganancias");
  });

  it("has no editable winnings amount — the fan 1D6 is the only input", () => {
    render(<Harness initial={knownState()} />);
    // Exactly the two fan-factor roll inputs, nothing else.
    expect(screen.getAllByRole("spinbutton")).toHaveLength(2);
    expect(screen.queryByLabelText(/ganancias/i)).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    // Both amounts are marked read-only ("auto"): one chip per team section each.
    expect(screen.getAllByText("auto")).toHaveLength(4);
  });

  it("honours heldBall = !neverHeld in the preview", () => {
    const { unmount } = render(<Harness initial={knownState(true)} />);
    const withBonus = screen.getByRole("region", { name: awayName });
    expect(withBonus.textContent).toContain(
      expectedGold(
        computeWinnings({ ffHome: homeFf, ffAway: awayFf, ownTds: 1, heldBall: false }),
      ),
    );
    expect(withBonus.textContent).toContain("+1");
    unmount();

    render(<Harness initial={knownState(false)} />);
    const noBonus = screen.getByRole("region", { name: awayName });
    expect(noBonus.textContent).toContain(
      expectedGold(
        computeWinnings({ ffHome: homeFf, ffAway: awayFf, ownTds: 1, heldBall: true }),
      ),
    );
    expect(noBonus.textContent).toContain("+0");
  });
});

describe("StepFinal — fan-factor roll", () => {
  it("captures the 1D6 roll per team and emits it as fanRoll", () => {
    render(<Harness initial={knownState()} />);
    fireEvent.change(screen.getByLabelText(fanLabel(homeName)), { target: { value: "4" } });
    fireEvent.change(screen.getByLabelText(fanLabel(awayName)), { target: { value: "5" } });
    expect(payload().home.fanRoll).toBe(4);
    expect(payload().away.fanRoll).toBe(5);
  });

  it("clears an out-of-range roll instead of recording it", () => {
    render(<Harness initial={knownState()} />);
    const home = screen.getByLabelText(fanLabel(homeName)) as HTMLInputElement;
    fireEvent.change(home, { target: { value: "7" } });
    expect(home.value).toBe("");
    expect(payload().home.fanRoll).toBeNull();
  });
});
