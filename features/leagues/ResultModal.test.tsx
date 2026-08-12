import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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

/** A 6-player roster so a submitting test can meet the exact-6 MVP contract. */
function sixRoster(prefix: string): RosterPlayerRef[] {
  return Array.from({ length: 6 }, (_, i) => ({
    id: `${prefix}${i + 1}`,
    name: `${prefix}${i + 1}`,
  }));
}

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

  it("prefills scores + per-scorer TDs from a finished live match as INITIAL state (LM-9)", () => {
    renderModal({
      initial: {
        home: {
          score: 2,
          ballHeld: true,
          players: {
            h1: { tds: 2, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
          },
          mvpNominations: [],
          casualties: [],
        },
        away: {
          score: 1,
          ballHeld: true,
          players: {
            a1: { tds: 1, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 },
          },
          mvpNominations: [],
          casualties: [],
        },
      },
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });

    // Scores prefilled from the live scoreboard.
    expect((within(dialog).getByLabelText(/Goles Reavers/) as HTMLInputElement).value).toBe("2");
    expect((within(dialog).getByLabelText(/Goles Orcs/) as HTMLInputElement).value).toBe("1");

    // Per-scorer TDs prefilled for the TD scorers.
    expect((within(dialog).getByLabelText(/Anotaciones Hugo/) as HTMLInputElement).value).toBe("2");
    expect((within(dialog).getByLabelText(/Anotaciones Aurora/) as HTMLInputElement).value).toBe("1");

    // A non-scorer roster player is NOT pre-filled (TD stays 0/empty).
    const helga = within(dialog).getByLabelText(/Anotaciones Helga/) as HTMLInputElement;
    expect(helga.value === "" || helga.value === "0").toBe(true);
  });

  it("does not apply a prefill through a reset effect — only as initial state", () => {
    // A prefill present at mount is read once; a later closure change must NOT
    // reset the coach's edits. (Guarded by the keyed remount in LeagueDetail.)
    const { onClose } = renderModal({
      initial: {
        home: { score: 1, ballHeld: true, players: {}, mvpNominations: [], casualties: [] },
        away: { score: 0, ballHeld: true, players: {}, mvpNominations: [], casualties: [] },
      },
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    const scoreInput = within(dialog).getByLabelText(/Goles Reavers/) as HTMLInputElement;
    expect(scoreInput.value).toBe("1");
    // Edit the field; the modal keeps the coach's input (no reset).
    fireEvent.change(scoreInput, { target: { value: "3" } });
    expect(scoreInput.value).toBe("3");
    void onClose;
  });

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
      homeRoster: sixRoster("h"),
      awayRoster: sixRoster("a"),
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    // Home scores 2, h1 scores 2 → valid. Away scores 0.
    fireEvent.change(within(dialog).getByLabelText(/Goles Reavers/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Anotaciones h1/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Goles Orcs/), { target: { value: "0" } });
    // Fill the exact-6 MVP contract for both teams (h1 nominated as MVP #1).
    for (let i = 1; i <= 6; i++) {
      fireEvent.change(within(dialog).getByLabelText(`MVP ${i} Reavers`), { target: { value: `h${i}` } });
      fireEvent.change(within(dialog).getByLabelText(`MVP ${i} Orcs`), { target: { value: `a${i}` } });
    }

    fireEvent.click(within(dialog).getByRole("button", { name: /Guardar resultado/ }));

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0] as ResultPayload;
    expect(payload.home.score).toBe(2);
    expect(payload.home.players[0].tds).toBe(2);
    expect(payload.home.players[0].rosterPlayerId).toBe("h1");
    expect(payload.home.mvp.nominations).toHaveLength(6);
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

  it("does not submit and warns when a team nominates fewer than six MVP players", () => {
    const { onSubmit } = renderModal({
      homeRoster: [homeRoster[0], homeRoster[1]],
      awayRoster: [awayRoster[0], awayRoster[1]],
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    // Valid score with matching TDs, but only one of the six MVP slots filled
    // for the home team (the route requires exactly six).
    fireEvent.change(within(dialog).getByLabelText(/Goles Reavers/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/Anotaciones Hugo/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText("MVP 1 Reavers"), { target: { value: "h1" } });

    fireEvent.click(within(dialog).getByRole("button", { name: /Guardar resultado/ }));

    expect(screen.getByRole("alert")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toMatch(/exactamente 6/);
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("collects casualty victims when a player caused casualties", () => {
    const { onSubmit } = renderModal({
      homeRoster: sixRoster("h"),
      awayRoster: sixRoster("a"),
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    fireEvent.change(within(dialog).getByLabelText(/Anotaciones h1/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/Goles Reavers/), { target: { value: "1" } });
    fireEvent.change(within(dialog).getByLabelText(/Bajas causadas h1/), { target: { value: "1" } });
    // The victim area appears because a player caused a casualty; pick a1 as victim.
    expect(within(dialog).getByText(/Víctimas/)).toBeTruthy();
    const victimSelect = within(dialog).getAllByRole("combobox", { name: /Víctima 1/ })[0];
    fireEvent.change(victimSelect, { target: { value: "away:a1" } });
    // Fill the exact-6 MVP contract for both teams.
    for (let i = 1; i <= 6; i++) {
      fireEvent.change(within(dialog).getByLabelText(`MVP ${i} Reavers`), { target: { value: `h${i}` } });
      fireEvent.change(within(dialog).getByLabelText(`MVP ${i} Orcs`), { target: { value: `a${i}` } });
    }

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

  it("keeps the dialog open and shows the server error when onSubmit rejects", async () => {
    const serverSubmit = vi.fn().mockRejectedValue({ status: 409, message: "already played" });
    const { onClose } = renderModal({
      homeRoster: sixRoster("h"),
      awayRoster: sixRoster("a"),
      onSubmit: serverSubmit,
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    fireEvent.change(within(dialog).getByLabelText(/Goles Reavers/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Anotaciones h1/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Goles Orcs/), { target: { value: "0" } });
    for (let i = 1; i <= 6; i++) {
      fireEvent.change(within(dialog).getByLabelText(`MVP ${i} Reavers`), { target: { value: `h${i}` } });
      fireEvent.change(within(dialog).getByLabelText(`MVP ${i} Orcs`), { target: { value: `a${i}` } });
    }

    fireEvent.click(within(dialog).getByRole("button", { name: /Guardar resultado/ }));

    // The rejection surfaces in the existing role=alert; the dialog stays open.
    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(/Ya hay un resultado cargado/),
    );
    expect(screen.getByRole("dialog", { name: /Cargar resultado/ })).toBeTruthy();
    expect(onClose).not.toHaveBeenCalled();
  });

  it("shows no alert when onSubmit resolves", async () => {
    const serverSubmit = vi.fn().mockResolvedValue(undefined);
    const { onClose } = renderModal({
      homeRoster: sixRoster("h"),
      awayRoster: sixRoster("a"),
      onSubmit: serverSubmit,
    });
    const dialog = screen.getByRole("dialog", { name: /Cargar resultado/ });
    fireEvent.change(within(dialog).getByLabelText(/Goles Reavers/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Anotaciones h1/), { target: { value: "2" } });
    fireEvent.change(within(dialog).getByLabelText(/Goles Orcs/), { target: { value: "0" } });
    for (let i = 1; i <= 6; i++) {
      fireEvent.change(within(dialog).getByLabelText(`MVP ${i} Reavers`), { target: { value: `h${i}` } });
      fireEvent.change(within(dialog).getByLabelText(`MVP ${i} Orcs`), { target: { value: `a${i}` } });
    }

    fireEvent.click(within(dialog).getByRole("button", { name: /Guardar resultado/ }));

    await waitFor(() => expect(serverSubmit).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alert")).toBeNull();
    expect(onClose).not.toHaveBeenCalled();
  });
});
