import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MatchResolveModal } from "./MatchResolveModal";
import type { LiveMatchView, MatchDetail } from "./api";

/**
 * RAU-52 resolution modal tests: the PER-SIDE end-of-match sequence for a
 * finished live match. Each coach nominates ONLY their own team from
 * CHECKBOXES (dead/suspended players excluded), the rulebook MAX (6) is
 * enforced (a 7th player cannot be checked), the send/confirm reaches the
 * rival WITHOUT a reload (the modal polls the persisted detail), and once BOTH
 * sides nominated there is a FINAL confirm ("¿Estás seguro?") with NO going
 * back after it. The modal exercises the REAL `nominateMvp` / `rollLiveMvp` /
 * `resolveLiveMatch` api wrappers through a stubbed global fetch (repo
 * convention); the server owns the roll — the modal never sends nominations in
 * the roll/resolve bodies.
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

function baseDetail(overrides: {
  viewerSide?: "home" | "away" | null;
  mvpNominations?: { home: string[] | null; away: string[] | null };
  homePlayers?: ReturnType<typeof sixRoster>;
} = {}): MatchDetail {
  const { viewerSide = "home", mvpNominations = { home: null, away: null }, homePlayers = sixRoster("h", "Hugo") } = overrides;
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
      pendingCasualty: null,
      mvpNominations,
      events: [
        { seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 },
        { seq: 2, kind: "td", side: "home", playerRosterId: "h1", half: 1, turnNumber: 3, payload: {}, at: 2000 },
        { seq: 3, kind: "td", side: "home", playerRosterId: "h2", half: 1, turnNumber: 4, payload: {}, at: 2500 },
        { seq: 4, kind: "completion", side: "home", playerRosterId: "h3", half: 2, turnNumber: 6, payload: {}, at: 3000 },
        { seq: 5, kind: "endMatch", side: null, playerRosterId: null, half: 2, turnNumber: 8, payload: {}, at: 4000 },
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

/** Checks six distinct OWN-side players via the checkboxes. */
function checkOwnNominations(dialog: HTMLElement) {
  for (let i = 1; i <= 6; i++) {
    fireEvent.click(within(dialog).getByRole("checkbox", { name: homeLabel(`Hugo${i}`, i) }));
  }
}

/** The "Tirar MVP" → "Sí, tirar el MVP" final-confirm path to the summary. */
async function confirmRoll(dialog: HTMLElement) {
  fireEvent.click(within(dialog).getByRole("button", { name: "Tirar MVP" }));
  fireEvent.click(within(dialog).getByRole("button", { name: "Sí, tirar el MVP" }));
  await waitFor(() => expect(within(dialog).getByText("Resumen de la resolución")).toBeTruthy());
}

function renderModal(props: Partial<Parameters<typeof MatchResolveModal>[0]> = {}) {
  const onResolved = vi.fn().mockResolvedValue(undefined);
  const onNominated = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <MatchResolveModal
      open
      detail={baseDetail()}
      onClose={onClose}
      onResolved={onResolved}
      onNominated={onNominated}
      {...props}
    />,
  );
  return { onResolved, onNominated, onClose };
}

