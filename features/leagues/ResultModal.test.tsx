import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import {
  ResultModal,
  buildResultPayload,
  type RosterPlayerRef,
  type ResultTeamDraft,
} from "./ResultModal";
import type { FixtureDraft, ResultPayload } from "./api";

/**
 * S3 Result UI — ResultModal. The modal lets a fixture captain or the league
 * admin load a result on a scheduled (not-yet-played) fixture, and lets the
 * admin correct a played result (PUT). It collects home/away scores, per-player
 * PE actions, casualty victims, and six MJP nominations per team; the server
 * owns the 1D6 MJP roll and the per-victim 1D16 injury roll.
 *
 * Assertions use textContent/regex (no jest-dom). The payload assembly is a
 * pure function (`buildResultPayload`) tested directly so the form logic is
 * exercised without rendering the whole modal.
 */

const homeRoster: RosterPlayerRef[] = [
  { id: "h1", name: "Hugo" },
  { id: "h2", name: "Helga" },
];
const awayRoster: RosterPlayerRef[] = [
  { id: "a1", name: "Aurora" },
  { id: "a2", name: "Ansel" },
];

function scheduledFixture(): FixtureDraft {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "th",
    awayTeamId: "ta",
    createdAt: "2026-02-01",
    scheduledAt: "2026-03-01T10:00:00.000Z",
    winnerId: null,
    status: "scheduled",
    homeOwner: { id: "u1", name: "raul" },
    awayOwner: { id: "u2", name: "maria" },
    proposals: [],
  };
}

