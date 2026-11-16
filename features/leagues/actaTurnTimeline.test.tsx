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
 *  - B1: events group into per-HALF-TURN cards (T8 — one card per
 *    (half, turnNumber, side), newest first) with the
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

  it("a pair where BOTH coaches act splits into two cards — never one merged AMBOS EQUIPOS card (T8)", () => {
    seqCounter = 0;
    // WHY the turn-boundary markers (T16): the split is now the GAME-TURN rule
    // (S10.4) — each capture lands on the half-turn its «Fin Turno» boundary
    // closes — not the capture-author rule. The markers are the real feed's
    // pass rows (actaDemoReducer endTurn stamps one per pass).
    const mixed = [
      casualtyEvent(false), // captured during HOME's half-turn (their causer acted)
      event({ kind: "turnStart", side: "home", turnNumber: 5, at: STARTED + 42 * MIN }),
      event({
        kind: "completion",
        side: "away", // the away coach played the SAME turn number
        playerRosterId: "a1",
        turnNumber: 5,
        at: STARTED + 43 * MIN,
      }),
      event({ kind: "turnStart", side: "away", turnNumber: 5, at: STARTED + 44 * MIN }),
    ];
    render(<ActaTurnTimeline {...timelineProps({ events: mixed, active: { ...liveActive(), turnNumber: 6 } })} />);

    const cards = screen.getAllByTestId("acta-turn-card");
    // ONE CARD PER HALF-TURN: each coach's play of turn 5 keeps its own card
    // (the pair's second play first) — the span-both merge is gone.
    expect(cards).toHaveLength(3);
    expect(cards[1].textContent).toMatch(/T5\s*•\s*Gouged Eye/);
    expect(cards[2].textContent).toMatch(/T5\s*•\s*Reikland Reavers/);
    expect(screen.queryByText(/AMBOS EQUIPOS/)).toBeNull();
  });

  it.each(["interception", "throwTeamMate", "landedSafe"] as const)(
    "a turn whose only capture is a %s shows the acting team (verifier defect 2)",
    (kind) => {
      seqCounter = 0;
      const only = [
        event({
          kind,
          side: "home",
          playerRosterId: "h2",
          turnNumber: 5,
          at: STARTED + 43 * MIN,
        }),
      ];
      render(
        <ActaTurnTimeline
          {...timelineProps({ events: only, active: { ...liveActive(), turnNumber: 6 } })}
        />,
      );
      const cards = screen.getAllByTestId("acta-turn-card");
      // The single capture is the home side's own action → their turn title
      // (never the AMBOS EQUIPOS fallback the td|completion|foul vote missed).
      expect(cards[1].textContent).toMatch(/T5\s*•\s*Reikland Reavers/);
      expect(cards[1].textContent).not.toMatch(/AMBOS EQUIPOS/);
    },
  );
});

describe("ActaTurnTimeline — team-colored turn accents (S3)", () => {
  it("the left accent follows the acting team, not the state (a live home card is navy)", () => {
    seqCounter = 0;
    render(
      <ActaTurnTimeline
        {...timelineProps({
          events: [
            // T5: an away touchdown — the away coach's turn.
            event({
              kind: "td",
              side: "away",
              playerRosterId: "a1",
              turnNumber: 5,
              at: STARTED + 44 * MIN,
            }),
            // T4: home captures — the home coach's turn.
            ...closedTurnEvents(),
          ],
          // The LIVE turn is the HOME coach's — team-coded, never state-coded.
          active: { status: "live", half: 1, turnNumber: 6, activeSide: "home" },
        })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // T6 live + home-owned → navy (the accent no longer encodes "live").
    expect(cards[0].className).toContain("border-l-navy");
    expect(cards[0].className).not.toContain("border-l-red");
    // T5 completed away turn → red.
    expect(cards[1].className).toContain("border-l-red");
    // T4 closed home turn → navy.
    expect(cards[2].className).toContain("border-l-navy");
  });

  it("a pair where both coaches act tints each half-turn card by its own team (T8 split — no slate merge)", () => {
    seqCounter = 0;
    // WHY the turn-boundary markers (T16): same as the split test above — the
    // two half-turns are delimited by the feed's pass rows (game-turn rule),
    // not inferred from who authored each capture.
    const mixed = [
      casualtyEvent(false), // captured during HOME's half-turn
      event({ kind: "turnStart", side: "home", turnNumber: 5, at: STARTED + 42 * MIN }),
      event({
        kind: "completion",
        side: "away", // the away coach's own half-turn
        playerRosterId: "a1",
        turnNumber: 5,
        at: STARTED + 43 * MIN,
      }),
      event({ kind: "turnStart", side: "away", turnNumber: 5, at: STARTED + 44 * MIN }),
    ];
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: mixed, active: { ...liveActive(), turnNumber: 6 } })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    expect(cards[1].className).toContain("border-l-red");
    expect(cards[2].className).toContain("border-l-navy");
    expect(cards[1].className).not.toContain("border-l-slate");
    expect(cards[2].className).not.toContain("border-l-slate");
  });
});

