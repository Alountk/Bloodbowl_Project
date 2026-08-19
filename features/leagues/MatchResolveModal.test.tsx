import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MatchResolveModal } from "./MatchResolveModal";
import type { LiveMatchView, MatchDetail } from "./api";

/**
 * RAU-49 resolution modal tests: the guided end-of-match sequence for a
 * finished live match. The modal exercises the REAL `rollLiveMvp` /
 * `resolveLiveMatch` api wrappers through a stubbed global fetch (repo
 * convention). MVP is mandatory (the resolve POST rejects without it, so the
 * modal mirrors the contract client-side); the server owns the roll — the
 * modal only sends the six nominations.
 */

function player(rosterPlayerId: string, name: string) {
  return { rosterPlayerId, name, positionalKey: "lineman", pe: 0, skills: [], injuries: [], alive: true, missNextMatch: false, valueBonus: 0 };
}

function sixRoster(prefix: string, namePrefix: string) {
  return Array.from({ length: 6 }, (_, i) => player(`${prefix}${i + 1}`, `${namePrefix}${i + 1}`));
}

function unresolvedDetail(): MatchDetail {
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
      players: sixRoster("h", "Hugo"),
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
      viewerSide: null,
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

afterEach(() => vi.unstubAllGlobals());

/** Picks six distinct nominations for one team's section (index i = player i). */
function pickNominations(dialog: HTMLElement, name: string) {
  for (let i = 1; i <= 6; i++) {
    const select = within(dialog).getByLabelText(`MVP ${i} ${name}`);
    fireEvent.change(select, { target: { value: `${name === homeName ? "h" : "a"}${i}` } });
  }
}

function renderModal(props: Partial<Parameters<typeof MatchResolveModal>[0]> = {}) {
  const onResolved = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(
    <MatchResolveModal
      open
      detail={unresolvedDetail()}
      onClose={onClose}
      onResolved={onResolved}
      {...props}
    />,
  );
  return { onResolved, onClose };
}

describe("MatchResolveModal", () => {
  it("renders the MVP nomination step (6 pickers per team) for a finished-unresolved match", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    for (let i = 1; i <= 6; i++) {
      expect(within(dialog).getByLabelText(`MVP ${i} ${homeName}`)).toBeTruthy();
      expect(within(dialog).getByLabelText(`MVP ${i} ${awayName}`)).toBeTruthy();
    }
    // The roll button is disabled until both teams have six distinct picks.
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toHaveProperty("disabled", true);
  });

  it("keeps the roll button disabled until exactly six distinct nominations per team", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    // Only home picks six; away stays empty → still disabled.
    pickNominations(dialog, homeName);
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toHaveProperty("disabled", true);
    pickNominations(dialog, awayName);
    expect(within(dialog).getByRole("button", { name: "Tirar MVP" })).toHaveProperty("disabled", false);
  });

  it("rolls the MVP + FF through the server (rollMvp POST) and reveals the summary", async () => {
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

    renderModal();
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    pickNominations(dialog, homeName);
    pickNominations(dialog, awayName);
    fireEvent.click(within(dialog).getByRole("button", { name: "Tirar MVP" }));

    await waitFor(() =>
      expect(within(dialog).getByText("Resumen de la resolución")).toBeTruthy(),
    );

    // The roll POST carried only the six nominations (the dice are server-owned).
    const rollCall = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit).body).includes("rollMvp"),
    );
    expect(rollCall).toBeTruthy();
    const body = JSON.parse((rollCall![1] as RequestInit).body as string);
    expect(body.mvp.home).toEqual(["h1", "h2", "h3", "h4", "h5", "h6"]);
    expect(body.mvp.away).toEqual(["a1", "a2", "a3", "a4", "a5", "a6"]);

    // Summary: MVP winners (h2 / a4, +4 PE), winnings (→ treasury), FF and the
    // PE derived from the events + the MVP grant.
    const homeSection = within(dialog).getByLabelText(homeName);
    expect(within(homeSection).getByText("Hugo2 · +4 PE")).toBeTruthy();
    expect(within(homeSection).getByText("55.000 gp.")).toBeTruthy();
    expect(within(homeSection).getByText("+4")).toBeTruthy();
    // h1 (1 TD) +3, h2 (1 TD) +3 plus the +4 MVP = 7, h3 (1 completion) +1.
    expect(within(homeSection).getByText("+3 PE · Hugo1")).toBeTruthy();
    expect(within(homeSection).getByText("+7 PE · Hugo2")).toBeTruthy();
    expect(within(homeSection).getByText("+1 PE · Hugo3")).toBeTruthy();

    const awaySection = within(dialog).getByLabelText(awayName);
    expect(within(awaySection).getByText("Aurora4 · +4 PE")).toBeTruthy();
    expect(within(awaySection).getByText("45.000 gp.")).toBeTruthy();
    expect(within(awaySection).getByText("+3")).toBeTruthy();
  });

  it("saves through the resolveMatch POST and calls onResolved on success", async () => {
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

    const { onResolved } = renderModal();
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    pickNominations(dialog, homeName);
    pickNominations(dialog, awayName);
    fireEvent.click(within(dialog).getByRole("button", { name: "Tirar MVP" }));
    await waitFor(() => expect(within(dialog).getByText("Guardar y reportar")).toBeTruthy());

    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar y reportar" }));
    await waitFor(() => expect(onResolved).toHaveBeenCalledTimes(1));

    const resolveCall = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit).body).includes("resolveMatch"),
    );
    expect(resolveCall).toBeTruthy();
    const body = JSON.parse((resolveCall![1] as RequestInit).body as string);
    expect(body.type).toBe("resolveMatch");
    expect(body.mvp.home).toHaveLength(6);
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

    const { onResolved } = renderModal();
    const dialog = screen.getByRole("dialog", { name: "Resolver partido" });
    pickNominations(dialog, homeName);
    pickNominations(dialog, awayName);
    fireEvent.click(within(dialog).getByRole("button", { name: "Tirar MVP" }));
    await waitFor(() => expect(within(dialog).getByText("Guardar y reportar")).toBeTruthy());

    fireEvent.click(within(dialog).getByRole("button", { name: "Guardar y reportar" }));
    await waitFor(() =>
      expect(within(dialog).getByRole("alert").textContent).toMatch(/Cannot resolve match/),
    );
    expect(onResolved).not.toHaveBeenCalled();
  });

  it("renders nothing when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog", { name: "Resolver partido" })).toBeNull();
  });
});