describe("MatchResolveModal", () => {
  it("RAU-52: a coach sees ONLY their OWN side's CHECKBOXES — the rival is a read-only status, never their players", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    // CHECKBOXES (not the old numbered <select> pickers).
    expect(dialog.querySelectorAll("select")).toHaveLength(0);
    for (let i = 1; i <= 6; i++) {
      expect(within(dialog).getByRole("checkbox", { name: homeLabel(`Hugo${i}`, i) })).toBeTruthy();
    }
    for (let i = 1; i <= 6; i++) {
      expect(within(dialog).queryByRole("checkbox", { name: new RegExp(`Aurora${i}`) })).toBeNull();
    }
    // The rival side renders a status only ("El rival aún no ha nominado").
    expect(within(dialog).getByText("El rival aún no ha nominado")).toBeTruthy();
    // The roll is gated on BOTH sides' PERSISTED nominations.
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toHaveProperty("disabled", true);
  });

  it("RAU-52: the max (6) is enforced — the 7th alive player cannot be checked", () => {
    const homePlayers = [...sixRoster("h", "Hugo"), player("h7", "Hugo7")];
    renderModal({ detail: baseDetail({ viewerSide: "home", homePlayers }) });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    checkOwnNominations(dialog);
    // The counter reflects the six picks and the 7th checkbox is disabled.
    expect(within(dialog).getByText("6/6 seleccionados")).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: homeLabel("Hugo7", 7) })).toHaveProperty("disabled", true);
    // Un-checking one frees the slot again.
    fireEvent.click(within(dialog).getByRole("checkbox", { name: homeLabel("Hugo1", 1) }));
    expect(within(dialog).getByText("5/6 seleccionados")).toBeTruthy();
    expect(within(dialog).getByRole("checkbox", { name: homeLabel("Hugo7", 7) })).toHaveProperty("disabled", false);
  });

  it("RAU-52: the roll stays disabled until BOTH sides have submitted; the status flips once the rival did", () => {
    renderModal({
      detail: baseDetail({
        viewerSide: "home",
        mvpNominations: { home: homeNom, away: null },
      }),
    });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    expect(within(dialog).getByText("Nominaciones enviadas")).toBeTruthy();
    expect(within(dialog).getByText("El rival aún no ha nominado")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toHaveProperty("disabled", true);
  });

  it("RAU-52: the roll is enabled once BOTH sides nominated (persisted state)", () => {
    renderModal({
      detail: baseDetail({
        viewerSide: "home",
        mvpNominations: { home: homeNom, away: awayNom },
      }),
    });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    expect(within(dialog).getByText("El rival nominó 6 jugadores")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toHaveProperty("disabled", false);
  });

  it("RAU-52: excludes dead/suspended players from the OWN checkboxes (RAU-12)", () => {
    const homePlayers = [
      player("h1", "Hugo1"),
      player("h2", "Hugo2"),
      { ...player("h3", "Hugo3"), alive: false },
      { ...player("h4", "Hugo4"), missNextMatch: true },
      player("h5", "Hugo5"),
      player("h6", "Hugo6"),
      player("h7", "Hugo7"),
    ];
    renderModal({ detail: baseDetail({ viewerSide: "home", homePlayers }) });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    expect(within(dialog).getByRole("checkbox", { name: homeLabel("Hugo1", 1) })).toBeTruthy();
    expect(within(dialog).queryByRole("checkbox", { name: homeLabel("Hugo3", 3) })).toBeNull();
    expect(within(dialog).queryByRole("checkbox", { name: homeLabel("Hugo4", 4) })).toBeNull();
    // RAU-13: the dorsal (served-array index + 1) sits next to the position.
    expect(within(dialog).getByRole("checkbox", { name: homeLabel("Hugo5", 5) })).toBeTruthy();
  });

  it("RAU-13: includes a Journeyman in the OWN checkboxes, labeled Novato (MVP-eligible)", () => {
    const homePlayers = [
      ...sixRoster("h", "Hugo"),
      { ...player("journeyman-th-1", "Aldric"), journeyman: true },
    ];
    renderModal({ detail: baseDetail({ viewerSide: "home", homePlayers }) });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    // The Novato is selectable and keeps the "Novato" marker + its dorsal.
    expect(within(dialog).getByRole("checkbox", { name: "Aldric (Novato · #7)" })).toBeTruthy();
  });

  it("RAU-52: polls the persisted detail while the nomination step is open — the rival's confirmation arrives WITHOUT a reload", () => {
    vi.useFakeTimers();
    const onNominated = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const onResolved = vi.fn().mockResolvedValue(undefined);
    const initial = baseDetail({ viewerSide: "home", mvpNominations: { home: null, away: null } });
    const { rerender } = render(
      <MatchResolveModal open detail={initial} onClose={onClose} onResolved={onResolved} onNominated={onNominated} />,
    );
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    expect(within(dialog).getByText("El rival aún no ha nominado")).toBeTruthy();

    // The next poll tick refreshes the match detail (the send/confirm is
    // persisted server-side — the modal pulls it, the hub can't reach a
    // FINISHED match, hence the poll).
    vi.advanceTimersByTime(4000);
    expect(onNominated).toHaveBeenCalledTimes(1);

    // The refreshed detail carries the rival's confirmation → the modal flips
    // the rival status automatically.
    const withRival = baseDetail({ viewerSide: "home", mvpNominations: { home: null, away: awayNom } });
    rerender(
      <MatchResolveModal open detail={withRival} onClose={onClose} onResolved={onResolved} onNominated={onNominated} />,
    );
    expect(within(screen.getByRole("dialog", { name: "Resolver partido" })).getByText("El rival nominó 6 jugadores")).toBeTruthy();
  });

  it("RAU-52: 'Guardar mis nominaciones' POSTs nominateMvp for the OWN side and refreshes (onNominated)", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      void _url;
      void init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: { seq: 13, mvpNominations: { home: homeNom, away: null } },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onNominated } = renderModal();
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    checkOwnNominations(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar mis nominaciones" }));

    await waitFor(() => expect(onNominated).toHaveBeenCalledTimes(1));
    const nominateCall = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit).body).includes("nominateMvp"),
    );
    expect(nominateCall).toBeTruthy();
    const body = JSON.parse((nominateCall![1] as RequestInit).body as string);
    expect(body).toEqual({ type: "nominateMvp", side: "home", players: homeNom });
  });

  it("RAU-52: once BOTH sides nominated, 'Tirar MVP' arms the FINAL confirm ('¿Estás seguro?') and the roll only fires on 'Sí, tirar el MVP'", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: {},
            roll: {
              mvp: { home: "h2", away: "a4" },
              postFf: { home: 4, away: 3 },
              ffRoll: {
                home: { roll: 4, direction: "up" },
                away: { roll: 3, direction: "stay" },
              },
            },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderModal({
      detail: baseDetail({ mvpNominations: { home: homeNom, away: awayNom } }),
    });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    // First click arms the confirm state — the roll has NOT been called yet.
    fireEvent.click(within(dialog).getByRole("button", { name: "Tirar MVP" }));
    expect(within(dialog).getByText("¿Estás seguro?")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();

    // "Cancelar" disarms back to the roll button.
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancelar" }));
    expect(within(dialog).queryByText("¿Estás seguro?")).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toBeTruthy();

    // "Sí, tirar el MVP" fires the server-owned roll and reveals the summary.
    fireEvent.click(within(dialog).getByRole("button", { name: "Tirar MVP" }));
    fireEvent.click(within(dialog).getByRole("button", { name: "Sí, tirar el MVP" }));
    await waitFor(() =>
      expect(within(dialog).getByText("Resumen de la resolución")).toBeTruthy(),
    );

    // RAU-51: the roll body carries NO nominations — the server rolls from the
    // persisted per-side state.
    const rollCall = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit).body).includes("rollMvp"),
    );
    expect(rollCall).toBeTruthy();
    const body = JSON.parse((rollCall![1] as RequestInit).body as string);
    expect(body).toEqual({ type: "rollMvp" });

    // Summary: MVP winners (h2 / a4, +4 PE), winnings (→ treasury), FF and the
    // PE derived from the events + the MVP grant.
    const homeSection = within(dialog).getByLabelText(homeName);
    expect(within(homeSection).getByText("Hugo2 · +4 PE")).toBeTruthy();
    expect(within(homeSection).getByText("55.000 gp.")).toBeTruthy();
    expect(within(homeSection).getByText("↑ (tirada 4)")).toBeTruthy();
    expect(within(homeSection).getByText("+3 PE · Hugo1")).toBeTruthy();
    expect(within(homeSection).getByText("+7 PE · Hugo2")).toBeTruthy();
    expect(within(homeSection).getByText("+1 PE · Hugo3")).toBeTruthy();

    const awaySection = within(dialog).getByLabelText(awayName);
    expect(within(awaySection).getByText("Aurora4 · +4 PE")).toBeTruthy();
    expect(within(awaySection).getByText("45.000 gp.")).toBeTruthy();
    expect(within(awaySection).getByText("= (tirada 3)")).toBeTruthy();
  });

  it("RAU-52: NO going back after the final confirm — the summary has no 'Cambiar nominaciones'", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: {},
            roll: {
              mvp: { home: "h2", away: "a4" },
              postFf: { home: 4, away: 3 },
              ffRoll: {
                home: { roll: 4, direction: "up" },
                away: { roll: 3, direction: "stay" },
              },
            },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderModal({
      detail: baseDetail({ mvpNominations: { home: homeNom, away: awayNom } }),
    });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    await confirmRoll(dialog);
    // The picks are locked: the summary only offers the closure — no back.
    expect(within(dialog).queryByRole("button", { name: "Cambiar nominaciones" })).toBeNull();
    expect(within(dialog).getByRole("button", { name: "Guardar y reportar" })).toBeTruthy();
  });

  it("saves through the resolveMatch POST (no nominations body) and calls onResolved on success", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.type === "rollMvp") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ view: {}, roll: {
              mvp: { home: "h1", away: "a1" },
              postFf: { home: 4, away: 3 },
              ffRoll: {
                home: { roll: 4, direction: "up" },
                away: { roll: 3, direction: "stay" },
              },
            } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: {},
            resolved: {
              fixtureId: "f1",
              status: "played",
              homeScore: 2,
              awayScore: 1,
              winnerId: "th",
              winnings: { home: 55000, away: 45000 },
              postFf: { home: 4, away: 3 },
              mvp: { home: "h1", away: "a1" },
              resultId: "mr-1",
            },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onResolved } = renderModal({
      detail: baseDetail({ mvpNominations: { home: homeNom, away: awayNom } }),
    });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    await confirmRoll(dialog);

    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar y reportar" }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));

    const resolveCall = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit).body).includes("resolveMatch"),
    );
    expect(resolveCall).toBeTruthy();
    const body = JSON.parse((resolveCall![1] as RequestInit).body as string);
    expect(body).toEqual({ type: "resolveMatch" });
  });

  it("surfaces a resolveMatch rejection (409 already resolved) in the modal and does NOT call onResolved", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.type === "rollMvp") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ view: {}, roll: {
              mvp: { home: "h1", away: "a1" },
              postFf: { home: 4, away: 3 },
              ffRoll: {
                home: { roll: 4, direction: "up" },
                away: { roll: 3, direction: "stay" },
              },
            } }),
        });
      }
      return Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "Cannot resolve match in current state" }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onResolved } = renderModal({
      detail: baseDetail({ mvpNominations: { home: homeNom, away: awayNom } }),
    });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    await confirmRoll(dialog);

    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar y reportar" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toMatch(/Cannot resolve match/),
    );
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("RAU-52: an admin/bye viewer (no side) sees BOTH sides as read-only statuses — no checkboxes", () => {
    renderModal({
      detail: baseDetail({
        viewerSide: null,
        mvpNominations: { home: homeNom, away: null },
      }),
    });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    expect(within(dialog).queryAllByRole("checkbox")).toHaveLength(0);
    expect(within(dialog).getByText("6 jugadores nominados")).toBeTruthy();
    expect(within(dialog).getByText("Pendiente")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toHaveProperty("disabled", true);
  });

  it("RAU-14: the hire step appears AFTER the final save (the LAST step of the sequence) with checkboxes, and the modal closes itself once nothing remains to hire", async () => {
    const detail = baseDetail({
      viewerSide: "home",
      mvpNominations: { home: homeNom, away: awayNom },
    });
    detail.live = {
      ...detail.live!,
      journeymen: { home: [{ id: "journeyman-th-1", name: "Aldric Martillo" }], away: [] },
    };
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.type === "rollMvp") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ view: {}, roll: {
              mvp: { home: "h1", away: "a1" },
              postFf: { home: 4, away: 3 },
              ffRoll: {
                home: { roll: 4, direction: "up" },
                away: { roll: 3, direction: "stay" },
              },
            } }),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: {},
            resolved: {
              fixtureId: "f1",
              status: "played",
              homeScore: 2,
              awayScore: 1,
              winnerId: "th",
              winnings: { home: 55000, away: 45000 },
              postFf: { home: 4, away: 3 },
              mvp: { home: "h1", away: "a1" },
              resultId: "mr-1",
            },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const onResolved = vi.fn().mockResolvedValue(undefined);
    const onNominated = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    const { rerender } = render(
      <MatchResolveModal open detail={detail} onClose={onClose} onResolved={onResolved} onNominated={onNominated} />,
    );
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    await confirmRoll(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar y reportar" }));

    // The resolve committed (refresh fired). The refreshed detail carries the
    // RESULT → the modal advances to the LAST step: the hire step INSIDE the
    // sequence with checkboxes.
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));
    const resolvedDetail = baseDetail({
      viewerSide: "home",
      mvpNominations: { home: homeNom, away: awayNom },
    });
    resolvedDetail.result = {
      id: "mr-1",
      fixtureId: "f1",
      weather: null,
      scores: {
        home: { score: 2, postFf: 4, winnings: 55000, casualties: [], pe: [] },
        away: { score: 1, postFf: 3, winnings: 45000, casualties: [], pe: [] },
        winnerId: "th",
        mvp: { home: "h1", away: "a1" },
      },
      pettyCash: 0,
      loadedBy: "u1",
      createdAt: "2026-03-01T21:00:00.000Z",
    };
    resolvedDetail.live = {
      ...resolvedDetail.live!,
      journeymen: { home: [{ id: "journeyman-th-1", name: "Aldric Martillo" }], away: [] },
    };
    rerender(
      <MatchResolveModal open detail={resolvedDetail} onClose={onClose} onResolved={onResolved} onNominated={onNominated} />,
    );
    const hire = within(dialog).getByTestId("journeymen-hire");
    expect(within(hire).getByRole("checkbox", { name: /Aldric Martillo/ })).toBeTruthy();
    expect(within(hire).getByRole("button", { name: "Contratar marcados" })).toHaveProperty("disabled", true);

    // Once nothing remains to hire (a refresh emptied the journeymen list) the
    // modal closes itself — the resolution sequence is complete.
    resolvedDetail.live = { ...resolvedDetail.live!, journeymen: { home: [], away: [] } };
    rerender(
      <MatchResolveModal open detail={resolvedDetail} onClose={onClose} onResolved={onResolved} onNominated={onNominated} />,
    );
    expect(onClose).toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog", { name: "Resolver partido" })).toBeNull();
  });
});
