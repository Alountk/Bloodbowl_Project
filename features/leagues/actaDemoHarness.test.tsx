import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { ActaDemoHarness } from "./actaDemoHarness";

/**
 * The DUAL-VIEW demo harness behind `/demo/partido` + the Storybook "Flujo
 * interactivo" story: two rival coach perspectives over ONE shared match state
 * (`actaDemoReducer`), with the REAL `LiveActionDock` capture wired in (no
 * omniscient demo buttons) and v3 localStorage persistence (`bb-demo-partido`).
 *
 * Assertions run in the repo's ES dictionary + the demo's Spanish copy (no
 * jest-dom matchers — `.textContent` / regex / role queries only). The TD
 * capture selectors mirror `liveActionDock.test.tsx` (action button → own
 * player chip) so both suites pin the same guided-capture path.
 */

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

const heading = () => screen.getByRole("heading", { level: 1 });
const demoButton = (name: string | RegExp) => screen.getByRole("button", { name });
const perspectiveGroup = () => screen.getByRole("group", { name: "Ver como:" });
const perspective = (team: string) =>
  within(perspectiveGroup()).getByRole("button", { name: team });
const pressed = (team: string) => perspective(team).getAttribute("aria-pressed");

describe("ActaDemoHarness — dual-view demo (perspective, real capture, persistence)", () => {
  it("the perspective control shows both REAL team names and reflects the viewer side", () => {
    render(<ActaDemoHarness />);
    expect(perspective("Águilas de Khemri")).toBeTruthy();
    expect(perspective("Colmillos del Caos")).toBeTruthy();
    // The demo opens as the home coach (the fixture's viewer context).
    expect(pressed("Águilas de Khemri")).toBe("true");
    expect(pressed("Colmillos del Caos")).toBe("false");

    fireEvent.click(perspective("Colmillos del Caos"));
    expect(pressed("Colmillos del Caos")).toBe("true");
    expect(pressed("Águilas de Khemri")).toBe("false");
  });

  it("viewing as the NON-active side shows Solicitar turno and hides the active dock actions; switching back restores them", () => {
    render(<ActaDemoHarness />);
    // 1T turn 3: the home coach is ACTIVE — the full capture dock is up.
    fireEvent.click(demoButton("1T · turno 3"));
    expect(demoButton("+ TD")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Solicitar turno" })).toBeNull();

    // Watch as the rival: request-turn row + only their LM-12-legal records.
    fireEvent.click(perspective("Colmillos del Caos"));
    expect(screen.getByRole("button", { name: "Solicitar turno" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "+ TD" })).toBeNull();
    expect(screen.getByRole("button", { name: /Baja propia/ })).toBeTruthy();

    // Back to the active coach: the full dock is restored.
    fireEvent.click(perspective("Águilas de Khemri"));
    expect(demoButton("+ TD")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Solicitar turno" })).toBeNull();
  });

  it("Fin de turno advances the active-turn badge", () => {
    render(<ActaDemoHarness />);
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();

    fireEvent.click(demoButton("Fin de turno"));
    expect(screen.queryByText(/TURNO 1 EN JUEGO/)).toBeNull();
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
  });

  it("auto-follow moves the perspective on Fin de turno and can be disabled", () => {
    render(<ActaDemoHarness />);
    const follow = screen.getByRole("checkbox", {
      name: "Seguir al turno activo",
    }) as HTMLInputElement;
    expect(follow.checked).toBe(true);

    fireEvent.click(demoButton("1T · turno 3"));
    expect(pressed("Águilas de Khemri")).toBe("true"); // home coach's turn

    fireEvent.click(demoButton("Fin de turno"));
    expect(screen.getByText(/TURNO 4 EN JUEGO/)).toBeTruthy();
    expect(pressed("Colmillos del Caos")).toBe("true"); // camera followed the active side

    fireEvent.click(follow);
    expect(follow.checked).toBe(false);
    fireEvent.click(demoButton("Fin de turno"));
    expect(screen.getByText(/TURNO 5 EN JUEGO/)).toBeTruthy();
    // Perspective no longer dragged along — the viewer is now the non-active
    // coach and gets the request-turn row.
    expect(pressed("Colmillos del Caos")).toBe("true");
    expect(screen.getByRole("button", { name: "Solicitar turno" })).toBeTruthy();
  });

  it("REAL capture: the dock's TD flow advances the header score line and appends an event card", () => {
    render(<ActaDemoHarness />);
    // The kickoff handover puts the home coach in the active turn (auto-follow).
    fireEvent.click(demoButton("Fin de turno"));
    expect(demoButton("+ TD")).toBeTruthy();
    expect(heading().textContent).toBe("Águilas de Khemri 0 - 0 Colmillos del Caos");

    // Two-touch capture, mirroring liveActionDock.test.tsx: action → player chip.
    fireEvent.click(demoButton("+ TD"));
    const modal = screen.getByTestId("live-action-modal");
    fireEvent.click(
      within(within(modal).getByTestId("dock-pool-own")).getByRole("button", {
        name: /#1/i,
      }),
    );
    expect(screen.queryByTestId("live-action-modal")).toBeNull();
    expect(heading().textContent).toBe("Águilas de Khemri 1 - 0 Colmillos del Caos");
    const rows = screen.getAllByTestId("acta-event-row");
    expect(rows.some((row) => row.getAttribute("data-kind") === "td")).toBe(true);
  });

  it("persists the demo state across remounts (v3) and Restablecer returns to kickoff", () => {
    const first = render(<ActaDemoHarness />);
    fireEvent.click(demoButton("Fin de turno"));
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
    const saved = JSON.parse(window.localStorage.getItem("bb-demo-partido") ?? "null") as {
      v: number;
      state: { turnNumber: number };
    } | null;
    expect(saved?.v).toBe(3);
    expect(saved?.state.turnNumber).toBe(2);
    first.unmount();

    render(<ActaDemoHarness />);
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();

    fireEvent.click(demoButton("Restablecer"));
    expect(screen.queryByText(/TURNO 2 EN JUEGO/)).toBeNull();
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();
  });

  it("the scenario chips jump to the named match state", () => {
    render(<ActaDemoHarness />);
    for (const name of ["Inicio", "1T · turno 3", "2T · turno 5", "Finalizado"]) {
      expect(demoButton(name)).toBeTruthy();
    }

    fireEvent.click(demoButton("1T · turno 3"));
    expect(screen.getByText(/TURNO 3 EN JUEGO/)).toBeTruthy();

    fireEvent.click(demoButton("2T · turno 5"));
    expect(screen.getByText(/TURNO 5 EN JUEGO/)).toBeTruthy();

    fireEvent.click(demoButton("Finalizado"));
    expect(screen.queryByText(/EN JUEGO/)).toBeNull();

    fireEvent.click(demoButton("Inicio"));
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();
  });

  it("turn accents and stepper pills tint by team color in the demo flow (S3)", () => {
    const { container } = render(<ActaDemoHarness />);
    fireEvent.click(demoButton("1T · turno 3"));

    // Home is the active coach in this scenario: the LIVE card is navy —
    // the accent is TEAM-coded and no longer encodes the live state.
    const liveCard = container.querySelector(
      '[data-testid="acta-turn-card"][data-turn="3"]',
    );
    expect(liveCard?.className).toContain("border-l-navy");

    fireEvent.click(demoButton("Fin de turno"));

    // Away's turn 4 now: the active pill takes the away team's red background
    // (it used to be navy for every team).
    const activePill = container.querySelector(
      '[data-testid="ui-v2-match-stepper"] [data-turn="4"]',
    );
    expect(activePill?.className).toContain("bg-red");
  });

  it("the closure save shim answers the demo result POST without network and marks the result reported", async () => {
    const passthrough = vi.fn(() =>
      Promise.resolve({ ok: true, status: 200, json: async () => ({}) }),
    );
    vi.stubGlobal("fetch", passthrough);
    render(<ActaDemoHarness />);
    fireEvent.click(demoButton("Finalizado"));
    fireEvent.click(demoButton("Abrir cierre"));
    expect(screen.getByTestId("acta-closure")).toBeTruthy();

    let outcome: { status?: string } = {};
    await act(async () => {
      const res = await window.fetch("/api/leagues/lg-story/fixtures/fx-story-1/result", {
        method: "POST",
        body: "{}",
      });
      outcome = (await res.json()) as { status?: string };
    });
    expect(outcome.status).toBe("played");
    // The POST never left the page; the closure is closed and the banner names
    // the single submitter (the demo stands in for `detail.result`).
    expect(passthrough).not.toHaveBeenCalled();
    expect(screen.queryByTestId("acta-closure")).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir cierre" })).toBeNull();
    expect(screen.getByText(/Resultado reportado por Águilas de Khemri/)).toBeTruthy();

    // Every other request passes through untouched.
    await window.fetch("/api/leagues/otra/ruta", { method: "GET" });
    expect(passthrough).toHaveBeenCalledTimes(1);
    expect(passthrough).toHaveBeenCalledWith("/api/leagues/otra/ruta", { method: "GET" });
  });
});

describe("ActaDemoHarness — pre-match surface (stale saves, header wiring)", () => {
  it("a STALE v1 save never wipes the kickoff pre-match data on load", () => {
    // A save from BEFORE the kickoff events existed: it passes the v1 shape
    // guard (events array + status string) but carries no kickoff trio.
    window.localStorage.setItem(
      "bb-demo-partido",
      JSON.stringify({
        v: 1,
        state: {
          events: [
            {
              seq: 1,
              kind: "start",
              side: null,
              playerRosterId: null,
              half: 1,
              turnNumber: 1,
              payload: {},
              at: 0,
            },
          ],
          status: "live",
          half: 1,
          turnNumber: 1,
          activeSide: "home",
          viewerSide: "home",
          nextSeq: 100,
          closureOpen: false,
          autoFollow: true,
          submittedBy: null,
        },
      }),
    );
    render(<ActaDemoHarness />);
    // The kickoff trio (clima + factor de aficionados) must survive the load.
    expect(screen.queryAllByText(/Factor de aficionados/).length).toBeGreaterThan(0);
    // The weather card's tag renders exactly «Clima» (no trailing period).
    expect(screen.queryAllByText(/^Clima$/).length).toBeGreaterThan(0);
  });

  it("the header surfaces the pre-match data: inducements, fan factor and the weather roll", () => {
    const { container } = render(<ActaDemoHarness />);
    expect(
      screen.queryAllByText(/Inducements: Sobornos ×1 — 100\.000 M\.O\. \(máx\. 3\)/).length,
    ).toBeGreaterThan(0);
    expect(
      screen.queryAllByText(/Inducements: Mago del Clima ×1 — 25\.000 M\.O\. \(máx\. 1\)/).length,
    ).toBeGreaterThan(0);
    // The fan-factor line ends in <b>{total}</b> and the weather line wraps its
    // value in <strong> — `queryAllByText` only reads an element's DIRECT text
    // nodes, so these two split-text lines assert via `.textContent` (the
    // `actaSheetHeader.test.tsx` convention for these exact strings).
    expect(container.textContent).toContain("Afición: 4 + 🎲3 = 7");
    expect(container.textContent).toContain("Clima: tirada 4 → Perfecto");
  });
});
