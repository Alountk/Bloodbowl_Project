import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ActaSheetHeader, type ActaSheetHeaderProps } from "./actaSheetHeader";
import { ActaTurnTimeline } from "./actaTurnTimeline";
import { LiveActionDock } from "./liveActionDock";
import type { LiveCommand, LiveMatchEventDto, MatchPlayer, MatchTeamDetail } from "./api";

/**
 * Acta en Vivo motion layer (T10 Slice D — `openspec/changes/match-live-acta`,
 * MVA-6 "Motion Layer with Reduced-Motion Fallback"): the keyframes of
 * `design/match-report-redesign/09-acta-en-vivo-animada.html` applied to the
 * V2 Acta surface ONLY, decorative (no behavior, no layout, no animation-event
 * coupling). jsdom runs no keyframes and cascades no media queries, so these
 * tests pin the STRUCTURE honestly:
 *  - the six `@keyframes acta-*` + `.acta-motion-*` classes live in
 *    `app/globals.css` with the artboard's EXACT durations/delays/easings,
 *  - `@media (prefers-reduced-motion: reduce)` neutralizes every one of them
 *    (no transform/opacity animation — a static sheet),
 *  - the classes are applied on the Acta components' elements (card entry,
 *    just-arrived row flash, pending callout pulse, dice shake, turn-badge
 *    pulse, floating +SPP feedback),
 *  - V1 carries none of them (source pin + legacy dock DOM).
 * Assertions are `.textContent`/regex (the repo has no jest-dom matchers) and
 * nothing here waits on animation frames or timers.
 */

// --- Fixtures -------------------------------------------------------------

const STARTED = 1_000_000;
const MIN = 60_000;

function player(id: string, name: string, positionalKey: string): MatchPlayer {
  return {
    rosterPlayerId: id,
    name,
    positionalKey,
    pe: 0,
    skills: {},
    injuries: {},
    alive: true,
    missNextMatch: false,
    valueBonus: 0,
  };
}

const homeTeam: MatchTeamDetail = {
  id: "t1",
  name: "Reikland Reavers",
  raceId: "human",
  user: null,
  players: [
    player("h1", "Brunhilda Eisenfaust", "blitzer"),
    player("h3", "Grashnak Viletooth", "blitzer"),
  ],
};

const awayTeam: MatchTeamDetail = {
  id: "t2",
  name: "Gouged Eye",
  raceId: "orc",
  user: null,
  players: [player("a1", 'Morg "El Picador"', "blitzer"), player("a2", "Ugluk", "lineman")],
};

function event(
  seq: number,
  overrides: Partial<LiveMatchEventDto> & Pick<LiveMatchEventDto, "kind">,
): LiveMatchEventDto {
  return {
    seq,
    side: null,
    playerRosterId: null,
    half: 1,
    turnNumber: 6,
    payload: {},
    at: STARTED + 52 * MIN,
    ...overrides,
  };
}

/** A display event on the ACTIVE turn (live card → full EventRow). */
function tdEvent(): LiveMatchEventDto {
  return event(1, { kind: "td", side: "away", playerRosterId: "a1" });
}

function completionEvent(): LiveMatchEventDto {
  return event(2, { kind: "completion", side: "away", playerRosterId: "a1" });
}

/** A CAUSED casualty whose 1D16 is still pending (MVA-4 callout). */
function pendingCasualty(): LiveMatchEventDto {
  return event(1, {
    kind: "casualty",
    side: "away",
    playerRosterId: "a2",
    turnNumber: 5,
    at: STARTED + 44 * MIN,
    payload: { victimRosterId: "a2", causerRosterId: "h3", cause: "block" },
  });
}

type TimelineProps = Omit<Parameters<typeof ActaTurnTimeline>[0], "homeTeam" | "awayTeam">;

function timelineProps(overrides: Partial<TimelineProps> = {}): TimelineProps {
  return {
    events: [tdEvent()],
    startedAt: STARTED,
    now: STARTED + 53 * MIN,
    active: { status: "live", half: 1, turnNumber: 6, activeSide: "home" },
    viewerSide: "home",
    ...overrides,
  };
}

function renderTimeline(overrides: Partial<TimelineProps> = {}) {
  return render(
    <ActaTurnTimeline {...timelineProps(overrides)} homeTeam={homeTeam} awayTeam={awayTeam} />,
  );
}

