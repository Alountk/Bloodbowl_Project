import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MatchResolveModal } from "./MatchResolveModal";
import type { LiveMatchView, MatchDetail } from "./api";

/**
 * RAU-51 resolution modal tests: the PER-SIDE end-of-match sequence for a
 * finished live match. Each coach nominates ONLY their own team (dead/suspended
 * players are excluded from the pickers), the rival is a read-only status that
 * never leaks the rival's picks, and "Tirar MVP" is gated on BOTH sides'
 * PERSISTED nominations. The modal exercises the REAL `nominateMvp` /
 * `rollLiveMvp` / `resolveLiveMatch` api wrappers through a stubbed global
 * fetch (repo convention); the server owns the roll — the modal never sends
 * nominations in the roll/resolve bodies.
 */

function player(rosterPlayerId: string, name: string) {
  return { rosterPlayerId, name, positionalKey: "lineman", pe: 0, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 };
}

function sixRoster(prefix: string, namePrefix: string) {
  return Array.from({ length: 6 }, (_, i) => player(`${prefix}${i + 1}`, `${namePrefix}${i + 1}`));
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

afterEach(() => vi.unstubAllGlobals());

/** Picks six distinct nominations for the OWN side's pickers. */
function pickOwnNominations(dialog: HTMLElement) {
  for (let i = 1; i <= 6; i++) {
    const select = within(dialog).getByLabelText(`MVP ${i} ${homeName}`);
    fireEvent.change(select, { target: { value: `h${i}` } });
  }
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
  it("RAU-51: a coach sees ONLY their OWN side's pickers — the rival is a read-only status, never their players", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    for (let i = 1; i <= 6; i++) {
      expect(within(dialog).getByLabelText(`MVP ${i} ${homeName}`)).toBeTruthy();
      expect(within(dialog).queryByLabelText(`MVP ${i} ${awayName}`)).toBeNull();
    }
    // The rival side renders a status only ("El rival aún no ha nominado").
    expect(within(dialog).getByText("El rival aún no ha nominado")).toBeTruthy();
    // The roll is gated on BOTH sides' PERSISTED nominations.
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toHaveProperty("disabled", true);
  });

  it("RAU-51: the roll stays disabled until BOTH sides have submitted; the status flips once the rival did", () => {
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

  it("RAU-51: the roll is enabled once BOTH sides nominated (persisted state)", () => {
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

  it("RAU-51: excludes dead/suspended players from the OWN pickers (RAU-12)", () => {
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
    const options = within(dialog).getByLabelText(`MVP 1 ${homeName}`).querySelectorAll("option");
    const texts = Array.from(options).map((o) => o.textContent);
    expect(texts).toContain("Hugo1");
    expect(texts).not.toContain("Hugo3");
    expect(texts).not.toContain("Hugo4");
  });

  it("RAU-51: 'Guardar mis nominaciones' POSTs nominateMvp for the OWN side and refreshes (onNominated)", async () => {
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
    pickOwnNominations(dialog);
    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar mis nominaciones" }));

    await waitFor(() => expect(onNominated).toHaveBeenCalledTimes(1));
    const nominateCall = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit).body).includes("nominateMvp"),
    );
    expect(nominateCall).toBeTruthy();
    const body = JSON.parse((nominateCall![1] as RequestInit).body as string);
    expect(body).toEqual({ type: "nominateMvp", side: "home", players: homeNom });
  });

  it("rolls the MVP + FF through the server (rollMvp POST with NO nominations body) and reveals the summary", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            view: {},
            roll: { mvp: { home: "h2", away: "a4" }, postFf: { home: 4, away: 3 } },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    renderModal({
      detail: baseDetail({ mvpNominations: { home: homeNom, away: awayNom } }),
    });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    fireEvent.click(within(dialog).getByRole("button", { name: "Tirar MVP" }));

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
    expect(within(homeSection).getByText("+4")).toBeTruthy();
    expect(within(homeSection).getByText("+3 PE · Hugo1")).toBeTruthy();
    expect(within(homeSection).getByText("+7 PE · Hugo2")).toBeTruthy();
    expect(within(homeSection).getByText("+1 PE · Hugo3")).toBeTruthy();

    const awaySection = within(dialog).getByLabelText(awayName);
    expect(within(awaySection).getByText("Aurora4 · +4 PE")).toBeTruthy();
    expect(within(awaySection).getByText("45.000 gp.")).toBeTruthy();
    expect(within(awaySection).getByText("+3")).toBeTruthy();
  });

  it("saves through the resolveMatch POST (no nominations body) and calls onResolved on success", async () => {
    const fetchMock = vi.fn((_url: string, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      if (body.type === "rollMvp") {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ view: {}, roll: { mvp: { home: "h1", away: "a1" }, postFf: { home: 4, away: 3 } } }),
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
    fireEvent.click(within(dialog).getByRole("button", { name: "Tirar MVP" }));
    await waitFor(() => expect(within(dialog).getByText("Guardar y reportar")).toBeTruthy());

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
          json: () => Promise.resolve({ view: {}, roll: { mvp: { home: "h1", away: "a1" }, postFf: { home: 4, away: 3 } } }),
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
    fireEvent.click(within(dialog).getByRole("button", { name: "Tirar MVP" }));
    await waitFor(() => expect(within(dialog).getByText("Guardar y reportar")).toBeTruthy());

    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar y reportar" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toMatch(/Cannot resolve match/),
    );
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("RAU-51: an admin/bye viewer (no side) sees BOTH sides as read-only statuses — no pickers", () => {
    renderModal({
      detail: baseDetail({
        viewerSide: null,
        mvpNominations: { home: homeNom, away: null },
      }),
    });
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    expect(within(dialog).queryByLabelText(`MVP 1 ${homeName}`)).toBeNull();
    expect(within(dialog).getByText("6 jugadores nominados")).toBeTruthy();
    expect(within(dialog).getByText("Pendiente")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toHaveProperty("disabled", true);
  });

  it("renders nothing when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog", { name: "Resolver partido" })).toBeNull();
  });
});
