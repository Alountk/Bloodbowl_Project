import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MatchActaWizard } from "../MatchActaWizard";
import type { RosterPlayerRef } from "../MatchResolveModal";
import type { ActaState, ActaTeamDraft } from "./actaState";

/**
 * T6 · G1 — draft persistence for the 7-step acta wizard: typed acta input
 * survives an unmount/remount (the refresh-mid-flow pain point from S3), the
 * draft is cleared on successful submit and on the dialog's dismiss (discard)
 * path, and the form degrades to plain in-memory behavior when storage is
 * unavailable, corrupted, or empty. With no `fixtureId` the wizard keeps the
 * legacy draft-OFF behavior byte-identical.
 *
 * Assertions use value/textContent checks — this repo has no jest-dom matchers.
 */

const homeName = "Águilas de Khemri";
const awayName = "Colmillos del Caos";
const homeRoster: RosterPlayerRef[] = [
  { id: "h1", name: "Khalid el Impávido" },
  { id: "h2", name: "Ushtep el Mensajero" },
];
const awayRoster: RosterPlayerRef[] = [
  { id: "a1", name: "Grishnak Mordaz" },
  { id: "a2", name: "Durburz Puño de Hierro" },
];

function teamDraft(overrides: Partial<ActaTeamDraft> = {}): ActaTeamDraft {
  return {
    neverHeld: false,
    inducements: 0,
    score: 0,
    mvpGrantee: "",
    actions: [],
    fanRoll: null,
    injuryRoll: [],
    permanentRoll: [],
    ...overrides,
  };
}

function tdLine(id: string, rosterPlayerId: string, quantity: number) {
  return { id, rosterPlayerId, kind: "td" as const, quantity };
}

/** A submittable acta (Σ anotaciones == marcador + one MVP per team). */
function seedActa(homeScore = 2): ActaState {
  return {
    weather: "Perfecto",
    home: teamDraft({
      ff: 4,
      score: homeScore,
      mvpGrantee: "h1",
      actions: [tdLine("h", "h1", homeScore)],
    }),
    away: teamDraft({ ff: 3, score: 1, mvpGrantee: "a1", actions: [tdLine("a", "a1", 1)] }),
  };
}

type WizardProps = Partial<Parameters<typeof MatchActaWizard>[0]> & {
  fixtureId?: string;
};

function renderWizard(props: WizardProps = {}) {
  const onClose = vi.fn();
  const utils = render(
    <MatchActaWizard
      open
      mode="load"
      homeName={homeName}
      awayName={awayName}
      homeRoster={homeRoster}
      awayRoster={awayRoster}
      onClose={onClose}
      {...props}
    />,
  );
  return { onClose, ...utils };
}

function next() {
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
}

function typeHomeFf(value: string) {
  fireEvent.change(screen.getByLabelText(`Factor fan · ${homeName}`), {
    target: { value },
  });
}

