import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { ActaTurnTimeline, injuryRollCommand, turnCardsOf } from "./actaTurnTimeline";
import { buildGuidedCommand } from "./liveActionEntry";
import type { LiveMatchEventDto, MatchPlayer, MatchTeamDetail } from "./api";

/**
 * Acta en Vivo turn timeline (T8 Slice B — `openspec/changes/match-live-acta`,
 * MVA-3 timeline half + MVA-4): the per-turn cards of
 * `design/match-report-redesign/08-acta-en-vivo.html` ("MAIN CONTENT: TURN
 * TIMELINE"), data-bound over the live feed. These tests pin the four rules:
 *  - B1: events group into per-turn cards (newest turn first) with the
 *    EN JUEGO / COMPLETADO / CERRADO state chips (MVA-3),
 *  - B2: event rows show kind badge + player (name + role/number) +
 *    description + SPP marker without re-entry (S3),
 *  - B3: a casualty awaiting its injury roll renders the BB2025 D16 callout
 *    with the five severity bands (S1, bands verbatim),
 *  - B4: the roll action resolves through the EXISTING pending-roll flow —
 *    the shared `RollStepper` + the guided `casualty` command shape
 *    (`buildGuidedCommand` → live action API); never a new roll path.
 * Assertions are `.textContent`/regex (the repo has no jest-dom matchers).
 */

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

const home: MatchTeamDetail = {
  id: "t1",
  name: "Reikland Reavers",
  raceId: "human",
  user: null,
  players: [
    player("h1", "Brunhilda Eisenfaust", "blitzer"),
    player("h2", "Rodrick Ashworth", "thrower"),
    player("h3", "Grashnak Viletooth", "blitzer"),
  ],
};

const away: MatchTeamDetail = {
  id: "t2",
  name: "Gouged Eye",
  raceId: "orc",
  user: null,
  players: [player("a1", 'Morg "El Picador"', "blitzer"), player("a2", "Ugluk", "lineman")],
};

let seqCounter = 0;
function event(overrides: Partial<LiveMatchEventDto> & Pick<LiveMatchEventDto, "kind">): LiveMatchEventDto {
  seqCounter += 1;
  return {
    seq: seqCounter,
    side: null,
    playerRosterId: null,
    half: 1,
    turnNumber: 1,
    payload: {},
    at: STARTED,
    ...overrides,
  };
}

/** The artboard T6 shape: a TD on the active turn (Gouged Eye). */
function tdEvent(): LiveMatchEventDto {
  return event({
    kind: "td",
    side: "away",
    playerRosterId: "a1",
    turnNumber: 6,
    at: STARTED + 52 * MIN,
  });
}

/** The artboard T5 shape: a CAUSED casualty (causer Grashnak → victim Ugluk). */
function casualtyEvent(resolved: boolean): LiveMatchEventDto {
  return event({
    kind: "casualty",
    side: "away",
    playerRosterId: "a2",
    turnNumber: 5,
    at: STARTED + 44 * MIN,
    payload: {
      victimRosterId: "a2",
      causerRosterId: "h3",
      cause: "block",
      ...(resolved ? { roll16: 9, band: "apaleado" } : {}),
    },
  });
}

/** The D1 both-down record: rival victim + own causer + `block` + marker. */
function bothDownEvent(): LiveMatchEventDto {
  return event({
    kind: "casualty",
    side: "away",
    playerRosterId: "a2",
    turnNumber: 5,
    at: STARTED + 44 * MIN,
    payload: { victimRosterId: "a2", causerRosterId: "h3", cause: "block", bothDown: true },
  });
}

/** A pending SELF-INFLICTED record: own victim, dodge/crowd, NO causer. */
function selfInflictedEvent(): LiveMatchEventDto {
  return event({
    kind: "casualty",
    side: "away",
    playerRosterId: "a2",
    turnNumber: 5,
    at: STARTED + 44 * MIN,
    payload: { selfInflicted: true, victimRosterId: "a2", cause: "dodge" },
  });
}

