import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import {
  submitResult,
  type LiveMatchView,
  type MatchDetail,
  type MatchPlayer,
} from "./api";
import { ActaClosure } from "./actaClosure";

/**
 * T6 · G1 — draft persistence for the V2 closure surface: the ASKED inputs
 * (pending casualty rolls, MVP, fan factor + fan 1D6) survive a refresh
 * mid-closure, the draft clears on a successful submit, and derived acta parts
 * always re-derive from the live capture — a stale draft value for a field that
 * no longer exists (vanished victim, vanished MVP, junk fields) never leaks.
 * With no `fixtureId` the surface keeps the legacy draft-OFF behavior.
 *
 * Assertions use value/textContent checks — this repo has no jest-dom matchers.
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

/** 2 home TDs, 1 away TD and ONE casualty whose 1D16 is still PENDING. */
function capturedEvents(casualtyRoll16?: number): LiveMatchView["events"] {
  return [
    { seq: 1, kind: "td", side: "home", playerRosterId: "p1", half: 1, turnNumber: 1, payload: {}, at: 1000 },
    { seq: 2, kind: "td", side: "home", playerRosterId: "p2", half: 1, turnNumber: 3, payload: {}, at: 2000 },
    { seq: 3, kind: "td", side: "away", playerRosterId: "p3", half: 1, turnNumber: 4, payload: {}, at: 3000 },
    {
      seq: 4,
      kind: "casualty",
      side: "away",
      playerRosterId: "p4",
      half: 1,
      turnNumber: 7,
      payload: {
        victimRosterId: "p4",
        causerRosterId: "p2",
        ...(casualtyRoll16 != null ? { roll16: casualtyRoll16 } : {}),
      },
      at: 6000,
    },
  ];
}

function finishedLive(events: LiveMatchView["events"]): LiveMatchView {
  return {
    seq: 4,
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
    events,
  };
}

function capturedDetail(casualtyRoll16?: number): MatchDetail {
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
    live: finishedLive(capturedEvents(casualtyRoll16)),
    liveWinnings: null,
  };
}

const LEAGUE = { name: "North Reikland", ownerId: "u1", status: "started" as const };
const PARTICIPANT = { id: "u1", role: "user" };

function renderClosure(
  fixtureId?: string,
  casualtyRoll16?: number,
  onSubmitted: () => void | Promise<void> = () => Promise.resolve(),
) {
  const detail = capturedDetail(casualtyRoll16);
  const onClose = vi.fn();
  const utils = render(
    <ActaClosure
      detail={detail}
      league={LEAGUE}
      viewer={PARTICIPANT}
      onClose={onClose}
      onSubmitted={onSubmitted}
      {...(fixtureId ? { fixtureId } : {})}
    />,
  );
  return { onClose, onSubmitted, ...utils };
}

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

function fillEverything() {
  fireEvent.click(
    within(screen.getByTestId("acta-closure-roll-home-0")).getByTestId("roll-option-8"),
  );
  fireEvent.click(screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" }));
  fireEvent.click(screen.getByRole("radio", { name: "MVP · Dwarves · Blitzer C" }));
  fillFans();
}

const keyOf = (fixtureId: string) => `bb-acta-draft:cierre:${fixtureId}`;

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(submitResult).mockClear();
});

afterEach(() => {
  // Mirror the closure suite's hygiene: clear call history, keep the module
  // mock's implementation (restoreAllMocks would reset vi.fn implementations).
  vi.clearAllMocks();
});

