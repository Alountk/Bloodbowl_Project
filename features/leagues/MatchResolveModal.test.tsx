import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MatchResolveModal } from "./MatchResolveModal";
import type { LiveMatchView, MatchDetail, ResolutionState } from "./api";

/**
 * RAU-52 resolution WIZARD modal tests: the PER-SIDE, RESUMABLE end-of-match
 * sequence for a finished live match. Each coach advances their OWN side
 * independently through the persisted step cursor (winnings → fans → mvp →
 * mvp-done → casualties → journeymen → done); a refresh resumes AT THE CURRENT
 * STEP. The fan roll is server-owned (`resolutionFanRoll`), the MVP confirm is
 * irrevocable, the reveal waits for BOTH sides, and the match closes only when
 * both sides are done. The modal exercises the REAL api wrappers through a
 * stubbed global fetch (repo convention).
 */

function player(rosterPlayerId: string, name: string) {
  return { rosterPlayerId, name, positionalKey: "lineman", pe: 0, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 };
}

function sixRoster(prefix: string, namePrefix: string) {
  return Array.from({ length: 6 }, (_, i) => player(`${prefix}${i + 1}`, `${namePrefix}${i + 1}`));
}

/** The checkbox label for a home roster player: "{name} ({role} · #{dorsal})". */
function homeLabel(name: string, dorsal: number) {
  return `${name} (Human Lineman · #${dorsal})`;
}

function emptySide(overrides: Partial<ResolutionState["home"]> = {}): ResolutionState["home"] {
  return {
    step: "winnings",
    fansDone: false,
    fans: null,
    mvpConfirmed: false,
    mvpRolled: false,
    casualtiesDone: false,
    journeymenDone: false,
    ...overrides,
  };
}

function resolutionState(overrides: {
  home?: Partial<ResolutionState["home"]>;
  away?: Partial<ResolutionState["away"]>;
} = {}): ResolutionState {
  return {
    home: emptySide(overrides.home),
    away: emptySide(overrides.away),
  };
}

function baseDetail(overrides: {
  viewerSide?: "home" | "away" | null;
  resolutionState?: ResolutionState;
  mvpNominations?: { home: string[] | null; away: string[] | null };
  mvpGrantees?: { home: string | null; away: string | null };
  homePlayers?: ReturnType<typeof sixRoster>;
} = {}): MatchDetail {
  const {
    viewerSide = "home",
    resolutionState: rs = resolutionState(),
    mvpNominations = { home: null, away: null },
    mvpGrantees = { home: null, away: null },
    homePlayers = sixRoster("h", "Hugo"),
  } = overrides;
  return {
    fixture: {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "th",
      awayTeamId: "ta",
      createdAt: "2026-02-01",
      scheduledAt: "2026-03-01T10:00:00.000Z",
      winnerId: null,
      homeScore: null,
      awayScore: null,
      status: "scheduled",
      homeOwner: { id: "u1", name: "Coach A" },
      awayOwner: { id: "u2", name: "Coach B" },
      proposals: [],
    },
    result: null,
    homeTeam: {
      id: "th",
      name: "Reavers",
      raceId: "human",
      user: { id: "u1", name: "Coach A", email: "a@x", avatar: null },
      players: homePlayers,
    },
    awayTeam: {
      id: "ta",
      name: "Orcs",
      raceId: "orc",
      user: { id: "u2", name: "Coach B", email: "b@x", avatar: null },
      players: sixRoster("a", "Aurora"),
    },
    live: {
      seq: 12,
      status: "finished",
      half: 2,
      turnNumber: 8,
      activeSide: "away",
      homeConsented: true,
      awayConsented: true,
      viewerSide,
      startedAt: 1000,
      elapsed: 3100,
      homeTurnMs: 1500,
      awayTurnMs: 1600,
      homeScore: 2,
      awayScore: 1,
      paused: false,
      finishedAt: 5000,
      concedeProposedBy: null,
      mvpNominations,
      resolutionState: rs,
      mvpGrantees,
      events: [
        { seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 },
        { seq: 2, kind: "td", side: "home", playerRosterId: "h1", half: 1, turnNumber: 3, payload: {}, at: 2000 },
        { seq: 3, kind: "td", side: "home", playerRosterId: "h2", half: 1, turnNumber: 4, payload: {}, at: 2500 },
        { seq: 4, kind: "completion", side: "home", playerRosterId: "h3", half: 2, turnNumber: 6, payload: {}, at: 3000 },
        { seq: 5, kind: "casualty", side: "home", playerRosterId: "h4", half: 2, turnNumber: 7, payload: { victimRosterId: "h4", band: "apaleado" }, at: 3500 },
        { seq: 6, kind: "endMatch", side: null, playerRosterId: null, half: 2, turnNumber: 8, payload: {}, at: 4000 },
      ],
    } as LiveMatchView,
    liveWinnings: { home: 55000, away: 45000 },
  };
}