/** The artboard T4 shape: a foul + a completed pass on a closed turn. */
function closedTurnEvents(): LiveMatchEventDto[] {
  return [
    event({
      kind: "foul",
      side: "home",
      playerRosterId: "h1",
      turnNumber: 4,
      at: STARTED + 36 * MIN,
      payload: { victimRosterId: "a2" },
    }),
    event({
      kind: "completion",
      side: "home",
      playerRosterId: "h2",
      turnNumber: 4,
      at: STARTED + 35 * MIN,
    }),
  ];
}

function liveActive() {
  return { status: "live" as const, half: 1, turnNumber: 6, activeSide: "away" as const };
}

type TimelineProps = Parameters<typeof ActaTurnTimeline>[0];
function timelineProps(overrides: Partial<TimelineProps> = {}): TimelineProps {
  return {
    events: [],
    homeTeam: home,
    awayTeam: away,
    startedAt: STARTED,
    now: STARTED + 52 * MIN,
    active: liveActive(),
    viewerSide: "home",
    onSubmit: vi.fn(),
    ...overrides,
  };
}

describe("ActaTurnTimeline — per-turn cards (MVA-3 / B1)", () => {
  it("groups events into per-turn cards, newest turn first, with the state chips", () => {
    seqCounter = 0;
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [tdEvent(), casualtyEvent(true), ...closedTurnEvents()] })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // Newest turn first, as in the artboard (T6 → T5 → T4).
    expect(cards.map((card) => card.getAttribute("data-turn"))).toEqual(["6", "5", "4"]);

    // State chips: active → EN JUEGO, just-finished turn → COMPLETADO, older → CERRADO.
    expect(cards[0].getAttribute("data-state")).toBe("live");
    expect(cards[0].textContent).toContain("EN JUEGO");
    expect(cards[1].getAttribute("data-state")).toBe("completed");
    expect(cards[1].textContent).toContain("COMPLETADO");
    expect(cards[2].getAttribute("data-state")).toBe("closed");
    expect(cards[2].textContent).toContain("CERRADO");
  });

  it("titles cards with the turn tag + acting team and the match minute", () => {
    seqCounter = 0;
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [tdEvent(), casualtyEvent(true), ...closedTurnEvents()] })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // Active turn → the active side's team (Gouged Eye).
    expect(cards[0].textContent).toMatch(/T6\s*•\s*Gouged Eye/);
    // T5's casualty is CAUSED by the home side → the home coach's turn.
    expect(cards[1].textContent).toMatch(/T5\s*•\s*Reikland Reavers/);
    expect(cards[1].textContent).toContain("Min 44'");
  });

  it("falls back to 'AMBOS EQUIPOS' when a turn's events span both teams", () => {
    seqCounter = 0;
    const mixed = [
      casualtyEvent(false), // authored by the home causer
      event({
        kind: "completion",
        side: "away", // authored by the away side — the turn mixes both
        playerRosterId: "a1",
        turnNumber: 5,
        at: STARTED + 43 * MIN,
      }),
    ];
    render(<ActaTurnTimeline {...timelineProps({ events: mixed, active: { ...liveActive(), turnNumber: 6 } })} />);

    const cards = screen.getAllByTestId("acta-turn-card");
    expect(cards[1].textContent).toMatch(/T5\s*•\s*AMBOS EQUIPOS/);
  });
});