describe("ActaClosure draft persistence (T6 · G1)", () => {
  it("the asked inputs (rolls, MVP, FF, fans) survive an unmount/remount (refresh mid-closure)", async () => {
    const key = keyOf("c-restore");
    const first = renderClosure("c-restore");
    fillEverything();
    // Written on input change, keyed per fixture.
    expect(window.localStorage.getItem(key)).toBeTruthy();
    first.unmount();

    renderClosure("c-restore");
    // The answered roll restores: the pending-roll ask is gone (answered rolls
    // are never re-asked).
    expect(screen.getByText("Sin tiradas pendientes.")).toBeTruthy();
    expect(
      (screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("radio", { name: "MVP · Dwarves · Blitzer C" }) as HTMLInputElement)
        .checked,
    ).toBe(true);
    expect(
      (screen.getByRole("spinbutton", { name: "Factor fan · Reavers" }) as HTMLInputElement)
        .value,
    ).toBe("6");
    expect(
      (screen.getByRole("spinbutton", { name: "Factor fan · Dwarves" }) as HTMLInputElement)
        .value,
    ).toBe("4");
    expect(
      (
        screen.getByRole("spinbutton", {
          name: "Afición · tirada 1D6 · Reavers",
        }) as HTMLInputElement
      ).value,
    ).toBe("3");
    // Everything asked is back → the save block lifts without re-entry, and
    // the restored answers reach the payload exactly as entered.
    expect(
      screen.getByRole("button", { name: "Guardar acta" }).hasAttribute("disabled"),
    ).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Guardar acta" }));
    await waitFor(() => expect(submitResult).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(submitResult).mock.calls[0][2];
    expect(payload.home.injuryRoll).toEqual([8]);
    expect(payload.home.mvp).toEqual({ nominations: [], grantee: "p1" });
    expect(payload.home.ff).toBe(6);
    expect(payload.home.fanRoll).toBe(3);
  });

  it("clears the draft after a successful submit", async () => {
    const key = keyOf("c-submit");
    renderClosure("c-submit");
    fillEverything();
    expect(window.localStorage.getItem(key)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar acta" }));
    await waitFor(() => expect(submitResult).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
  });

  it("stale draft fields never leak: vanished victims, vanished MVPs and junk fields are dropped", () => {
    const key = keyOf("c-stale");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        form: "cierre",
        home: { score: 99, neverHeld: true, mvpGrantee: "p9", ff: 99, fanRoll: 99 },
        away: { score: 99 },
        rolls: [{ victimTeam: "away", victimRosterPlayerId: "p9", occurrence: 0, injuryRoll: 8 }],
      }),
    );
    renderClosure("c-stale");

    // The derived acta still shows the captured score (never the draft's 99).
    const sheet = screen.getByTestId("acta-closure");
    expect(sheet.textContent).toMatch(/Reavers\s+2\s+–\s+1\s+Dwarves/);
    // The vanished victim's roll never presses a chip on the REAL casualty row.
    const roll = within(screen.getByTestId("acta-closure-roll-home-0")).getByTestId(
      "roll-option-8",
    );
    expect(roll.getAttribute("aria-pressed")).toBe("false");
    // The vanished MVP and the impossible FF/fan values never leak.
    expect(
      (screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" }) as HTMLInputElement)
        .checked,
    ).toBe(false);
    expect(
      (screen.getByRole("spinbutton", { name: "Factor fan · Reavers" }) as HTMLInputElement)
        .value,
    ).toBe("");
    // Still asking: the save block remains until real answers land.
    expect(
      screen.getByRole("button", { name: "Guardar acta" }).hasAttribute("disabled"),
    ).toBe(true);
  });

  it("a drafted roll never overrides a captured 1D16 but restores the still-asked 1D6", async () => {
    const key = keyOf("c-captured");
    // Drafted while the casualty was pending: 1D16 = 4 + 1D6 = 5.
    window.localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        form: "cierre",
        away: {},
        home: {},
        rolls: [
          { victimTeam: "away", victimRosterPlayerId: "p4", occurrence: 0, injuryRoll: 4, permanentRoll: 5 },
        ],
      }),
    );
    // The capture meanwhile recorded the real 1D16 = 13 (Permanente).
    renderClosure("c-captured", 13);

    // Nothing is left to ask: the captured 13 stands (the drafted 4 did NOT
    // override it — that would drop the victim out of the permanent band and
    // re-ask a 1D16) and the drafted 5 answered the one pending 1D6 slot.
    expect(screen.queryByTestId("acta-closure-roll-home-0")).toBeNull();
    expect(screen.getByText("Sin tiradas pendientes.")).toBeTruthy();

    // The submission carries exactly that mix.
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Reavers · Blitzer A" }));
    fireEvent.click(screen.getByRole("radio", { name: "MVP · Dwarves · Blitzer C" }));
    fillFans();
    fireEvent.click(screen.getByRole("button", { name: "Guardar acta" }));
    await waitFor(() => expect(submitResult).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(submitResult).mock.calls[0][2];
    expect(payload.home.injuryRoll).toEqual([13]);
    expect(payload.home.permanentRoll).toEqual([5]);
  });

  it("draft OFF (no fixtureId): the legacy closure never touches storage", () => {
    renderClosure();
    fireEvent.click(
      within(screen.getByTestId("acta-closure-roll-home-0")).getByTestId("roll-option-8"),
    );
    fillFans();
    expect(window.localStorage.length).toBe(0);
  });

  it("M1: an edit while the post-submit refresh is pending can never resurrect a cleared draft", async () => {
    const key = keyOf("c-resurrect");
    let resolveRefresh: () => void = () => {};
    const onSubmitted = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveRefresh = resolve;
        }),
    );
    renderClosure("c-resurrect", undefined, onSubmitted);
    fillEverything();
    fireEvent.click(screen.getByRole("button", { name: "Guardar acta" }));

    // The submit succeeded → the draft is cleared while the refresh is pending.
    await waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
    // An edit inside that window (inputs stay enabled — only the save button
    // locks during submit) must NOT write a new draft.
    fireEvent.change(screen.getByRole("spinbutton", { name: "Factor fan · Reavers" }), {
      target: { value: "9" },
    });
    resolveRefresh();
    await waitFor(() => expect(onSubmitted).toHaveBeenCalledTimes(1));
    // The cleared draft must never come back (it would resurrect after a reset).
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("M5: a FAILED submit keeps the draft — answers survive a server error for a retry", async () => {
    const key = keyOf("c-reject");
    vi.mocked(submitResult).mockImplementationOnce(() =>
      Promise.reject(new Error("409 already has a result")),
    );
    renderClosure("c-reject");
    fillEverything();
    expect(window.localStorage.getItem(key)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar acta" }));

    // The failure surfaces (never swallowed) and the draft stays with the
    // typed answers — clear-on-success is the only clear on the submit path.
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const stored = window.localStorage.getItem(key);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).home.ff).toBe(6);
  });

  it("M5: collapsing the surface KEEPS the draft (close is a collapse, not a discard)", () => {
    const key = keyOf("c-collapse");
    const { onClose } = renderClosure("c-collapse");
    fireEvent.change(screen.getByRole("spinbutton", { name: "Factor fan · Reavers" }), {
      target: { value: "6" },
    });
    expect(window.localStorage.getItem(key)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(onClose).toHaveBeenCalledTimes(1);
    // The acta stays derived and the typed answer survives the collapse.
    const stored = window.localStorage.getItem(key);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).home.ff).toBe(6);
  });
});
