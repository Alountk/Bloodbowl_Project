import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  submitResult,
  type LiveMatchView,
  type MatchDetail,
  type MatchPlayer,
} from "./api";
import { buildResultPrefill } from "./resultPrefill";
import { actaPrefill, buildActaPayload } from "./acta/actaState";
import { ActaClosure, canCloseActa } from "./actaClosure";

/**
 * T5 Slice F (MAW-10 · Single Closure Surface) — the unified closure that runs
 * from the Acta en Vivo sheet on V2. The derived acta comes from the Slice E
 * pipeline (`buildResultPrefill` → `actaPrefill` / `planBajas`) and the surface
 * asks ONLY the missing data (pending casualty rolls, MVP, fan factor/winnings);
 * events captured live are NEVER re-keyed. Submission goes through the EXISTING
 * acta/result path (`buildActaPayload` → `submitResult` → POST /result) with
 * the same request shape and server guards; this suite spies `submitResult` to
 * pin the payload against the derived acta. The MAW-1 visibility guards are
 * mirrored client-side in `canCloseActa` (the server stays authoritative).
 *
 * Assertions run in the ES dictionary (bare `useI18n()` fallback); the closure
 * copy is Spanish per the creation/closure convention.
 */

vi.mock("./api", async (importOriginal) => {
  const original = await importOriginal<typeof import("./api")>();
  return {
    ...original,
    submitResult: vi.fn(() =>
      Promise.resolve({
        fixtureId: "f1",
        status: "played" as const,
        homeScore: 2,
        awayScore: 1,
        winnerId: "t1",
      }),
    ),
  };
});

afterEach(() => {
  vi.clearAllMocks();
});

function player(rosterPlayerId: string, name: string): MatchPlayer {
  return {
    rosterPlayerId,
    name,
    positionalKey: "lineman",
    pe: 0,
    skills: [],
    injuries: [],
    alive: true,
    missNextMatch: false,
    valueBonus: 0,
  };
}

/** The fully captured feed: 2 home TDs, 1 away TD, a completion, a foul and
 *  ONE casualty whose 1D16 is still PENDING (no `roll16` in the payload). */
const CAPTURED_EVENTS: LiveMatchView["events"] = [
  { seq: 1, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 1, payload: {}, at: 1000 },
  { seq: 2, kind: "td", side: "home", playerRosterId: "p2", half: 1, turnNumber: 3, payload: {}, at: 2000 },
  { seq: 3, kind: "td", side: "away", playerRosterId: "p3", half: 1, turnNumber: 4, payload: {}, at: 3000 },
  { seq: 4, kind: "completion", side: "home", playerRosterId: "p1", half: 1, turnNumber: 5, payload: {}, at: 4000 },
  {
    seq: 5,
    kind: "foul",
    side: "home",
    playerRosterId: "p2",
    half: 1,
    turnNumber: 6,
    payload: { victimRosterId: "p4" },
    at: 5000,
  },
  {
    seq: 6,
    kind: "casualty",
    side: "away",
    playerRosterId: "p4",
    half: 1,
    turnNumber: 7,
    payload: { victimRosterId: "p4", causerRosterId: "p2" },
    at: 6000,
  },
];

function finishedLive(overrides: Partial<LiveMatchView> = {}): LiveMatchView {
  return {
    seq: 6,
    status: "finished",
    half: 1,
    turnNumber: 8,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    viewerSide: "home",
    startedAt: 1000,
    elapsed: 600000,
    homeTurnMs: 300000,
    awayTurnMs: 300000,
    paused: false,
    homeScore: 2,
    awayScore: 1,
    finishedAt: 999000,
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null },
    resolutionState: {
      home: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
      away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
    },
    events: CAPTURED_EVENTS,
    ...overrides,
  };
}

function capturedDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    fixture: {
      id: "f1",
      leagueId: "l1",
      round: 4,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: "2026-02-01",
      scheduledAt: "2026-03-01T20:00:00",
      winnerId: null,
      status: "scheduled",
      homeOwner: { id: "u1", name: "Coach A" },
      awayOwner: { id: "u2", name: "Coach B" },
      proposals: [],
    },
    result: null,
    homeTeam: {
      id: "t1",
      name: "Reavers",
      raceId: "human",
      user: { id: "u1", name: "Coach A", email: "a@x", avatar: null },
      players: [player("p1", "Blitzer A"), player("p2", "Lineman B")],
    },
    awayTeam: {
      id: "t2",
      name: "Dwarves",
      raceId: "dwarf",
      user: { id: "u2", name: "Coach B", email: "b@x", avatar: null },
      players: [player("p3", "Blitzer C"), player("p4", "Lineman D")],
    },
    live: finishedLive(),
    liveWinnings: null,
    ...overrides,
  };
}

const LEAGUE = { name: "North Reikland", ownerId: "u1", status: "started" as const };
const PARTICIPANT = { id: "u1", role: "user" };

function renderClosure(
  overrides: Partial<MatchDetail> = {},
  league: typeof LEAGUE = LEAGUE,
  viewer: { id?: string | null; role?: string | null } = PARTICIPANT,
) {
  const detail = capturedDetail(overrides);
  const onClose = vi.fn();
  const onSubmitted = vi.fn(() => Promise.resolve());
  render(
    <ActaClosure detail={detail} league={league} viewer={viewer} onClose={onClose} onSubmitted={onSubmitted} />,
  );
  return { detail, onClose, onSubmitted };
}

/** Fills the fan factor + fan 1D6 inputs for BOTH teams (the closure asks for
 *  them, MAW-2/MAW-7 — blank values are never server-rolled defaults). */