describe("ActaTurnTimeline — event rows (MVA-3 / B2)", () => {
  it("event rows show kind badge, player name + role/number, description and the SPP marker", () => {
    seqCounter = 0;
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [tdEvent(), casualtyEvent(true), ...closedTurnEvents()] })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // TD row (artboard "+1 TD" badge + "+3 SPP" marker).
    const tdRow = cards[0].querySelector('[data-testid="acta-event-row"][data-kind="td"]');
    expect(tdRow).not.toBeNull();
    expect(tdRow!.textContent).toContain("+1 TD");
    expect(tdRow!.textContent).toContain('Morg "El Picador"');
    expect(tdRow!.textContent).toContain("(Orc Blitzer #1)");
    expect(tdRow!.textContent).toContain("Touchdown anotado");
    expect(tdRow!.textContent).toContain("+3 SPP");

    // Casualty row (artboard "CASUALTY" badge, causer → victim, "+2 SPP").
    const casRow = cards[1].querySelector('[data-testid="acta-event-row"][data-kind="casualty"]');
    expect(casRow).not.toBeNull();
    expect(casRow!.textContent).toContain("CASUALTY");
    expect(casRow!.textContent).toMatch(/Grashnak Viletooth \(#3\)\s*→\s*Ugluk \(#2\)/);
    expect(casRow!.textContent).toContain("+2 SPP");
  });

  it("closed turns render compact summary rows (icon + sentence, T4 style)", () => {
    seqCounter = 0;
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [tdEvent(), casualtyEvent(true), ...closedTurnEvents()] })}
      />,
    );

    const closedCard = screen.getAllByTestId("acta-turn-card")[2];
    const rows = closedCard.querySelectorAll('[data-testid="acta-event-row"][data-compact="true"]');
    expect(rows.length).toBe(2);
    expect(closedCard.textContent).toContain("Brunhilda Eisenfaust");
    expect(closedCard.textContent).toMatch(/realizó falta sobre Ugluk/);
    expect(closedCard.textContent).toContain("Rodrick Ashworth");
    expect(closedCard.textContent).toMatch(/complet[óo] Pase/);
  });
});

describe("ActaTurnTimeline — pending injury-roll callout (MVA-4 / B3)", () => {
  it("a casualty awaiting its injury roll renders the callout with the BB2025 D16 bands", () => {
    seqCounter = 0;
    // The caused form is the CAUSER's record: the author side sees the roll
    // action while it is the active coach (its accepted window — LM-12).
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [casualtyEvent(false)], viewerSide: "home", active: { ...liveActive(), activeSide: "home" } })}
      />,
    );

    const callout = screen.getByTestId("acta-injury-callout");
    expect(callout.textContent).toContain("TIRADA DE LESIÓN PENDIENTE (REGLAMENTO BB2025)");
    // Explanatory line names the player and the armor-break context.
    expect(callout.textContent).toMatch(/Ugluk \(Orc Lineman #2\)/);
    expect(callout.textContent).toMatch(/rompe\w* armadura/i);
    // The roll action (dice icon button).
    expect(callout.textContent).toContain("TIRAR 1D16 DE LESIÓN");

    // S1: the five BB2025 D16 severity bands, VERBATIM.
    const table = callout.querySelector('[data-testid="acta-severity-table"]');
    expect(table).not.toBeNull();
    expect(table!.textContent).toContain("Resultado 1D16");
    expect(table!.textContent).toContain("Severidad BB2025");
    expect(table!.textContent).toMatch(/1-8/);
    expect(table!.textContent).toContain("Magullado (Sin efecto duradero)");
    expect(table!.textContent).toMatch(/9-10/);
    expect(table!.textContent).toContain("Apaleado (Pierde el resto del partido)");
    expect(table!.textContent).toMatch(/11-12/);
    expect(table!.textContent).toContain("Grave (Pasa a la enfermería)");
    expect(table!.textContent).toMatch(/13-14/);
    expect(table!.textContent).toContain("Permanente (-1 Característica permanente)");
    expect(table!.textContent).toMatch(/15-16/);
    expect(table!.textContent).toContain("Muerto (Ataúd / Regeneración requerida)");
  });

  it("a resolved casualty never renders the callout (no re-entry, S3)", () => {
    seqCounter = 0;
    render(<ActaTurnTimeline {...timelineProps({ events: [casualtyEvent(true)] })} />);

    expect(document.querySelector('[data-testid="acta-injury-callout"]')).toBeNull();
    // The captured roll renders on the row without asking for it again.
    expect(screen.getByTestId("acta-turn-timeline").textContent).toContain("CASUALTY");
  });

  it("a casualty resolved by a later roll for the same victim clears the callout", () => {
    seqCounter = 0;
    render(<ActaTurnTimeline {...timelineProps({ events: [casualtyEvent(false), casualtyEvent(true)] })} />);

    expect(document.querySelector('[data-testid="acta-injury-callout"]')).toBeNull();
  });
});