const keyOf = (fixtureId: string) => `bb-acta-draft:acta:${fixtureId}`;

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("MatchActaWizard draft persistence (T6 · G1)", () => {
  it("typed acta input survives an unmount/remount (refresh mid-flow)", () => {
    const key = keyOf("w-restore");
    const first = renderWizard({ fixtureId: "w-restore" });
    typeHomeFf("5");
    next();
    fireEvent.change(screen.getByLabelText(homeName), { target: { value: "2" } });
    // The draft is written as the input changes, keyed per fixture.
    expect(window.localStorage.getItem(key)).toBeTruthy();
    first.unmount();

    renderWizard({ fixtureId: "w-restore" });
    expect((screen.getByLabelText(`Factor fan · ${homeName}`) as HTMLInputElement).value).toBe("5");
    next();
    expect((screen.getByLabelText(homeName) as HTMLInputElement).value).toBe("2");
  });

  it("clears the draft after a successful submit", async () => {
    const key = keyOf("w-submit");
    const onSubmit = vi.fn(() => Promise.resolve());
    renderWizard({ fixtureId: "w-submit", initial: seedActa(), onSubmit });
    typeHomeFf("7");
    expect(window.localStorage.getItem(key)).toBeTruthy();
    for (let i = 0; i < 6; i += 1) next();
    fireEvent.click(screen.getByRole("button", { name: "Guardar acta" }));
    await waitFor(() => expect(window.localStorage.getItem(key)).toBeNull());
  });

  it("starts FRESH when no draft is stored", () => {
    renderWizard({ fixtureId: "w-fresh" });
    expect((screen.getByLabelText(`Factor fan · ${homeName}`) as HTMLInputElement).value).toBe("");
  });

  it("starts FRESH when the stored draft is corrupted JSON", () => {
    const key = keyOf("w-corrupt");
    window.localStorage.setItem(key, "{definitely not json");
    renderWizard({ fixtureId: "w-corrupt" });
    expect((screen.getByLabelText(`Factor fan · ${homeName}`) as HTMLInputElement).value).toBe("");
    // The corrupted entry is discarded silently, never re-read.
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("keeps working in memory when storage throws (private mode / disabled)", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    renderWizard({ fixtureId: "w-throws" });
    typeHomeFf("5");
    next();
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    // No crash: the typed input is still held in memory by the form.
    expect((screen.getByLabelText(`Factor fan · ${homeName}`) as HTMLInputElement).value).toBe("5");
  });

  it("clears the draft when the dialog is dismissed (discard path)", () => {
    const key = keyOf("w-dismiss");
    const { onClose } = renderWizard({ fixtureId: "w-dismiss" });
    typeHomeFf("5");
    expect(window.localStorage.getItem(key)).toBeTruthy();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("draft OFF (no fixtureId): the legacy wizard never touches storage", () => {
    renderWizard();
    typeHomeFf("5");
    next();
    fireEvent.change(screen.getByLabelText(homeName), { target: { value: "2" } });
    expect(window.localStorage.length).toBe(0);
  });

  it("M5: a FAILED submit keeps the draft — typed answers survive a server error for a retry", async () => {
    const key = keyOf("w-reject");
    const onSubmit = vi.fn(() => Promise.reject(new Error("409 already has a result")));
    renderWizard({ fixtureId: "w-reject", initial: seedActa(), onSubmit });
    typeHomeFf("7");
    expect(window.localStorage.getItem(key)).toBeTruthy();
    for (let i = 0; i < 6; i += 1) next();
    fireEvent.click(screen.getByRole("button", { name: "Guardar acta" }));

    // The rejection surfaces in the alert and the draft stays: the clear runs
    // only on SUCCESS, so a retry after a server error starts fully typed.
    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    const stored = window.localStorage.getItem(key);
    expect(stored).toBeTruthy();
    expect(JSON.parse(stored as string).home.ff).toBe(7);
  });

  it("re-derives untouched seed fields on restore while typed edits come back", () => {
    const key = keyOf("w-derive");
    const first = renderWizard({ fixtureId: "w-derive", initial: seedActa(2) });
    typeHomeFf("7");
    expect(window.localStorage.getItem(key)).toBeTruthy();
    first.unmount();

    // The derivation changed between mounts (new seed): typed input (FF 7)
    // restores, the untouched derived score follows the NEW seed (3).
    renderWizard({ fixtureId: "w-derive", initial: seedActa(3) });
    expect((screen.getByLabelText(`Factor fan · ${homeName}`) as HTMLInputElement).value).toBe("7");
    next();
    expect((screen.getByLabelText(homeName) as HTMLInputElement).value).toBe("3");
  });

  it("stale draft fields (vanished players, impossible values) never leak into the form", () => {
    const key = keyOf("w-stale");
    window.localStorage.setItem(
      key,
      JSON.stringify({
        v: 1,
        form: "acta",
        mode: "load",
        weather: "Tormenta",
        home: {
          ff: 99,
          mvpGrantee: "h9",
          actions: [{ id: "x", rosterPlayerId: "h9", kind: "td", quantity: 1 }],
        },
        rolls: [{ victimTeam: "away", victimRosterPlayerId: "a9", occurrence: 0, injuryRoll: 8 }],
      }),
    );
    renderWizard({ fixtureId: "w-stale" });
    expect((screen.getByLabelText("Clima") as HTMLSelectElement).value).toBe("Perfecto");
    expect((screen.getByLabelText(`Factor fan · ${homeName}`) as HTMLInputElement).value).toBe("");

    // The vanished player never appears as an action line nor as the MVP.
    next();
    next();
    const home = screen.getByRole("region", { name: homeName });
    expect(within(home).queryByLabelText(`Acción 1 · ${homeName}`)).toBeNull();
    next();
    const mvp = screen.getByRole("radio", {
      name: `MVP · ${homeName} · Khalid el Impávido`,
    }) as HTMLInputElement;
    expect(mvp.checked).toBe(false);
  });
});