describe("ActaTurnTimeline — event rows (MVA-3 / B2)", () => {
  it("event rows show the category tab, player name + role/number, description and the SPP tab", () => {
    seqCounter = 0;
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [tdEvent(), casualtyEvent(true), ...closedTurnEvents()] })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // TD row. WHY changed (T18, intentional title change): the old "+1 TD"
    // inline badge became the folder-tab category «TD» — the count/SPP moved
    // with the bottom-right SPP tab (design/acta-folder-tabs/01, L60/L63).
    const tdRow = cards[0].querySelector('[data-testid="acta-event-row"][data-kind="td"]');
    expect(tdRow).not.toBeNull();
    expect(tdRow!.querySelector('[data-testid="acta-event-tab"]')!.textContent).toBe("TD");
    expect(tdRow!.textContent).toContain('Morg "El Picador"');
    expect(tdRow!.textContent).toContain("(Orc Blitzer #1)");
    expect(tdRow!.textContent).toContain("Touchdown anotado");
    expect(tdRow!.textContent).toContain("+3 SPP");

    // Casualty row. WHY changed (T18, intentional title change): the
    // "CASUALTY" badge is now the category tab «Casualty»; the causer → victim
    // mark and the SPP tab stay.
    const casRow = cards[1].querySelector('[data-testid="acta-event-row"][data-kind="casualty"]');
    expect(casRow).not.toBeNull();
    expect(casRow!.querySelector('[data-testid="acta-event-tab"]')!.textContent).toBe("Casualty");
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
    // WHY the case changed (T18, intentional): the "CASUALTY" badge became the
    // «Casualty» folder-tab category.
    expect(screen.getByTestId("acta-turn-timeline").textContent).toContain("Casualty");
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
  it("turnCardsOf keys the cards by (half, turnNumber, side) and keeps events in capture order (T8)", () => {
    seqCounter = 0;
    const events = [...closedTurnEvents(), casualtyEvent(true), tdEvent()];
    const cards = turnCardsOf(events, liveActive());
    // One key per HALF-TURN: the active T6 away card, T5's home half-turn and
    // T4's home half-turn. WHY unchanged (T16): these feeds carry no
    // turn-boundary rows, so the attribution falls back to the capture author
    // (legacy/constructed feeds — `gameTurnSidesOf`), which is T8's answer.
    expect(cards.map((card) => card.key)).toEqual(["1:6:away", "1:5:home", "1:4:home"]);
    expect(cards.map((card) => [card.half, card.turnNumber, card.actingSide])).toEqual([
      [1, 6, "away"],
      [1, 5, "home"],
      [1, 4, "home"],
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

describe("ActaTurnTimeline — one card per HALF-TURN (T8 / L37)", () => {
  it("when the turn passes the rival's half-turn gets its own empty EN JUEGO card and the closed sibling persists", () => {
    // «cuando pase el turno deberia salir la card de t1 colimillos del caos» —
    // the ACTIVE half-turn always shows its card (even before any action) and
    // its actions appear live as recorded.
    seqCounter = 0;
    const homeCompletion = event({
      kind: "completion",
      side: "home",
      playerRosterId: "h2",
      turnNumber: 5,
      at: STARTED + 40 * MIN,
    });
    // Home opened the pair (turnStarter) and is playing turn 5 right now.
    const homePlaying = {
      status: "live" as const,
      half: 1,
      turnNumber: 5,
      activeSide: "home" as const,
      turnStarter: "home" as const,
    };
    const { rerender } = render(
      <ActaTurnTimeline {...timelineProps({ events: [homeCompletion], active: homePlaying })} />,
    );

    let cards = screen.getAllByTestId("acta-turn-card");
    expect(cards).toHaveLength(1);
    expect(cards[0].textContent).toMatch(/T5\s*•\s*Reikland Reavers/);
    expect(cards[0].textContent).toContain("EN JUEGO");
    expect(
      cards[0].querySelector('[data-testid="acta-event-row"][data-kind="completion"]'),
    ).not.toBeNull();

    // Home passes the turn: the RIVAL's card appears as the new active card.
    // WHY the pass marker joins the feed (T16): the real «Fin Turno» appends
    // its `turnStart` boundary (actaDemoReducer endTurn) — that marker is what
    // keeps the completed half-turn's rows on HOME's game-turn card once the
    // active side flips; a marker-less feed cannot express "home already
    // passed" and would re-attribute the open run to the new active side.
    const homePassed = event({
      kind: "turnStart",
      side: "home",
      turnNumber: 5,
      at: STARTED + 41 * MIN,
    });
    rerender(
      <ActaTurnTimeline
        {...timelineProps({
          events: [homeCompletion, homePassed],
          active: { ...homePlaying, activeSide: "away" },
        })}
      />,
    );

    cards = screen.getAllByTestId("acta-turn-card");
    expect(cards).toHaveLength(2);
    // The new active half-turn shows its card with EN JUEGO, even empty.
    expect(cards[0].textContent).toMatch(/T5\s*•\s*Gouged Eye/);
    expect(cards[0].textContent).toContain("EN JUEGO");
    expect(cards[0].querySelectorAll('[data-testid="acta-event-row"]')).toHaveLength(0);
    // The closed sibling persists with its own actions (COMPLETADO).
    expect(cards[1].textContent).toMatch(/T5\s*•\s*Reikland Reavers/);
    expect(cards[1].textContent).toContain("COMPLETADO");
    expect(
      cards[1].querySelector('[data-testid="acta-event-row"][data-kind="completion"]'),
    ).not.toBeNull();
  });

  it("one card per (half, turnNumber, side): a caused casualty lands on its GAME TURN's half-turn card", () => {
    seqCounter = 0;
    const events = [
      // WHY re-framed (T16 / S10.4): the row lands on the GAME TURN's card —
      // it was captured while the causer's coach was playing their half-turn
      // («el jugador que placa informa del placaje»). The capture author (the
      // home causer, LM-12) now shows only on the row's author badge; the
      // half-turn boundary is the feed's pass row (turnStart).
      casualtyEvent(true),
      event({
        kind: "completion",
        side: "home",
        playerRosterId: "h2",
        turnNumber: 5,
        at: STARTED + 43 * MIN,
      }),
      // Home passes: their half-turn closes; the rival plays the same turn.
      event({ kind: "turnStart", side: "home", turnNumber: 5, at: STARTED + 44 * MIN }),
      event({
        kind: "td",
        side: "away",
        playerRosterId: "a1",
        turnNumber: 5,
        at: STARTED + 45 * MIN,
      }),
      event({ kind: "turnStart", side: "away", turnNumber: 5, at: STARTED + 46 * MIN }),
    ];
    render(
      <ActaTurnTimeline
        {...timelineProps({ events, active: { ...liveActive(), turnStarter: "home" } })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // [T6 away active] · [T5 away (the pair's second play)] · [T5 home (opener)].
    expect(cards).toHaveLength(3);
    expect(cards[1].textContent).toMatch(/T5\s*•\s*Gouged Eye/);
    expect(
      cards[1].querySelectorAll('[data-testid="acta-event-row"]'),
    ).toHaveLength(1);
    expect(
      cards[1].querySelector('[data-testid="acta-event-row"][data-kind="td"]'),
    ).not.toBeNull();
    expect(
      cards[1].querySelector('[data-testid="acta-event-row"][data-kind="casualty"]'),
    ).toBeNull();
    // Home's half-turn (the GAME TURN of those captures) holds both rows.
    expect(cards[2].textContent).toMatch(/T5\s*•\s*Reikland Reavers/);
    expect(
      cards[2].querySelector('[data-testid="acta-event-row"][data-kind="casualty"]'),
    ).not.toBeNull();
    expect(
      cards[2].querySelector('[data-testid="acta-event-row"][data-kind="completion"]'),
    ).not.toBeNull();
  });

  it("a half-turn that closes with NO recorded display event shows NO card («si no hay nada que registrar esta card deberia desaparecer»)", () => {
    seqCounter = 0;
    const events = [
      event({
        kind: "completion",
        side: "home",
        playerRosterId: "h2",
        turnNumber: 5,
        at: STARTED + 40 * MIN,
      }),
      // WHY the pass marker joins the feed (T16): the story is "home played
      // turn 5 and recorded A PASS" — the real feed carries home's «Fin Turno»
      // boundary (`turnStart`), which is what attributes the row to home's
      // GAME TURN once the rival's half-turn is the active one.
      event({
        kind: "turnStart",
        side: "home",
        turnNumber: 5,
        at: STARTED + 41 * MIN,
      }),
    ];
    // Home played turn 5 and recorded a pass; the rival played the SAME turn
    // number and recorded NOTHING — no key/card may exist for that half-turn.
    const played = turnCardsOf(events, {
      status: "live",
      half: 1,
      turnNumber: 6,
      activeSide: "away",
      turnStarter: "home",
    });
    expect(played.map((card) => card.key)).toEqual(["1:6:away", "1:5:home"]);

    // The ACTIVE half-turn's card exists even when empty (EN JUEGO)…
    const playing = turnCardsOf(events, {
      status: "live",
      half: 1,
      turnNumber: 5,
      activeSide: "away",
      turnStarter: "home",
    });
    expect(playing.map((card) => card.key)).toEqual(["1:5:away", "1:5:home"]);

    // …and disappears once the turn passes: only real captures keep cards.
    const passed = turnCardsOf(events, {
      status: "live",
      half: 1,
      turnNumber: 6,
      activeSide: "home",
      turnStarter: "away",
    });
    expect(passed.map((card) => card.key)).toEqual(["1:6:home", "1:5:home"]);
  });

  it("while live: the active half-turn is EN JUEGO, the card right before it COMPLETADO, every older card CERRADO", () => {
    seqCounter = 0;
    const events = [
      // Pair 5: away (the turnStarter) opened, then home played — both recorded.
      event({
        kind: "td",
        side: "away",
        playerRosterId: "a1",
        turnNumber: 5,
        at: STARTED + 40 * MIN,
      }),
      event({
        kind: "completion",
        side: "home",
        playerRosterId: "h2",
        turnNumber: 5,
        at: STARTED + 42 * MIN,
      }),
    ];
    render(
      <ActaTurnTimeline
        {...timelineProps({ events, active: { ...liveActive(), turnStarter: "away" } })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // Within a pair the half-turn played SECOND is newer than the opener, so
    // home's T5 card (the pair's second play) leads its closed sibling.
    expect(
      cards.map((card) => [card.getAttribute("data-turn"), card.getAttribute("data-state")]),
    ).toEqual([
      ["6", "live"],
      ["5", "completed"],
      ["5", "closed"],
    ]);
    expect(cards[1].textContent).toMatch(/T5\s*•\s*Reikland Reavers/);
    expect(cards[2].textContent).toMatch(/T5\s*•\s*Gouged Eye/);
  });

  it("system captures (side null) get their own neutral AMBOS EQUIPOS card, at the pair's bottom", () => {
    seqCounter = 0;
    const events = [
      event({
        kind: "weather",
        side: null,
        playerRosterId: null,
        turnNumber: 5,
        at: STARTED + 41 * MIN,
        payload: { value: "perfect", roll: 4 },
      }),
      event({
        kind: "completion",
        side: "home",
        playerRosterId: "h2",
        turnNumber: 5,
        at: STARTED + 42 * MIN,
      }),
    ];
    render(
      <ActaTurnTimeline
        {...timelineProps({ events, active: { ...liveActive(), turnStarter: "home" } })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    expect(cards).toHaveLength(3);
    // The coach's half-turn card holds ONLY their own action…
    expect(cards[1].textContent).toMatch(/T5\s*•\s*Reikland Reavers/);
    expect(
      cards[1].querySelector('[data-testid="acta-event-row"][data-kind="completion"]'),
    ).not.toBeNull();
    expect(
      cards[1].querySelector('[data-testid="acta-event-row"][data-kind="weather"]'),
    ).toBeNull();
    // …and the system capture lands in the pair's own neutral card (slate).
    expect(cards[2].textContent).toMatch(/T5\s*•\s*AMBOS EQUIPOS/);
    expect(cards[2].className).toContain("border-l-slate");
    expect(
      cards[2].querySelector('[data-testid="acta-event-row"][data-kind="weather"]'),
    ).not.toBeNull();
    expect(
      cards[2].querySelector('[data-testid="acta-event-row"][data-kind="completion"]'),
    ).toBeNull();
  });

  it("on a finished match the last turn renders COMPLETADO and every older card CERRADO (per half-turn)", () => {
    seqCounter = 0;
    const events = [
      event({
        kind: "td",
        side: "away",
        playerRosterId: "a1",
        half: 2,
        turnNumber: 8,
        at: STARTED + 92 * MIN,
      }),
      event({
        kind: "completion",
        side: "home",
        playerRosterId: "h2",
        half: 2,
        turnNumber: 8,
        at: STARTED + 90 * MIN,
      }),
      event({
        kind: "foul",
        side: "home",
        playerRosterId: "h1",
        half: 2,
        turnNumber: 7,
        at: STARTED + 80 * MIN,
        payload: { victimRosterId: "a2" },
      }),
    ];
    render(
      <ActaTurnTimeline
        {...timelineProps({
          events,
          active: {
            status: "finished",
            half: 2,
            turnNumber: 8,
            activeSide: "home",
            turnStarter: "home",
          },
        })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // BOTH half-turns of the last pair (the "last turn") persist as COMPLETADO.
    expect(
      cards.map((card) => [card.getAttribute("data-turn"), card.getAttribute("data-state")]),
    ).toEqual([
      ["8", "completed"],
      ["8", "completed"],
      ["7", "closed"],
    ]);
    expect(cards[0].textContent).toMatch(/T8\s*•\s*Gouged Eye/);
    expect(cards[1].textContent).toMatch(/T8\s*•\s*Reikland Reavers/);
    expect(cards[2].textContent).toMatch(/T7\s*•\s*Reikland Reavers/);
  });

  it("a causer-less casualty (self-inflicted) lands in the game turn's half-turn — never a neutral card", () => {
    seqCounter = 0;
    // WHY re-framed (T16 / S10.4): the mishap landed during the AWAY coach's
    // half-turn (their player fell mid-turn) — the feed's pass row delimits
    // that game turn. The capture author (the victim's own coach) shows on the
    // row's badge; the CARD follows the game turn, never the author.
    const events = [
      selfInflictedEvent(),
      event({ kind: "turnStart", side: "away", turnNumber: 5, at: STARTED + 45 * MIN }),
    ];
    render(
      <ActaTurnTimeline
        {...timelineProps({ events, active: { ...liveActive(), turnStarter: "home" } })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // The mishap belongs to the AWAY coach's game turn (their player fell).
    expect(cards[1].textContent).toMatch(/T5\s*•\s*Gouged Eye/);
    expect(
      cards[1].querySelector('[data-testid="acta-event-row"][data-kind="casualty"]'),
    ).not.toBeNull();
    expect(screen.queryByText(/AMBOS EQUIPOS/)).toBeNull();
  });

  it("turnStarter flips with the halves: the other half's pairs opened with the rival", () => {
    seqCounter = 0;
    const events = [
      event({
        kind: "completion",
        side: "home",
        playerRosterId: "h2",
        half: 1,
        turnNumber: 8,
        at: STARTED + 45 * MIN,
      }),
      event({
        kind: "td",
        side: "away",
        playerRosterId: "a1",
        half: 1,
        turnNumber: 8,
        at: STARTED + 46 * MIN,
      }),
    ];
    // Half 2 is under way and HOME opens its pairs — so half 1's pairs were
    // opened by AWAY: home's turn-8 half-turn is the pair's SECOND play.
    const cards = turnCardsOf(events, {
      status: "live",
      half: 2,
      turnNumber: 1,
      activeSide: "home",
      turnStarter: "home",
    });
    expect(cards.map((card) => [card.half, card.turnNumber, card.actingSide])).toEqual([
      [2, 1, "home"],
      [1, 8, "home"],
      [1, 8, "away"],
    ]);
  });
});

describe("ActaTurnTimeline — S10.4: game-turn grouping + capture-author badges (T16)", () => {
  it("during team A's turn, team B (victim's owner) captures an injury for its own knocked-down player — the row lands on A's card with B's author badge", () => {
    seqCounter = 0;
    // S10.4.1 (L54): A placa a B — A's coach is playing their half-turn and B
    // (the victim's owner) registers the INJURY of its own knocked-down player
    // (the victim-side capture, today's «Baja propia»; the knockdown/causer
    // context is the attacker's own capture — T17's chain). The row lands on
    // A's GAME-TURN card («placaje y herida de la misma jugada caen en la
    // MISMA card») while the badge names B as the registrar (S10.4.2).
    const injury = event({
      kind: "casualty",
      side: "away",
      playerRosterId: "a2",
      turnNumber: 5,
      at: STARTED + 44 * MIN,
      payload: { victimRosterId: "a2", cause: "dodge", roll16: 8 },
    });
    const homePassed = event({
      kind: "turnStart",
      side: "home",
      turnNumber: 5,
      at: STARTED + 45 * MIN,
    });
    render(
      <ActaTurnTimeline
        {...timelineProps({
          events: [injury, homePassed],
          active: { ...liveActive(), turnStarter: "home" },
        })}
      />,
    );

    // A's card = the game turn (T5 · Reikland Reavers) holds the injury row…
    const card = screen
      .getByText(/T5\s*•\s*Reikland Reavers/)
      .closest("article") as HTMLElement;
    const row = card.querySelector(
      '[data-testid="acta-event-row"][data-kind="casualty"]',
    ) as HTMLElement;
    expect(row).not.toBeNull();
    // …and the badge names B (the victim's owner) as quien la registró.
    expect(row.textContent).toContain("Registrado por Gouged Eye");
    // The victim's team gets NO card of its own for this capture.
    expect(screen.queryByText(/T5\s*•\s*Gouged Eye/)).toBeNull();
  });

  it("mid-turn: the victim-side capture resolves to the ACTIVE coach's card even before the pass boundary lands", () => {
    seqCounter = 0;
    // The no-flicker rule (`gameTurnSidesOf`): while the half-turn is being
    // played its captures already group under the active game turn — the
    // later «Fin Turno» marker changes nothing.
    const injury = event({
      kind: "casualty",
      side: "away",
      playerRosterId: "a2",
      turnNumber: 5,
      at: STARTED + 44 * MIN,
      payload: { victimRosterId: "a2", cause: "dodge", roll16: 8 },
    });
    const { rerender } = render(
      <ActaTurnTimeline
        {...timelineProps({
          events: [injury],
          active: { ...liveActive(), turnNumber: 5, activeSide: "home", turnStarter: "home" },
        })}
      />,
    );
    expect(screen.getByText(/T5\s*•\s*Reikland Reavers/)).toBeTruthy();

    // The pass lands: the same row stays on the same card (no re-group).
    const homePassed = event({
      kind: "turnStart",
      side: "home",
      turnNumber: 5,
      at: STARTED + 45 * MIN,
    });
    rerender(
      <ActaTurnTimeline
        {...timelineProps({
          events: [injury, homePassed],
          active: {
            ...liveActive(),
            turnNumber: 5,
            activeSide: "away",
            turnStarter: "home",
          },
        })}
      />,
    );
    const card = screen
      .getByText(/T5\s*•\s*Reikland Reavers/)
      .closest("article") as HTMLElement;
    expect(
      card.querySelector('[data-testid="acta-event-row"][data-kind="casualty"]'),
    ).not.toBeNull();
  });

  it("captures by BOTH coaches during ONE game turn land on ONE card — the regrouping (S10.4.2)", () => {
    seqCounter = 0;
    const events = [
      // A's own action…
      event({
        kind: "td",
        side: "home",
        playerRosterId: "h1",
        turnNumber: 5,
        at: STARTED + 43 * MIN,
      }),
      // …and B's victim-side injury capture, same game turn.
      event({
        kind: "casualty",
        side: "away",
        playerRosterId: "a2",
        turnNumber: 5,
        at: STARTED + 44 * MIN,
        payload: { victimRosterId: "a2", cause: "dodge", roll16: 8 },
      }),
      event({ kind: "turnStart", side: "home", turnNumber: 5, at: STARTED + 45 * MIN }),
    ];
    render(
      <ActaTurnTimeline
        {...timelineProps({
          events,
          active: { ...liveActive(), turnStarter: "home" },
        })}
      />,
    );

    const cards = screen.getAllByTestId("acta-turn-card");
    // The ONE game-turn card holds both rows (never one card per author)…
    expect(cards).toHaveLength(2);
    const card = cards[1];
    expect(card.textContent).toMatch(/T5\s*•\s*Reikland Reavers/);
    expect(
      Array.from(card.querySelectorAll('[data-testid="acta-event-row"]')).map(
        (row) => row.getAttribute("data-kind"),
      ),
    ).toEqual(["td", "casualty"]);
    // …each row carrying its own capture-author badge (role transparency).
    expect(card.textContent).toContain("Registrado por Reikland Reavers");
    expect(card.textContent).toContain("Registrado por Gouged Eye");
  });

  it("closed cards carry the compact badge too, and system rows read «Registro de sistema»", () => {
    seqCounter = 0;
    const events = [
      ...closedTurnEvents(),
      event({
        kind: "weather",
        side: null,
        playerRosterId: null,
        turnNumber: 4,
        at: STARTED + 37 * MIN,
        payload: { value: "perfect", roll: 4 },
      }),
    ];
    render(<ActaTurnTimeline {...timelineProps({ events })} />);

    const closed = screen
      .getByText(/T4\s*•\s*Reikland Reavers/)
      .closest("article") as HTMLElement;
    // Compact rows (closed cards) show the same registrar marker…
    expect(closed.textContent).toContain("Registrado por Reikland Reavers");
    // …and a side-less system capture has no coach registrar to name.
    const neutral = screen.getByText(/T4\s*•\s*AMBOS EQUIPOS/).closest(
      "article",
    ) as HTMLElement;
    expect(neutral.textContent).toContain("Registro de sistema");
  });
});

describe("ActaTurnTimeline — T18 folder-tab acta rows (design/acta-folder-tabs/01)", () => {
  it("the pase row title says WHAT HAPPENED («Pase») — «+1 SPP» is a consequence and lives only on the bottom-right tab (L60)", () => {
    seqCounter = 0;
    const pass = event({
      kind: "completion",
      side: "home",
      playerRosterId: "h2",
      turnNumber: 5,
      at: STARTED + 40 * MIN,
    });
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [pass], active: { ...liveActive(), turnNumber: 6 } })}
      />,
    );

    const row = document.querySelector(
      '[data-testid="acta-event-row"][data-kind="completion"]',
    ) as HTMLElement;
    const tab = row.querySelector('[data-testid="acta-event-tab"]') as HTMLElement;
    expect(tab.textContent).toBe("Pase");
    // NEVER «+1 SPP» as the title (the old badge) — SPP is a consequence.
    expect(tab.textContent).not.toContain("SPP");
    // The old "+1 SPP" badge text moved onto the SPP tab.
    const sppTab = row.querySelector('[data-testid="acta-event-spp"]') as HTMLElement;
    expect(sppTab).not.toBeNull();
    expect(sppTab.textContent).toContain("+1 SPP");
  });

  it("the SPP tab renders ONLY when earned (a foul earns none)", () => {
    seqCounter = 0;
    const foul = event({
      kind: "foul",
      side: "home",
      playerRosterId: "h1",
      turnNumber: 5,
      at: STARTED + 40 * MIN,
      payload: { victimRosterId: "a2" },
    });
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: [foul], active: { ...liveActive(), turnNumber: 6 } })}
      />,
    );

    const row = document.querySelector(
      '[data-testid="acta-event-row"][data-kind="foul"]',
    ) as HTMLElement;
    expect(row.querySelector('[data-testid="acta-event-spp"]')).toBeNull();
  });

  it("casualty rows split the voices: the attacker mark stays in the body with its badge, the injury roll/consequences live in «Lo que informa quien la recibe» with the receiver's badge (L62)", () => {
    seqCounter = 0;
    render(<ActaTurnTimeline {...timelineProps({ events: [casualtyEvent(true)] })} />);

    const row = document.querySelector(
      '[data-testid="acta-event-row"][data-kind="casualty"]',
    ) as HTMLElement;
    // BODY: «X marca herida a Y» (the causer → victim mark) + the cause + the
    // capture-author badge (T16 derivation, untouched).
    expect(row.textContent).toMatch(/Grashnak Viletooth \(#3\)\s*→\s*Ugluk \(#2\)/);
    expect(row.textContent).toContain("Bloqueo");
    expect(row.textContent).toContain("Registrado por Reikland Reavers");
    // VICTIM-NOTE sub-box (artboard .victim-note): the injury roll + its
    // consequences + the RECEIVER's own recorder badge (event.side = victim).
    const note = row.querySelector('[data-testid="acta-victim-note"]') as HTMLElement;
    expect(note).not.toBeNull();
    expect(note.textContent).toContain("Lo que informa quien la recibe");
    expect(note.textContent).toContain("Tirada 1D16: 9");
    expect(note.textContent).toContain("Apaleado");
    expect(note.textContent).toContain("Registrado por Gouged Eye");
  });

  it("knockdown rows keep the composed chain label AND get the short category tab (Derribo / Ambos derribados)", () => {
    seqCounter = 0;
    const knockdowns = [
      event({
        kind: "knockdown",
        side: "home",
        playerRosterId: "h1",
        turnNumber: 5,
        at: STARTED + 40 * MIN,
        payload: {
          victimRosterId: "a2",
          causerRosterId: "h1",
          face: "defenderDown",
          armourRoll: 11,
          victimAv: 10,
          armourBroken: true,
        },
      }),
      event({
        kind: "knockdown",
        side: "home",
        playerRosterId: "h1",
        turnNumber: 5,
        at: STARTED + 41 * MIN,
        payload: { victimRosterId: "a2", causerRosterId: "h1", face: "bothDown" },
      }),
    ];
    render(
      <ActaTurnTimeline
        {...timelineProps({ events: knockdowns, active: { ...liveActive(), turnNumber: 6 } })}
      />,
    );

    const rows = Array.from(
      document.querySelectorAll('[data-testid="acta-event-row"][data-kind="knockdown"]'),
    ) as HTMLElement[];
    expect(rows).toHaveLength(2);
    // Short category tabs — the chip never steals more width than the text.
    expect(rows[0].querySelector('[data-testid="acta-event-tab"]')!.textContent).toBe("Derribo");
    expect(rows[1].querySelector('[data-testid="acta-event-tab"]')!.textContent).toBe(
      "Ambos derribados",
    );
    // The composed label stays the row's text, byte-identical (demo-harness pin).
    expect(rows[0].textContent).toContain("Derribo · Ar 11 (10+) rota");
  });
});

describe("ActaTurnTimeline — T19 mirror-chat side identity (design/acta-folder-tabs/04)", () => {
  it("home rows sit LEFT (92% hugging the left edge) with a navy who-line «Player · Team» above the description", () => {
    seqCounter = 0;
    render(
      <ActaTurnTimeline
        {...timelineProps({
          events: closedTurnEvents(),
          active: { status: "live", half: 1, turnNumber: 4, activeSide: "home" },
        })}
      />,
    );
    const rows = screen.getAllByTestId("acta-event-row");
    const foulRow = rows.find((r) => r.getAttribute("data-kind") === "foul") as HTMLElement;
    expect(foulRow.className).toContain("w-[92%]");
    expect(foulRow.className).toContain("mr-auto");
    // WHY new (T19, intentional — artboard 04 «Khalid · Águilas»): the short
    // who-line sits above the description and is colored per side (home navy).
    const who = foulRow.querySelector('[data-testid="acta-event-who"]') as HTMLElement;
    expect(who).not.toBeNull();
    expect(who.textContent).toBe("Brunhilda Eisenfaust · Reikland Reavers");
    expect(who.className).toContain("text-navy");
    // The tab keeps design A geometry on home rows (top-left).
    const tab = foulRow.querySelector('[data-testid="acta-event-tab"]') as HTMLElement;
    expect(tab.className).toContain("left-0");
  });

  it("away rows MIRROR: tab top-right (navy — never red), flipped body radius, right-aligned text and a red who-line", () => {
    seqCounter = 0;
    render(<ActaTurnTimeline {...timelineProps({ events: [tdEvent()] })} />);
    const row = screen.getAllByTestId("acta-event-row")[0] as HTMLElement;
    expect(row.className).toContain("w-[92%]");
    expect(row.className).toContain("ml-auto");
    expect(row.className).toContain("text-right");
    const tab = row.querySelector('[data-testid="acta-event-tab"]') as HTMLElement;
    expect(tab.className).toContain("right-0");
    // CRITICAL (L67): the category tab colors stay per design A — navy default,
    // red ONLY for Casualty. The away side identity comes from tab SIDE +
    // alignment + who-line color, never from a red tab.
    expect(tab.className).toContain("bg-navy");
    expect(tab.className).not.toContain("bg-red");
    // Body radius flips (top-right square where the mirrored tab meets it).
    const body = row.querySelector("div") as HTMLElement;
    expect(body.className).toContain("rounded-tl-lg");
    expect(body.className).not.toContain("rounded-tr-lg");
    // Red who-line above the description («Grishnak · Colmillos» shape).
    const who = row.querySelector('[data-testid="acta-event-who"]') as HTMLElement;
    expect(who.textContent).toBe('Morg "El Picador" · Gouged Eye');
    expect(who.className).toContain("text-red");
  });

  it("the casualty who-line speaks for the row's own event side — the VICTIM (LM-12), fixed, never the viewer's side", () => {
    seqCounter = 0;
    render(<ActaTurnTimeline {...timelineProps({ events: [casualtyEvent(true)] })} />);
    const row = screen.getAllByTestId("acta-event-row")[0] as HTMLElement;
    expect(row.className).toContain("ml-auto"); // event.side = away → mirrored
    const who = row.querySelector('[data-testid="acta-event-who"]') as HTMLElement;
    expect(who.textContent).toBe("Ugluk · Gouged Eye");
    expect(who.className).toContain("text-red");
    // The casualty category tab stays RED (design A: red ONLY for Casualty).
    const tab = row.querySelector('[data-testid="acta-event-tab"]') as HTMLElement;
    expect(tab.className).toContain("bg-red");
  });

  it("closed compact rows carry the same side identity: chat offset + per-side name color (home navy / away red)", () => {
    seqCounter = 0;
    render(
      <ActaTurnTimeline
        {...timelineProps({
          events: [tdEvent(), casualtyEvent(true), ...closedTurnEvents()],
          active: { status: "finished", half: 1, turnNumber: 6, activeSide: "away" },
        })}
      />,
    );
    const compact = Array.from(
      document.querySelectorAll('[data-testid="acta-event-row"][data-compact="true"]'),
    ) as HTMLElement[];
    expect(compact.length).toBe(3);
    const homeRow = compact.find((r) => r.getAttribute("data-kind") === "foul") as HTMLElement;
    expect(homeRow.className).toContain("w-[92%]");
    expect(homeRow.className).toContain("mr-auto");
    expect(homeRow.querySelector("strong")!.className).toContain("text-navy");
    const awayRow = compact.find((r) => r.getAttribute("data-kind") === "casualty") as HTMLElement;
    expect(awayRow.className).toContain("ml-auto");
    expect(awayRow.className).toContain("text-right");
    expect(awayRow.className).toContain("flex-row-reverse");
    expect(awayRow.querySelector("strong")!.className).toContain("text-red");
  });
});