describe("ActaTurnTimeline — the roll action (MVA-4 / B4)", () => {
  it("triggers the EXISTING pending-roll flow: RollStepper pick fires the guided casualty command", () => {
    seqCounter = 0;
    const onSubmit = vi.fn();
    // The author (causer) side while active may record the caused form (LM-12).
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [casualtyEvent(false)], viewerSide: "home", active: { ...liveActive(), activeSide: "home" }, onSubmit })}
      />,
    );

    fireEvent.click(screen.getByTestId("acta-injury-roll"));
    // The existing shared 1D16 picker (features/leagues/rollStepper.tsx).
    expect(screen.getByTestId("roll-stepper-16")).toBeTruthy();
    fireEvent.click(screen.getByTestId("roll-option-9"));

    // The command is the EXISTING guided casualty shape (live action API) —
    // the victim's side + causer + cause + the rolled 1D16, band derived
    // server-side. No new roll path.
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const cmd = onSubmit.mock.calls[0][0];
    expect(cmd).toEqual({
      type: "casualty",
      side: "away",
      victimRosterId: "a2",
      causerRosterId: "h3",
      cause: "block",
      roll16: 9,
    });
    expect(cmd).toEqual(
      buildGuidedCommand("casualty", "home", {
        cause: "block",
        causerId: "h3",
        victimId: "a2",
        roll16: 9,
        roll6: "",
      }),
    );
  });

  it("a permanent band (13-14) waits for the shared 1D6 pick before firing", () => {
    seqCounter = 0;
    const onSubmit = vi.fn();
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [casualtyEvent(false)], viewerSide: "home", active: { ...liveActive(), activeSide: "home" }, onSubmit })}
      />,
    );

    fireEvent.click(screen.getByTestId("acta-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-13"));
    // The 1D6 attribute roll is required for Permanente — nothing fires yet.
    expect(onSubmit).not.toHaveBeenCalled();
    // The shared 1D6 group reuses roll-option-{n} — scoped by its container.
    const stepper6 = screen.getByTestId("roll-stepper-6");
    fireEvent.click(within(stepper6).getByTestId("roll-option-3"));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0]).toEqual({
      type: "casualty",
      side: "away",
      victimRosterId: "a2",
      causerRosterId: "h3",
      cause: "block",
      roll16: 13,
      roll6: 3,
    });
  });

  it("the action renders only where the CAUSED command is accepted (victim coach never, author per its window)", () => {
    seqCounter = 0;
    const base = { events: [casualtyEvent(false)], onSubmit: vi.fn() };

    // D1: the victim's coach is rejected by the route (the own-player form is
    // self-inflicted-only) — no action, even on their own active turn.
    const victimView = render(
      <ActaTurnTimeline
        {...timelineProps({ ...base, viewerSide: "away", active: { ...liveActive(), activeSide: "away" } })}
      />,
    );
    expect(screen.getByTestId("acta-injury-callout")).toBeTruthy();
    expect(document.querySelector('[data-testid="acta-injury-roll"]')).toBeNull();
    victimView.unmount();

    // The author side OUTSIDE its window (rival active) would 409 — hidden.
    const offWindow = render(
      <ActaTurnTimeline
        {...timelineProps({ ...base, viewerSide: "home", active: { ...liveActive(), activeSide: "away" } })}
      />,
    );
    expect(document.querySelector('[data-testid="acta-injury-roll"]')).toBeNull();
    offWindow.unmount();

    // The author side WHILE ACTIVE is the accepted window — the action shows.
    render(
      <ActaTurnTimeline
        {...timelineProps({ ...base, viewerSide: "home", active: { ...liveActive(), activeSide: "home" } })}
      />,
    );
    expect(screen.getByTestId("acta-injury-roll")).toBeTruthy();
  });

  it("both-down: NO action for the author during their own active turn, action in the non-active window (D1)", () => {
    seqCounter = 0;
    const base = { events: [bothDownEvent()], onSubmit: vi.fn() };

    // D2: the both-down marker is accepted ONLY from the NON-active coach —
    // the author side while active would 409 at the shape gate → hidden.
    const authorActive = render(
      <ActaTurnTimeline
        {...timelineProps({ ...base, viewerSide: "home", active: { ...liveActive(), activeSide: "home" } })}
      />,
    );
    expect(document.querySelector('[data-testid="acta-injury-roll"]')).toBeNull();
    authorActive.unmount();

    // "The other side does": the author once it is the NON-active side (the
    // both-down author IS the other, non-active coach) — the accepted window.
    const authorInactive = render(
      <ActaTurnTimeline
        {...timelineProps({ ...base, viewerSide: "home", active: { ...liveActive(), activeSide: "away" } })}
      />,
    );
    expect(screen.getByTestId("acta-injury-roll")).toBeTruthy();
    authorInactive.unmount();

    // The victim's coach is never accepted for a both-down record either (the
    // shape gate requires command.side !== caller — route.ts:1388).
    render(
      <ActaTurnTimeline
        {...timelineProps({ ...base, viewerSide: "away", active: { ...liveActive(), activeSide: "home" } })}
      />,
    );
    expect(document.querySelector('[data-testid="acta-injury-roll"]')).toBeNull();
  });

  it("self-inflicted (dodge/crowd): the victim's coach gets the action in ANY turn window, the other side and spectators never", () => {
    seqCounter = 0;
    const base = { events: [selfInflictedEvent()], onSubmit: vi.fn() };

    // The own-player (self-inflicted) form is the VICTIM's coach record in any
    // window — visible while their side is the active one…
    const victimActive = render(
      <ActaTurnTimeline
        {...timelineProps({ ...base, viewerSide: "away", active: { ...liveActive(), activeSide: "away" } })}
      />,
    );
    expect(screen.getByTestId("acta-injury-roll")).toBeTruthy();
    victimActive.unmount();

    // …and while the rival is active (the victim's coach is non-active).
    const victimInactive = render(
      <ActaTurnTimeline
        {...timelineProps({ ...base, viewerSide: "away", active: { ...liveActive(), activeSide: "home" } })}
      />,
    );
    expect(screen.getByTestId("acta-injury-roll")).toBeTruthy();
    victimInactive.unmount();

    // The OTHER side is never accepted for a self-inflicted form (the route
    // rejects it even active — "Caused casualties require a causer cause").
    const otherSide = render(
      <ActaTurnTimeline
        {...timelineProps({ ...base, viewerSide: "home", active: { ...liveActive(), activeSide: "home" } })}
      />,
    );
    expect(document.querySelector('[data-testid="acta-injury-roll"]')).toBeNull();
    otherSide.unmount();

    // Spectators never.
    render(<ActaTurnTimeline {...timelineProps({ ...base, viewerSide: null })} />);
    expect(document.querySelector('[data-testid="acta-injury-roll"]')).toBeNull();
  });

  it("never offers the roll to a spectator (no side → the route denies all recording)", () => {
    seqCounter = 0;
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [casualtyEvent(false)], viewerSide: null, onSubmit: vi.fn() })}
      />,
    );

    // The callout still educates (bands + label) — only the action is gated.
    expect(screen.getByTestId("acta-injury-callout")).toBeTruthy();
    expect(document.querySelector('[data-testid="acta-injury-roll"]')).toBeNull();
  });
});

describe("turnCardsOf / injuryRollCommand (pure seams)", () => {
  it("turnCardsOf keys the cards by (half, turnNumber) and keeps events in capture order", () => {
    seqCounter = 0;
    const events = [...closedTurnEvents(), casualtyEvent(true), tdEvent()];
    const cards = turnCardsOf(events, liveActive());
    expect(cards.map((card) => [card.half, card.turnNumber])).toEqual([
      [1, 6],
      [1, 5],
      [1, 4],
    ]);
    expect(cards[2].events.map((e) => e.kind)).toEqual(["foul", "completion"]);
  });

  it("injuryRollCommand rebuilds the recorded casualty's own command shape + the roll", () => {
    seqCounter = 0;
    const pending = casualtyEvent(false);
    expect(injuryRollCommand(pending, 12, undefined)).toEqual({
      type: "casualty",
      side: "away",
      victimRosterId: "a2",
      causerRosterId: "h3",
      cause: "block",
      roll16: 12,
    });
  });
});