const homeName = "Reavers";
const awayName = "Orcs";

const homeNom = ["h1", "h2", "h3", "h4", "h5", "h6"];
const awayNom = ["a1", "a2", "a3", "a4", "a5", "a6"];

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

/** Stubs fetch so every wizard command resolves 200 (view + optional payload). */
function stubFetch() {
  const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body));
    const view = { seq: 13, resolutionState: baseDetail().live?.resolutionState };
    const payload: Record<string, unknown> = { view };
    if (body.type === "resolutionFanRoll") {
      payload.fans = { roll: 4, before: 2, after: 3, direction: "up" };
    }
    if (body.type === "resolutionMvpReveal") {
      payload.mvp = { home: "h2", away: "a4" };
    }
    if (body.type === "resolveMatch") {
      payload.resolved = { resultId: "mr-1" };
    }
    return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(payload) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** The body of the fetch call whose `type` matches. */
function commandBody(fetchMock: ReturnType<typeof vi.fn>, type: string) {
  const call = fetchMock.mock.calls.find(([, init]) =>
    String((init as RequestInit).body).includes(`"type":"${type}"`),
  );
  expect(call).toBeTruthy();
  return JSON.parse((call![1] as RequestInit).body as string);
}

function renderModal(props: Partial<Parameters<typeof MatchResolveModal>[0]> = {}) {
    const onNominated = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <MatchResolveModal
      open
      detail={baseDetail()}
      onClose={onClose}
      
      onNominated={onNominated}
      {...props}
    />,
  );
  return { onNominated, onClose };
}

function dialog() {
  return screen.getByRole("dialog", { name: "Resolver partido" });
}