describe("buildResultPayload", () => {
  const teamDraft = (overrides: Partial<ResultTeamDraft> = {}): ResultTeamDraft => ({
    score: 2,
    ballHeld: true,
    players: {},
    mvpNominations: [],
    casualties: [],
    ...overrides,
  });

  it("maps each drafted player action into the payload players array", () => {
    const payload = buildResultPayload(
      teamDraft({
        players: {
          h1: { tds: 2, casualties: 1, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
          h2: { tds: 0, casualties: 0, completions: 1, interceptions: 0, fouls: 0, throwTeamMates: 1, landedSafe: 1 },
        },
      }),
      teamDraft({ score: 1, players: { a1: { tds: 1, casualties: 0, completions: 0, interceptions: 1, fouls: 1, throwTeamMates: 0, landedSafe: 0 } } }),
    );
    expect(payload.home.players).toHaveLength(2);
    expect(payload.home.players[0]).toMatchObject({ rosterPlayerId: "h1", tds: 2, casualties: 1 });
    expect(payload.home.players[1].tds).toBe(0);
    expect(payload.home.players[1].completions).toBe(1);
    expect(payload.home.players[1].throwTeamMates).toBe(1);
    expect(payload.home.players[1].landedSafe).toBe(1);
    expect(payload.away.players[0].interceptions).toBe(1);
    expect(payload.away.players[0].fouls).toBe(1);
  });

  it("keeps exactly the six MJP nominations and drops empties", () => {
    const payload = buildResultPayload(
      teamDraft({ mvpNominations: ["h1", "h1", "", "h2", "h2", "h1", "h2", ""] }),
      teamDraft({ mvpNominations: [] }),
    );
    expect(payload.home.mvp.nominations.filter((id) => id)).toHaveLength(2);
    expect(payload.home.mvp.nominations).toHaveLength(2);
  });

  it("passes the collected casualty victims through to each team payload", () => {
    const payload = buildResultPayload(
      teamDraft({ casualties: [{ team: "away", rosterPlayerId: "a1" }] }),
      teamDraft({ casualties: [{ team: "home", rosterPlayerId: "h2" }] }),
    );
    expect(payload.home.casualties).toEqual([{ team: "away", rosterPlayerId: "a1" }]);
    expect(payload.away.casualties).toEqual([{ team: "home", rosterPlayerId: "h2" }]);
  });
});

const teamNameById = new Map([
  ["th", "Reavers"],
  ["ta", "Orcs"],
]);

describe("ResultModal", () => {
  function renderModal(props: Partial<Parameters<typeof ResultModal>[0]> = {}) {
    const onSubmit = vi.fn();
    const onClose = vi.fn();
    render(
      <ResultModal
        open
        fixture={scheduledFixture()}
        teamNameById={teamNameById}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
        mode="load"
        onSubmit={onSubmit}
        onClose={onClose}
        {...props}
      />,
    );
    return { onSubmit, onClose };
  }

  it("renders nothing when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("renders score inputs labelled with each team name", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    expect(within(dialog).getByLabelText(/Goles Reavers/)).toBeTruthy();
    expect(within(dialog).getByLabelText(/Goles Orcs/)).toBeTruthy();
  });

  it("renders one per-player row per roster player with the PE action inputs", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    // Every roster player of both teams appears as a row (each name may also
    // appear as an MVP/victim option, so we assert at least one occurrence).
    ["Hugo", "Helga", "Aurora", "Ansel"].forEach((name) =>
      expect(within(dialog).getAllByText(name).length).toBeGreaterThanOrEqual(1),
    );
    // The TTM action fields are present on a player row (lanzar compañero + aterrizar sano).
    expect(within(dialog).getByLabelText(/Anotaciones Hugo/)).toBeTruthy();
    expect(within(dialog).getByLabelText(/Lanzar compañero Hugo/)).toBeTruthy();
    expect(within(dialog).getByLabelText(/Aterrizar sano Hugo/)).toBeTruthy();
  });

  it("shows six numbered MJP nomination slots per team with a server-roll note", () => {
    renderModal();
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    ["1", "2", "3", "4", "5", "6"].forEach((n) => {
      expect(within(dialog).getByLabelText(`MVP ${n} Reavers`)).toBeTruthy();
      expect(within(dialog).getByLabelText(`MVP ${n} Orcs`)).toBeTruthy();
    });
    // The server-roll note appears in each team section.
    expect(within(dialog).getAllByText(/servidor lanza 1D6/).length).toBeGreaterThanOrEqual(1);
  });

  it("assembles a payload and fires onSubmit when the scores match the TDs", () => {
    const { onSubmit } = renderModal({
      homeRoster: [homeRoster[0]],
      awayRoster: [awayRoster[0]],
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    // Home scores 2, Hugo scores 2 → valid. Away scores 0.
    fireEvent.change(within(dialog).getByLabelText(/Goles Reavers/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Anotaciones Hugo/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Goles Orcs/), { target: { value: "0" } });
    // Nominate Hugo as MVP #1 for Reavers.
    fireEvent.change(within(dialog).getByLabelText("MVP 1 Reavers"), { target: { value: "h1" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Guardar resultado/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as ResultPayload;
    expect(payload.home.score).toBe(2);
    expect(payload.home.players[0].tds).toBe(2);
    expect(payload.home.mvp.nominations[0]).toBe("h1");
    // Every roster player appears in the players array.
    expect(payload.home.players).toHaveLength(1);
    expect(payload.away.score).toBe(0);
  });

  it("shows a client-side warning when the TDs do not match the reported score", () => {
    const { onSubmit } = renderModal({
      homeRoster: [homeRoster[0]],
      awayRoster: [awayRoster[0]],
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    // Hugo scores 3 TDs but the reported home score is 2 → mismatch.
    fireEvent.change(within(dialog).getByLabelText(/Goles Reavers/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Anotaciones Hugo/), { target: { value: "3" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Guardar resultado/ }));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("collects casualty victims when a player caused casualties", () => {
    const { onSubmit } = renderModal({
      homeRoster: [homeRoster[0]],
      awayRoster: [awayRoster[0]],
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    fireEvent.change(within(dialog).getByLabelText(/Anotaciones Hugo/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/Goles Reavers/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/Bajas causadas Hugo/), { target: { value: "1" } });
    // The victim area appears because a player caused a casualty; pick Aurora as victim.
    expect(within(dialog).getByText(/Víctimas/)).toBeTruthy();
    const victimSelect = within(dialog).getAllByRole("combobox", { name: /Víctima 1/ })[0];
    fireEvent.change(victimSelect, { target: { value: "away:a1" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Guardar resultado/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as ResultPayload;
    expect(payload.home.casualties).toContainEqual({ team: "away", rosterPlayerId: "a1" });
  });

  it("labels the confirmation button Corregir resultado in correction mode", () => {
    renderModal({ mode: "correct" });
    const dialog = screen.getByRole("dialog", { name: /Corregir resultado/ });
    expect(within(dialog).getByRole("button", { name: /Corregir resultado/ })).toBeTruthy();
  });
});
