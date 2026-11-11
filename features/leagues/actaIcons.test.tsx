import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { ActaTurnTimeline } from "./actaTurnTimeline";
import { ActaSheetHeader } from "./actaSheetHeader";
import { LiveActionDock } from "./liveActionDock";
import { BASE, MIN, awayTeam, homeTeam, narrativeEvents } from "./actaFlow.fixtures";

/**
 * Icon box-sizing contract for the acta surfaces. An inline
 * `<svg viewBox="0 0 960 960">` with no intrinsic size defaults to 100% of its
 * container: a call site relying on `text-*` (font-size does not size an svg
 * box) turns the event rows into giant squares and squeezes the row text to
 * 0px wide — observed in the Storybook flow stories. Every rendered ActaIcon
 * must carry explicit box sizing (`size-*` / `h-* w-*`).
 */

const SIZED = /\b(size-\d|size-\[|h-\d|w-\d)/;

function expectIconsSized(container: HTMLElement) {
  const svgs = Array.from(container.querySelectorAll("svg"));
  expect(svgs.length).toBeGreaterThan(0);
  for (const svg of svgs) {
    expect(svg.getAttribute("class") ?? "").toMatch(SIZED);
  }
}

describe("acta icon box sizing", () => {
  it("sizes every icon in the turn timeline rows", () => {
    const { container } = render(
      <ActaTurnTimeline
        events={narrativeEvents}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        startedAt={BASE}
        now={BASE + 58 * MIN}
        active={{ status: "live", half: 2, turnNumber: 3, activeSide: "away" }}
        viewerSide="home"
      />,
    );
    expectIconsSized(container);
  });

  it("sizes every icon in the sheet header", () => {
    const { container } = render(
      <ActaSheetHeader
        leagueName="Liga de Ejemplo"
        round={3}
        status="live"
        half={2}
        turnNumber={5}
        home={{ name: "Águilas de Khemri", score: 2, rerolls: 3, bribes: 1 }}
        away={{ name: "Colmillos del Caos", score: 1, rerolls: 2, bribes: 0 }}
        weather="sun"
        casualtyTurns={[2, 4]}
      />,
    );
    expectIconsSized(container);
  });

  it("sizes every icon in the acta quick-capture dock tiles", () => {
    const { container } = render(
      <LiveActionDock
        variant="acta"
        viewerSide="home"
        activeSide="away"
        status="live"
        roster={homeTeam.players}
        opponentRoster={awayTeam.players}
        rosterRaceId={homeTeam.raceId}
        opponentRaceId={awayTeam.raceId}
        onSubmit={async () => undefined}
      />,
    );
    expectIconsSized(container);
  });
});