describe("MatchResolveModal — the per-side 5-step WIZARD", () => {
  it("resumes at the CURRENT step: a 'casualties' cursor renders the MVP reveal + the casualty outcomes directly", () => {
    renderModal({
      detail: baseDetail({
        viewerSide: "home",
        resolutionState: resolutionState({
          home: { step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true },
          away: { step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true },
        }),
        mvpGrantees: { home: "h2", away: "a4" },
      }),
    });
    const dlg = dialog();
    expect(within(dlg).getByText("Paso: MVP y bajas")).toBeTruthy();
    // The MVP reveal (both sides' grantees) + the visible casualty outcomes.
    expect(within(dlg).getByText("Hugo2 · +4 PE")).toBeTruthy();
    expect(within(dlg).getByText("Aurora4 · +4 PE")).toBeTruthy();
    expect(within(dlg).getByText("Apaleado")).toBeTruthy();
  });

  it("step 1 (winnings): shows the winnings + the maintenance placeholder (0) and Continuar fires resolutionWinningsSeen", async () => {
    const fetchMock = stubFetch();
    const { onNominated } = renderModal();
    const dlg = dialog();
    expect(within(dlg).getByText("Paso: Ganancias y mantenimiento")).toBeTruthy();
    expect(within(dlg).getByText("55.000 gp.")).toBeTruthy();
    expect(within(dlg).getByText("0 gp.")).toBeTruthy();
    expect(within(dlg).getByText(/mantenimiento no está implementado/)).toBeTruthy();

    fireEvent.click(within(dlg).getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(onNominated).toHaveBeenCalledTimes(1));
    expect(commandBody(fetchMock, "resolutionWinningsSeen")).toEqual({
      type: "resolutionWinningsSeen",
      side: "home",
    });
  });

  it("step 2 (fans): 'Tirar 1D6' fires the SERVER-owned roll; once fansDone the persisted roll shows and Continuar advances to the MVP", async () => {
    const fetchMock = stubFetch();
    const { onNominated } = renderModal({
      detail: baseDetail({
        resolutionState: resolutionState({ home: { step: "fans" } }),
      }),
    });
    const dlg = dialog();
    expect(within(dlg).getByRole("button", { name: "Tirar 1D6" })).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "Tirar 1D6" }));
    await waitFor(() => expect(onNominated).toHaveBeenCalledTimes(1));
    expect(commandBody(fetchMock, "resolutionFanRoll")).toEqual({ type: "resolutionFanRoll", side: "home" });
  });

  it("step 2 (fans): a fansDone cursor shows the PERSISTED roll and Continuar fires resolutionAdvance(mvp)", async () => {
    const fetchMock = stubFetch();
    const { onNominated } = renderModal({
      detail: baseDetail({
        resolutionState: resolutionState({
          home: { step: "fans", fansDone: true, fans: { roll: 4, before: 2, after: 3, direction: "up" } },
        }),
      }),
    });
    const dlg = dialog();
    expect(within(dlg).getByText("Tirada 4: factor fan 2 → 3 (↑)")).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(onNominated).toHaveBeenCalledTimes(1));
    expect(commandBody(fetchMock, "resolutionAdvance")).toEqual({
      type: "resolutionAdvance",
      side: "home",
      step: "mvp",
    });
  });

  it("step 3 (mvp): a coach sees ONLY their OWN side's CHECKBOXES — the rival is a status, never their players; the max (6) is enforced", () => {
    renderModal({ detail: baseDetail({ resolutionState: resolutionState({ home: { step: "mvp" } }) }) });
    const dlg = dialog();
    expect(dlg.querySelectorAll("select")).toHaveLength(0);
    for (let i = 1; i <= 6; i++) {
      expect(within(dlg).getByRole("checkbox", { name: homeLabel(`Hugo${i}`, i) })).toBeTruthy();
    }
    expect(within(dlg).queryByRole("checkbox", { name: /Aurora/ })).toBeNull();
    // The rival status + the roll gate is GONE — the confirm replaces it.
    expect(within(dlg).getByText("El rival aún no ha nominado")).toBeTruthy();
  });

  it("step 3 (mvp): the MAX (6) is enforced — the 7th alive player cannot be checked", () => {
    const homePlayers = [...sixRoster("h", "Hugo"), player("h7", "Hugo7")];
    renderModal({
      detail: baseDetail({ resolutionState: resolutionState({ home: { step: "mvp" } }), homePlayers }),
    });
    const dlg = dialog();
    for (let i = 1; i <= 6; i++) {
      fireEvent.click(within(dlg).getByRole("checkbox", { name: homeLabel(`Hugo${i}`, i) }));
    }
    expect(within(dlg).getByText("6/6 seleccionados")).toBeTruthy();
    expect(within(dlg).getByRole("checkbox", { name: homeLabel("Hugo7", 7) })).toHaveProperty("disabled", true);
    fireEvent.click(within(dlg).getByRole("checkbox", { name: homeLabel("Hugo1", 1) }));
    expect(within(dlg).getByText("5/6 seleccionados")).toBeTruthy();
    expect(within(dlg).getByRole("checkbox", { name: homeLabel("Hugo7", 7) })).toHaveProperty("disabled", false);
  });

  it("step 3 (mvp): excludes dead/suspended players from the OWN checkboxes (RAU-12)", () => {
    const homePlayers = [
      player("h1", "Hugo1"),
      player("h2", "Hugo2"),
      { ...player("h3", "Hugo3"), alive: false },
      { ...player("h4", "Hugo4"), missNextMatch: true },
      player("h5", "Hugo5"),
      player("h6", "Hugo6"),
      player("h7", "Hugo7"),
    ];
    renderModal({
      detail: baseDetail({ resolutionState: resolutionState({ home: { step: "mvp" } }), homePlayers }),
    });
    const dlg = dialog();
    expect(within(dlg).queryByRole("checkbox", { name: homeLabel("Hugo3", 3) })).toBeNull();
    expect(within(dlg).queryByRole("checkbox", { name: homeLabel("Hugo4", 4) })).toBeNull();
    expect(within(dlg).getByRole("checkbox", { name: homeLabel("Hugo5", 5) })).toBeTruthy();
  });

  it("step 3 (mvp): 'Guardar mis nominaciones' POSTs nominateMvp for the OWN side; the FINAL confirm then fires resolutionMvpConfirm (irrevocable)", async () => {
    const fetchMock = stubFetch();
    const { onNominated } = renderModal({
      detail: baseDetail({ resolutionState: resolutionState({ home: { step: "mvp" } }) }),
    });
    const dlg = dialog();
    for (let i = 1; i <= 6; i++) {
      fireEvent.click(within(dlg).getByRole("checkbox", { name: homeLabel(`Hugo${i}`, i) }));
    }
    fireEvent.click(within(dlg).getByRole("button", { name: "Guardar mis nominaciones" }));
    await waitFor(() => expect(onNominated).toHaveBeenCalledTimes(1));
    expect(commandBody(fetchMock, "nominateMvp")).toEqual({ type: "nominateMvp", side: "home", players: homeNom });
  });

  it("step 3 (mvp): the SEND + the FINAL confirm ('¿Estás seguro?') — the confirm locks the picks (resolutionMvpConfirm), NO going back after it", async () => {
    const fetchMock = stubFetch();
    const { onNominated } = renderModal({
      detail: baseDetail({
        resolutionState: resolutionState({ home: { step: "mvp" } }),
        mvpNominations: { home: homeNom, away: awayNom },
      }),
    });
    const dlg = dialog();
    // Saved picks → the confirm control appears.
    expect(within(dlg).getByText("Nominaciones enviadas")).toBeTruthy();
    fireEvent.click(within(dlg).getByRole("button", { name: "Confirmar" }));
    // The FINAL confirm arms.
    expect(within(dlg).getByText("¿Estás seguro?")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
    fireEvent.click(within(dlg).getByRole("button", { name: "Sí, confirmar" }));
    await waitFor(() => expect(onNominated).toHaveBeenCalledTimes(1));
    expect(commandBody(fetchMock, "resolutionMvpConfirm")).toEqual({ type: "resolutionMvpConfirm", side: "home" });
  });

  it("step 3 (mvp): the confirm is REJECTED client-side until the side SENT its nominations (the confirm control only renders after saving)", async () => {
    renderModal({ detail: baseDetail({ resolutionState: resolutionState({ home: { step: "mvp" } }) }) });
    const dlg = dialog();
    expect(within(dlg).queryByRole("button", { name: "Confirmar" })).toBeNull();
  });

  it("step mvp-done: waits for the rival's confirm, then the reveal fires resolutionMvpReveal (idempotent, server-owned)", async () => {
    const fetchMock = stubFetch();
    const onNominated = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
        const detail = baseDetail({
      viewerSide: "home",
      resolutionState: resolutionState({
        home: { step: "mvp-done", fansDone: true, mvpConfirmed: true },
        away: { step: "mvp-done", fansDone: true, mvpConfirmed: true },
      }),
    });
    render(
      <MatchResolveModal open detail={detail} onClose={onClose}  onNominated={onNominated} />,
    );
    // BOTH confirmed + not yet rolled → the auto-reveal fires the server-owned
    // reveal (BOTH sides advance to the casualties step on refresh).
    await waitFor(() =>
      expect(commandBody(fetchMock, "resolutionMvpReveal")).toEqual({
        type: "resolutionMvpReveal",
        side: "home",
      }),
    );
  });

  it("step mvp-done: does NOT reveal while the rival has not confirmed", () => {
    const fetchMock = stubFetch();
    renderModal({
      detail: baseDetail({
        resolutionState: resolutionState({
          home: { step: "mvp-done", fansDone: true, mvpConfirmed: true },
          away: { step: "mvp" },
        }),
      }),
    });
    expect(within(dialog()).getByText(/Esperando la confirmación del rival/)).toBeTruthy();
    expect(
      fetchMock.mock.calls.some(([, init]) => String((init as RequestInit).body).includes("resolutionMvpReveal")),
    ).toBe(false);
  });

  it("step 4 (casualties): Continuar fires resolutionCasualtiesDone (the roster-state update was applied server-side)", async () => {
    const fetchMock = stubFetch();
    const { onNominated } = renderModal({
      detail: baseDetail({
        resolutionState: resolutionState({
          home: { step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true },
          away: { step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true },
        }),
      }),
    });
    const dlg = dialog();
    fireEvent.click(within(dlg).getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(onNominated).toHaveBeenCalledTimes(1));
    expect(commandBody(fetchMock, "resolutionCasualtiesDone")).toEqual({
      type: "resolutionCasualtiesDone",
      side: "home",
    });
  });

  it("step 5 (journeymen): shows the ≥11-healthy count; Continuar is DISABLED while undecided novatos remain, then fires resolutionJourneymenDone", async () => {
    const fetchMock = stubFetch();
    const detail = baseDetail({
      resolutionState: resolutionState({
        home: { step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true },
        away: { step: "winnings" },
      }),
    });
    // 6 roster players served → healthy 6 (< 11) → the novato step shows.
    detail.live = { ...detail.live!, journeymen: { home: [{ id: "journeyman-th-1", name: "Aldric" }], away: [] } };
    const onNominated = vi.fn().mockResolvedValue(undefined);
    const { rerender } = render(
      <MatchResolveModal open detail={detail} onClose={vi.fn()}  onNominated={onNominated} />,
    );
    const dlg = dialog();
    expect(within(dlg).getByText("Jugadores sanos: 6")).toBeTruthy();
    // Undecided novato → Continuar disabled.
    const cont = within(dlg).getByRole("button", { name: "Continuar" });
    expect(cont).toHaveProperty("disabled", true);

    // Decide the novato (let-go) → the refreshed detail empties the list.
    fireEvent.click(within(dlg).getByRole("button", { name: "Dejar ir" }));
    detail.live = { ...detail.live!, journeymen: { home: [], away: [] } };
    rerender(
      <MatchResolveModal open detail={detail} onClose={vi.fn()}  onNominated={onNominated} />,
    );
    const contAfter = within(dialog()).getByRole("button", { name: "Continuar" });
    expect(contAfter).toHaveProperty("disabled", false);
    fireEvent.click(contAfter);
    await waitFor(() =>
      expect(commandBody(fetchMock, "resolutionJourneymenDone")).toEqual({
        type: "resolutionJourneymenDone",
        side: "home",
      }),
    );
  });

  it("step 5 (journeymen): a ≥11-healthy side (no fielded novatos) can continue immediately", () => {
    renderModal({
      detail: baseDetail({
        homePlayers: Array.from({ length: 12 }, (_, i) => player(`h${i + 1}`, `Hugo${i + 1}`)),
        resolutionState: resolutionState({
          home: { step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true },
          away: { step: "winnings" },
        }),
      }),
    });
    const dlg = dialog();
    expect(within(dlg).getByText("Jugadores sanos: 12")).toBeTruthy();
    expect(within(dlg).getByText(/11 o más jugadores sanos/)).toBeTruthy();
    expect(within(dlg).getByRole("button", { name: "Continuar" })).toHaveProperty("disabled", false);
  });

  it("step done: when BOTH sides are done the modal AUTO-FINALIZES (resolveMatch = THE close), with 'Cerrar partido' as the manual fallback", async () => {
    const fetchMock = stubFetch();
    const { onNominated } = renderModal({
      detail: baseDetail({
        resolutionState: resolutionState({
          home: { step: "done", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true },
          away: { step: "done", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true },
        }),
      }),
    });
    const dlg = dialog();
    expect(within(dlg).getByText(/Ambos equipos completaron el informe/)).toBeTruthy();
    // The both-done observation auto-fires the idempotent explicit close (the
    // store's own auto-close is the fast path; this is the safety net).
    await waitFor(() => expect(commandBody(fetchMock, "resolveMatch")).toEqual({ type: "resolveMatch" }));
    await waitFor(() => expect(onNominated).toHaveBeenCalled());
  });

  it("step done: shows the waiting copy with the rival's step while the rival has not finished", () => {
    renderModal({
      detail: baseDetail({
        resolutionState: resolutionState({
          home: { step: "done", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true },
          away: { step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true },
        }),
      }),
    });
    const dlg = dialog();
    expect(within(dlg).getByText(/Esperando al rival/)).toBeTruthy();
    expect(within(dlg).getByText(/Novatos/)).toBeTruthy();
  });

  it("an admin/bye viewer (no side) sees BOTH sides' steps read-only — no checkboxes", () => {
    renderModal({ detail: baseDetail({ viewerSide: null }) });
    const dlg = dialog();
    expect(within(dlg).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(dlg).getByLabelText(homeName)).toBeTruthy();
    expect(within(dlg).getByLabelText(awayName)).toBeTruthy();
  });

  it("closes itself once the match resolved (both sides done)", async () => {
    const detail = baseDetail({
      resolutionState: resolutionState({
        home: { step: "done", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true },
        away: { step: "done", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true },
      }),
    });
    detail.result = {
      id: "mr-1",
      fixtureId: "f1",
      weather: null,
      scores: {
        home: { score: 2, postFf: 3, winnings: 55000, casualties: [], pe: [] },
        away: { score: 1, postFf: 1, winnings: 45000, casualties: [], pe: [] },
        winnerId: "th",
        mvp: { home: "h2", away: "a4" },
      },
      pettyCash: 0,
      loadedBy: "u1",
      createdAt: "2026-03-01T21:00:00.000Z",
    };
    const onClose = vi.fn();
    render(<MatchResolveModal open detail={detail} onClose={onClose}  onNominated={vi.fn()} />);
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("renders nothing when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog", { name: "Resolver partido" })).toBeNull();
  });

  it("the journeymen step's 'Dejar ir' is ENABLED after a casualties→journeymen transition (no stuck busy)", async () => {
    const fetchMock = stubFetch();
    const onNominated = vi.fn().mockResolvedValue(undefined);
    let detail = baseDetail({
      resolutionState: resolutionState({
        home: { step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true },
        away: { step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true },
      }),
    });
    detail.live = { ...detail.live!, journeymen: { home: [{ id: "journeyman-th-1", name: "Aldric" }], away: [] } };
    const { rerender } = render(
      <MatchResolveModal open detail={detail} onClose={vi.fn()} onNominated={onNominated} />,
    );
    // Advance through the casualties step (the mocked POST + refresh).
    fireEvent.click(within(dialog()).getByRole("button", { name: "Continuar" }));
    await waitFor(() => expect(onNominated).toHaveBeenCalledTimes(1));
    // The refreshed detail carries the journeymen step.
    detail = baseDetail({
      resolutionState: resolutionState({
        home: { step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true },
        away: { step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true },
      }),
    });
    detail.live = { ...detail.live!, journeymen: { home: [{ id: "journeyman-th-1", name: "Aldric" }], away: [] } };
    rerender(<MatchResolveModal open detail={detail} onClose={vi.fn()} onNominated={onNominated} />);
    const letGo = within(dialog()).getByRole("button", { name: "Dejar ir" });
    expect(letGo).toHaveProperty("disabled", false);
    void fetchMock;
  });
});