function fillFans() {
  fireEvent.change(screen.getByRole("spinbutton", { name: "Factor fan · Reavers" }), {
    target: { value: "6" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Factor fan · Dwarves" }), {
    target: { value: "4" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Afición · tirada 1D6 · Reavers" }), {
    target: { value: "3" },
  });
  fireEvent.change(screen.getByRole("spinbutton", { name: "Afición · tirada 1D6 · Dwarves" }), {
    target: { value: "5" },
  });
}

describe("MAW-10 · Closure asks only missing data", () => {
  it("GIVEN a fully captured live match with one pending casualty roll and no MVP assigned WHEN the coach closes the match THEN the closure surface asks only for the pending roll, MVP and fans", () => {
    renderClosure();

    // The ONE pending casualty roll (the captured victim, 1D16 unset).
    const rollRow = screen.getByTestId("acta-closure-roll-home-0");
    expect(rollRow.textContent).toContain("Lineman D");
    expect(within(rollRow).getByTestId("roll-stepper-16")).toBeTruthy();

    // MVP assignment for BOTH teams (direct selection, MAW-5).
    expect(screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" })).toBeTruthy();
    expect(screen.getByRole("radio", { name: "MVP · Dwarves · Blitzer C" })).toBeTruthy();

    // Fan factor / winnings inputs: the two FINAL FF values and the two fan
    // 1D6 rolls (winnings themselves are read-only, MAW-7).
    expect(screen.getByRole("spinbutton", { name: "Factor fan · Reavers" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Factor fan · Dwarves" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Afición · tirada 1D6 · Reavers" })).toBeTruthy();
    expect(screen.getByRole("spinbutton", { name: "Afición · tirada 1D6 · Dwarves" })).toBeTruthy();

    // ASKS ONLY those: no other editable field exists anywhere on the surface.
    expect(screen.getAllByRole("spinbutton")).toHaveLength(4);
    expect(screen.queryAllByRole("textbox")).toHaveLength(0);
  });

  it("MAW-10 · no re-entry: captured TD / completion / foul events never appear as editable fields", () => {
    renderClosure();

    // No editable field is named after a captured acta action.
    for (const label of [/anotación/i, /pase completo/i, /falta/i, /intercepción/i, /baja/i, /touchdown/i]) {
      expect(screen.queryByRole("spinbutton", { name: label })).toBeNull();
      expect(screen.queryByRole("textbox", { name: label })).toBeNull();
    }
    // The captured events ride through as the READ-ONLY derived summary only.
    expect(screen.getAllByText(/Anotación/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Pase completo/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/Falta/).length).toBeGreaterThan(0);
    // Exactly the missing-data inputs (FF × 2 + fan 1D6 × 2) are editable.
    expect(screen.getAllByRole("spinbutton")).toHaveLength(4);
    expect(screen.getAllByRole("radio")).toHaveLength(6); // 2 teams × (roster + "Sin MVP")
    // One pending-roll picker (16 chips), never one per captured event.
    expect(screen.getAllByTestId("roll-stepper-16")).toHaveLength(1);
    expect(screen.getByRole("button", { name: "Guardar acta" })).toBeTruthy();
  });

  it("MAW-10 · the result posts from derived data: the submission payload equals the derived acta plus the asked missing data", async () => {
    renderClosure();

    // Fill ONLY the missing data: the pending 1D16, both MVPs, both FFs + fans.
    fireEvent.click(
      within(screen.getByTestId("acta-closure-roll-home-0")).getByTestId("roll-option-8"),
    );
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" }));
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Dwarves · Blitzer C" }));
    fillFans();
    fireEvent.click(screen.getByRole("button", { name: "Guardar acta" }));

    // The expected acta: the Slice E derived pipeline output + the missing data.
    const derived = actaPrefill(buildResultPrefill(finishedLive()));
    const expected = {
      ...derived,
      home: { ...derived.home, mvpGrantee: "p1", ff: 6, fanRoll: 3, injuryRoll: [8] },
      away: { ...derived.away, mvpGrantee: "p3", ff: 4, fanRoll: 5 },
    };

    await waitFor(() =>
      expect(submitResult).toHaveBeenCalledWith("l1", "f1", buildActaPayload(expected)),
    );

    // The captured events ride in the payload untouched (no re-keyed entry).
    const payload = vi.mocked(submitResult).mock.calls[0][2];
    expect(payload.home.players).toEqual(
      expect.arrayContaining([
        {
          rosterPlayerId: "p1",
          tds: 1,
          casualties: 0,
          completions: 1,
          interceptions: 0,
          fouls: 0,
          throwTeamMates: 0,
          landedSafe: 0,
        },
        {
          rosterPlayerId: "p2",
          tds: 1,
          casualties: 1,
          completions: 0,
          interceptions: 0,
          fouls: 1,
          throwTeamMates: 0,
          landedSafe: 0,
        },
      ]),
    );
    expect(payload.away.players).toEqual(
      expect.arrayContaining([
        {
          rosterPlayerId: "p3",
          tds: 1,
          casualties: 0,
          completions: 0,
          interceptions: 0,
          fouls: 0,
          throwTeamMates: 0,
          landedSafe: 0,
        },
      ]),
    );
    // The derived victim + the captured score post without re-entry.
    expect(payload.home.casualties).toEqual([{ team: "away", rosterPlayerId: "p4" }]);
    expect(payload.home.score).toBe(2);
    expect(payload.away.score).toBe(1);
  });

  it("MAW-8 mirror: saving is blocked until the pending roll and BOTH MVPs are entered (visible validation)", () => {
    renderClosure();
    fillFans();

    const save = screen.getByRole("button", { name: "Guardar acta" });
    expect(save.hasAttribute("disabled")).toBe(true);
    // The visible error names the missing MVPs (MAW-8's validation).
    expect(screen.getAllByText("Falta el MVP de Reavers.").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Falta el MVP de Dwarves.").length).toBeGreaterThan(0);

    fireEvent.click(
      within(screen.getByTestId("acta-closure-roll-home-0")).getByTestId("roll-option-8"),
    );
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" }));
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Dwarves · Blitzer C" }));
    expect(screen.getByRole("button", { name: "Guardar acta" }).hasAttribute("disabled")).toBe(false);
    expect(submitResult).not.toHaveBeenCalled();
  });

  it("MAW-10: the asked fan factor + fan 1D6 are REQUIRED — blank values never fall through to the server-rolled defaults", () => {
    renderClosure();

    // Everything except the fans is complete.
    fireEvent.click(
      within(screen.getByTestId("acta-closure-roll-home-0")).getByTestId("roll-option-8"),
    );
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" }));
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Dwarves · Blitzer C" }));

    // Blank FF / fan 1D6 → the save stays blocked with a visible hint (the
    // closure ASKED for this data — the server's ?? rollD6()/preMatchFanFactor
    // fallbacks must never silently resolve it).
    expect(screen.getByRole("button", { name: "Guardar acta" }).hasAttribute("disabled")).toBe(true);
    expect(screen.getByText(/Faltan el Factor fan/)).toBeTruthy();

    fillFans();
    expect(screen.getByRole("button", { name: "Guardar acta" }).hasAttribute("disabled")).toBe(false);
    expect(submitResult).not.toHaveBeenCalled();
  });

  it("MAW-5/RAU-13: a journeyman (Novato) is NEVER offered as MVP — the payload can never carry a journeyman- grantee", () => {
    // The home roster fields a journeyman (synthetic `journeyman-` id, RAU-13).
    const base = capturedDetail();
    renderClosure({
      homeTeam: {
        ...base.homeTeam,
        players: [
          ...base.homeTeam.players,
          {
            ...player("journeyman-t1-1", "Novato Uno"),
            journeyman: true,
          },
        ],
      },
    });

    // The Novato is not an MVP option (the server 400s a journeyman grantee —
    // offering one would dead-end the save), while the roster players are.
    expect(screen.queryByRole("radio", { name: "MVP · Reavers · Novato Uno" })).toBeNull();
    expect(screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" })).toBeTruthy();
    // Only the 6 legitimate options (2× roster + 2× "Sin MVP") — no hidden one.
    expect(screen.getAllByRole("radio")).toHaveLength(6);
  });

  it("triangulate: a permanent-band pending roll asks the 1D6 too and keeps the save blocked until it lands", () => {
    renderClosure();
    fillFans();

    fireEvent.click(
      within(screen.getByTestId("acta-closure-roll-home-0")).getByTestId("roll-option-13"),
    );
    // 13-14 = Permanente → the +1D6 attribute roll appears (MAW-6).
    const rollRow = screen.getByTestId("acta-closure-roll-home-0");
    expect(within(rollRow).getByTestId("roll-stepper-6")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Guardar acta" }).hasAttribute("disabled")).toBe(true);

    fireEvent.click(
      within(within(rollRow).getByTestId("roll-stepper-6")).getByTestId("roll-option-5"),
    );
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" }));
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Dwarves · Blitzer C" }));
    expect(screen.getByRole("button", { name: "Guardar acta" }).hasAttribute("disabled")).toBe(false);
  });

  it("triangulate: a captured 1D16 is never re-asked — only the missing permanent 1D6", () => {
    // The casualty was captured with roll16 = 13 (Permanente) but no 1D6.
    const events = CAPTURED_EVENTS.map((event) =>
      event.kind === "casualty"
        ? { ...event, payload: { ...event.payload, roll16: 13 } }
        : event,
    );
    renderClosure({ live: finishedLive({ events }) });

    const rollRow = screen.getByTestId("acta-closure-roll-home-0");
    // Never re-keyed: no 1D16 picker for a captured roll.
    expect(within(rollRow).queryByTestId("roll-stepper-16")).toBeNull();
    expect(within(rollRow).getByTestId("roll-stepper-6")).toBeTruthy();
    expect(rollRow.textContent).toContain("Permanente");
  });
});

describe("MAW-10 · Guards preserved (MAW-1 mirrors, server stays authoritative)", () => {
  it("GIVEN a fixture that is not playable by the current viewer WHEN the closure surface is requested THEN it is denied exactly as the MAW-1 guards require", () => {
    const detail = capturedDetail();
    const spectator = { id: "u9", role: "user" };
    expect(canCloseActa(detail, LEAGUE, spectator)).toBe(false);

    renderClosure({}, LEAGUE, spectator);

    // Denied: the denial panel renders and the surface asks NOTHING.
    expect(screen.getByTestId("acta-closure-denied")).toBeTruthy();
    expect(screen.queryAllByRole("spinbutton")).toHaveLength(0);
    expect(screen.queryByRole("radio")).toBeNull();
    expect(screen.queryByRole("button", { name: "Guardar acta" })).toBeNull();
    expect(screen.queryByTestId("acta-closure-roll-home-0")).toBeNull();
  });

  it("MAW-1 actor clause: only a participant or an admin may request the closure", () => {
    const detail = capturedDetail();
    // Participant captains (MatchCard's isParticipant).
    expect(canCloseActa(detail, LEAGUE, { id: "u1", role: "user" })).toBe(true);
    expect(canCloseActa(detail, LEAGUE, { id: "u2", role: "user" })).toBe(true);
    // The league owner (admin) even when they captain neither team.
    expect(canCloseActa(detail, { ...LEAGUE, ownerId: "u0" }, { id: "u0", role: "user" })).toBe(true);
    // A `leagues.manage` holder (developer/admin) on any league.
    expect(canCloseActa(detail, { ...LEAGUE, ownerId: "u0" }, { id: "dev", role: "developer" })).toBe(true);
    // A plain member/spectator and an anonymous viewer are denied.
    expect(canCloseActa(detail, LEAGUE, { id: "u9", role: "user" })).toBe(false);
    expect(canCloseActa(detail, LEAGUE, { id: null, role: null })).toBe(false);
    expect(canCloseActa(detail, LEAGUE, {})).toBe(false);
  });

  it("MAW-1 lifecycle clauses: leagueFinished hides everything, live-active hides the result load, a reported fixture is never re-opened", () => {
    const detail = capturedDetail();
    // leagueFinished hides everything (RAU-40).
    expect(canCloseActa(detail, { ...LEAGUE, status: "finished" }, PARTICIPANT)).toBe(false);
    // live-active hides result load (MatchCard `!liveActive`).
    expect(
      canCloseActa({ ...detail, live: finishedLive({ status: "live" }) }, LEAGUE, PARTICIPANT),
    ).toBe(false);
    expect(
      canCloseActa({ ...detail, live: finishedLive({ status: "ready" }) }, LEAGUE, PARTICIPANT),
    ).toBe(false);
    // An already-reported fixture (route 409 "already has a result").
    expect(canCloseActa({ ...detail, result: { ...reportedResult() } }, LEAGUE, PARTICIPANT)).toBe(false);
    // A non-scheduled fixture is not a result-load target either.
    expect(
      canCloseActa(
        { ...detail, fixture: { ...detail.fixture, status: "played" } },
        LEAGUE,
        PARTICIPANT,
      ),
    ).toBe(false);
  });
});

/** Minimal reported-result shape for the already-played guard probe. */
function reportedResult() {
  return {
    id: "mr1",
    fixtureId: "f1",
    weather: "Perfecto",
    scores: {
      home: { score: 2, casualties: [], pe: [] },
      away: { score: 1, casualties: [], pe: [] },
      winnerId: "t1",
    },
    pettyCash: null,
    loadedBy: "u1",
    createdAt: "2026-03-01T21:00:00.000Z",
  };
}