function headerProps(overrides: Partial<ActaSheetHeaderProps> = {}): ActaSheetHeaderProps {
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

// --- Dock fixtures (same shape as liveActionDock.test.tsx) ----------------

type MockControl = (cmd: LiveCommand) => Promise<void>;

function rosterPlayer(
  seed: Partial<Omit<MatchPlayer, "rosterPlayerId">> & { id: string },
): MatchPlayer {
  return {
    rosterPlayerId: seed.id,
    name: seed.name ?? "Unnamed",
    positionalKey: seed.positionalKey ?? "lineman",
    pe: seed.pe ?? 0,
    skills: seed.skills ?? [],
    injuries: seed.injuries ?? [],
    alive: seed.alive ?? true,
    missNextMatch: seed.missNextMatch ?? false,
    valueBonus: seed.valueBonus ?? 0,
    journeyman: seed.journeyman,
  };
}

const homeRoster = [
  rosterPlayer({ id: "p1", name: "Aric", positionalKey: "blitzer" }),
  rosterPlayer({ id: "p2", name: "Bram", positionalKey: "thrower" }),
];

const awayOpponent = [rosterPlayer({ id: "o1", name: "Vrok", positionalKey: "blitzer" })];

function renderDock(props: Partial<Parameters<typeof LiveActionDock>[0]> = {}) {
  const onSubmit = vi.fn<MockControl>(async () => {});
  const utils = render(
    <LiveActionDock
      viewerSide="home"
      activeSide="home"
      status="live"
      roster={homeRoster}
      opponentRoster={awayOpponent}
      rosterRaceId="human"
      opponentRaceId="human"
      onSubmit={onSubmit}
      {...props}
    />,
  );
  return { onSubmit, ...utils };
}

const renderActaDock = (props: Partial<Parameters<typeof LiveActionDock>[0]> = {}) =>
  renderDock({ ...props, variant: "acta" });
const actaDock = () => screen.getByTestId("acta-capture-dock");
const actaAction = (name: string | RegExp) => within(actaDock()).getByRole("button", { name });
const actaPool = (id: "own" | "rival") => within(actaDock()).getByTestId(`dock-pool-${id}`);

// --- A. app/globals.css — the motion stylesheet (MVA-6) -------------------

const css = readFileSync(path.join(__dirname, "..", "..", "app", "globals.css"), "utf8");

/** The declarations of one `.acta-motion-*` rule, whitespace-collapsed. */
function motionRule(name: string): string {
  const match = css.match(new RegExp(`\\.${name}\\s*\\{([^}]*)\\}`));
  expect(match, `.${name} rule missing from app/globals.css`).toBeTruthy();
  return match![1].replace(/\s+/g, " ").trim();
}

const MOTION_CLASSES = [
  "acta-motion-fade-in-up",
  "acta-motion-pulse-glow",
  "acta-motion-pulse-badge",
  "acta-motion-dice-shake",
  "acta-motion-row-flash",
  "acta-motion-float-feedback",
] as const;

describe("A. app/globals.css — artboard 09 keyframes with exact timings (MVA-6)", () => {
  it("defines the six namespaced @keyframes with the artboard's transform/opacity bodies", () => {
    for (const name of [
      "acta-fadeInUp",
      "acta-pulseGlow",
      "acta-badgePulse",
      "acta-diceShake",
      "acta-rowHighlightFlash",
      "acta-floatUpFade",
    ]) {
      expect(css, `@keyframes ${name} missing`).toMatch(new RegExp(`@keyframes ${name}\\s*\\{`));
    }
    // Signature frames (artboard values verbatim).
    expect(css).toMatch(/@keyframes acta-fadeInUp\s*\{[\s\S]*?translateY\(14px\)/);
    expect(css).toMatch(/@keyframes acta-pulseGlow\s*\{[\s\S]*?rgba\(209,\s*25,\s*56,\s*0\.4\)/);
    expect(css).toMatch(/@keyframes acta-badgePulse\s*\{[\s\S]*?scale\(1\.02\)/);
    expect(css).toMatch(/@keyframes acta-diceShake\s*\{[\s\S]*?rotate\(-22deg\)/);
    expect(css).toMatch(/@keyframes acta-rowHighlightFlash\s*\{[\s\S]*?brightness\(1\.25\)/);
    expect(css).toMatch(/@keyframes acta-floatUpFade\s*\{[\s\S]*?translate\(-50%,\s*-34px\)/);
  });

  it("card entry: fadeInUp 0.42s cubic-bezier(0.16, 1, 0.3, 1) both + the 5 stagger delays", () => {
    expect(motionRule("acta-motion-fade-in-up")).toContain(
      "animation: acta-fadeInUp 0.42s cubic-bezier(0.16, 1, 0.3, 1) both;",
    );
    for (const [n, delay] of [
      [1, "0.05s"],
      [2, "0.12s"],
      [3, "0.19s"],
      [4, "0.26s"],
      [5, "0.33s"],
    ] as const) {
      expect(motionRule(`acta-motion-stagger-${n}`)).toContain(`animation-delay: ${delay};`);
    }
  });

  it("callout pulse / badge pulse / dice shake carry the artboard's exact durations + easings", () => {
    expect(motionRule("acta-motion-pulse-glow")).toContain(
      "animation: acta-pulseGlow 2s infinite cubic-bezier(0.4, 0, 0.6, 1);",
    );
    expect(motionRule("acta-motion-pulse-badge")).toContain(
      "animation: acta-badgePulse 2.4s infinite ease-in-out;",
    );
    expect(motionRule("acta-motion-dice-shake")).toContain(
      "animation: acta-diceShake 0.45s ease-in-out infinite;",
    );
  });

  it("row flash / float feedback carry the artboard's exact durations + easings", () => {
    expect(motionRule("acta-motion-row-flash")).toContain(
      "animation: acta-rowHighlightFlash 0.6s cubic-bezier(0.16, 1, 0.3, 1) forwards;",
    );
    expect(motionRule("acta-motion-float-feedback")).toContain(
      "animation: acta-floatUpFade 0.75s ease-out forwards;",
    );
    // The float is anchored on its button exactly like artboard 09.
    expect(motionRule("acta-motion-float-feedback")).toContain("pointer-events: none;");
  });

  it("MVA-6: prefers-reduced-motion: reduce neutralizes EVERY motion class (static sheet)", () => {
    const at = css.indexOf("@media (prefers-reduced-motion: reduce)");
    expect(at, "no prefers-reduced-motion: reduce block").toBeGreaterThan(-1);
    const block = css.slice(at);
    for (const name of MOTION_CLASSES) {
      expect(block, `.${name} not neutralized under reduced motion`).toContain(`.${name}`);
    }
    // Each class resolves to NO animation at all (no transform/opacity motion).
    for (const name of MOTION_CLASSES) {
      expect(block.match(new RegExp(`\\.${name}[\\s\\S]*?animation: none`)), `.${name}`).toBeTruthy();
    }
    expect(block).not.toMatch(/animation:\s*acta-/);
    // The transient float badge has no non-animated life: it is dropped whole.
    expect(block).toMatch(/\.acta-motion-float-feedback\s*\{[^}]*display: none/);
  });
});

// --- B. Motion classes on the V2 Acta components --------------------------

describe("B. Acta surface — the six keyframes land on their sheet elements", () => {
  it("badgePulse: the 'TURNO N EN JUEGO' badge carries .acta-motion-pulse-badge", () => {
    render(<ActaSheetHeader {...headerProps()} />);
    const badge = document.querySelector(".acta-motion-pulse-badge") as HTMLElement | null;
    expect(badge).toBeTruthy();
    expect(badge!.textContent).toMatch(/TURNO 6 EN JUEGO/);
  });

  it("fadeInUp: every turn card carries .acta-motion-fade-in-up + a stagger delay", () => {
    renderTimeline();
    const cards = screen.getAllByTestId("acta-turn-card");
    expect(cards.length).toBeGreaterThan(0);
    for (const card of cards) {
      expect(card.className).toContain("acta-motion-fade-in-up");
      expect(card.className).toMatch(/acta-motion-stagger-[1-5]/);
    }
  });

  it("rowHighlightFlash: ONLY the just-arrived event row carries .acta-motion-row-flash", () => {
    const first = [tdEvent()];
    const { rerender } = renderTimeline({ events: first });
    let rows = screen.getAllByTestId("acta-event-row");
    expect(rows).toHaveLength(1);
    expect(rows[0].className).not.toContain("acta-motion-row-flash");

    rerender(
      <ActaTurnTimeline
        {...timelineProps({ events: [...first, completionEvent()] })}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />,
    );
    rows = screen.getAllByTestId("acta-event-row");
    expect(rows).toHaveLength(2);
    expect(rows[0].className).not.toContain("acta-motion-row-flash");
    expect(rows[1].className).toContain("acta-motion-row-flash");
  });

  it("TRIANGULATE rowHighlightFlash: a poll that adds nothing never flashes (no animation churn)", () => {
    const events = [tdEvent(), completionEvent()];
    const { rerender } = renderTimeline({ events });
    const flashed = () =>
      screen
        .getAllByTestId("acta-event-row")
        .some((row) => row.className.includes("acta-motion-row-flash"));
    expect(flashed()).toBe(false);
    // Same content, new array identity (a poll) — still nothing flashes.
    rerender(
      <ActaTurnTimeline
        {...timelineProps({ events: [...events] })}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />,
    );
    expect(flashed()).toBe(false);
  });

  it("pulseGlow: the pending injury-roll callout carries .acta-motion-pulse-glow", () => {
    renderTimeline({ events: [pendingCasualty()], viewerSide: "home" });
    const callout = screen.getByTestId("acta-injury-callout");
    expect(callout.className).toContain("acta-motion-pulse-glow");
  });

  it("diceShake: the dice icon shakes only while the injury roll picker is open", () => {
    renderTimeline({
      events: [pendingCasualty()],
      viewerSide: "home",
      onSubmit: vi.fn(async () => {}),
    });
    const button = screen.getByTestId("acta-injury-roll");
    expect(button.querySelector("svg")!.getAttribute("class")).not.toContain(
      "acta-motion-dice-shake",
    );
    fireEvent.click(button);
    expect(screen.getByTestId("acta-injury-roll").querySelector("svg")!.getAttribute("class")).toContain(
      "acta-motion-dice-shake",
    );
  });

  it("floatUpFade: a fired TD capture floats '+3 SPP (TD)' from the tapped dock button", async () => {
    const { onSubmit } = renderActaDock();
    fireEvent.click(actaAction("+ TD"));
    fireEvent.click(within(actaPool("own")).getByRole("button", { name: /#1/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const float = document.querySelector(".acta-motion-float-feedback") as HTMLElement | null;
    expect(float).toBeTruthy();
    expect(float!.textContent).toContain("+3 SPP (TD)");
    expect(float!.closest("button")).toBe(actaAction("+ TD"));
  });

  it("TRIANGULATE floatUpFade: Fin Turno floats the red 'Cambio de Turno' feedback", async () => {
    const { onSubmit } = renderActaDock();
    fireEvent.click(actaAction("Fin Turno"));
    fireEvent.click(within(screen.getByTestId("live-action-modal")).getByRole("button", { name: /Voluntario/ }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const float = document.querySelector(".acta-motion-float-feedback") as HTMLElement | null;
    expect(float).toBeTruthy();
    expect(float!.textContent).toContain("Cambio de Turno");
    expect(float!.className).toMatch(/\bbg-red\b/);
    expect(float!.closest("button")).toBe(actaAction("Fin Turno"));
  });
});

// --- C. V1 untouched ------------------------------------------------------

describe("C. V1 — none of the motion layer leaks outside the V2 Acta surface", () => {
  it("source pin: only the three V2 Acta surface files reference .acta-motion-*", () => {
    const files = readdirSync(__dirname)
      .filter((file) => file.endsWith(".tsx") && !file.includes(".test.") && !file.includes(".stories."))
      .filter((file) => readFileSync(path.join(__dirname, file), "utf8").includes("acta-motion-"))
      .sort();
    expect(files).toEqual(["actaSheetHeader.tsx", "actaTurnTimeline.tsx", "liveActionDock.tsx"]);
  });

  it("the legacy dock (V1) renders zero .acta-motion-* elements", () => {
    renderDock();
    expect(document.querySelectorAll('[class*="acta-motion-"]').length).toBe(0);
  });

  it("the legacy dock (V1) shows no floating feedback even after a capture", async () => {
    const { onSubmit } = renderDock();
    fireEvent.click(screen.getByRole("button", { name: "Touchdown" }));
    fireEvent.click(within(screen.getByTestId("dock-pool-own")).getByRole("button", { name: /#1/i }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(document.querySelectorAll('[class*="acta-motion-"]').length).toBe(0);
    expect(document.querySelector(".acta-motion-float-feedback")).toBeNull();
  });
});
