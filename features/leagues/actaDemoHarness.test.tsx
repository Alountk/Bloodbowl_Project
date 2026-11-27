import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from "@testing-library/react";

import { ActaDemoHarness } from "./actaDemoHarness";
import { demoState } from "./actaDemoReducer";
import { BASE, MIN } from "./actaFlow.fixtures";

// Deterministic dice for die-button rolls (S3 · T4 kickoff walk): a per-test
// queue, defaulting to the wizard's classic 2/5 demo rolls.
const dice = vi.hoisted(() => ({ queue: [] as number[] }));
vi.mock("@/lib/random", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/random")>();
  return {
    ...actual,
    rollD3: () => dice.queue.shift() ?? 2,
    rollD6: () => dice.queue.shift() ?? 5,
    rollD16: () => dice.queue.shift() ?? 10,
  };
});

/**
 * The DUAL-VIEW demo harness behind `/demo/partido` + the Storybook "Flujo
 * interactivo" story: two rival coach perspectives over ONE shared match state
 * (`actaDemoReducer`), with the REAL `LiveActionDock` capture wired in (no
 * omniscient demo buttons) and v5 localStorage persistence (`bb-demo-partido`).
 *
 * Assertions run in the repo's ES dictionary + the demo's Spanish copy (no
 * jest-dom matchers — `.textContent` / regex / role queries only). The TD
 * capture selectors mirror `liveActionDock.test.tsx` (action button → own
 * player chip) so both suites pin the same guided-capture path.
 */

beforeEach(() => {
  window.localStorage.clear();
  dice.queue = [];
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

  it("viewing as the NON-active side hides the active dock actions and shows no request-turn UI; switching back restores them", () => {
    render(<ActaDemoHarness />);
    // The narrative fixture opens in AWAY's turn: watching as home (the
    // NON-active side) shows no capture actions, and no request-turn UI
    // (deprecated) — only the LM-12-legal records.
    expect(screen.queryByRole("button", { name: "+ TD" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar turno" })).toBeNull();

    // Watch as the ACTIVE coach: the full capture dock is up.
    fireEvent.click(perspective("Colmillos del Caos"));
    expect(demoButton("+ TD")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Solicitar turno" })).toBeNull();

    // Back to the non-active coach: the capture dock is gone again.
    fireEvent.click(perspective("Águilas de Khemri"));
    expect(screen.queryByRole("button", { name: "+ TD" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Solicitar turno" })).toBeNull();
  });

  // PARKED (intentional harness cleanup): the omniscient «Fin de turno»
  // control is gone from the demo — turn advance UI is out of scope for now.
  it.skip("Fin de turno advances the active-turn badge", () => {
    render(<ActaDemoHarness />);
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();

    fireEvent.click(demoButton("Fin de turno"));
    expect(screen.queryByText(/TURNO 1 EN JUEGO/)).toBeNull();
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
  });

  // PARKED (intentional harness cleanup): the «Seguir al turno activo»
  // control is gone together with «Fin de turno».
  it.skip("auto-follow moves the perspective on Fin de turno and can be disabled", () => {
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
    // The request-turn UI is gone (deprecated): the perspective switch is
    // evidenced by the pressed state above.
    expect(screen.queryByRole("button", { name: "Solicitar turno" })).toBeNull();
  });

  it("REAL capture: the dock's TD flow advances the header score line and appends an event card", () => {
    render(<ActaDemoHarness />);
    // The narrative fixture opens in AWAY's turn: capture as the active coach.
    fireEvent.click(perspective("Colmillos del Caos"));
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
    expect(heading().textContent).toBe("Águilas de Khemri 0 - 1 Colmillos del Caos");
    const rows = screen.getAllByTestId("acta-event-row");
    expect(rows.some((row) => row.getAttribute("data-kind") === "td")).toBe(true);
  });

  it("persists the demo state across remounts (v5) and Restablecer returns to a fresh match", () => {
    const first = render(<ActaDemoHarness />);
    // A real dock capture is the persistence witness (the omniscient turn
    // controls are gone from the harness). The fixture opens in AWAY's turn.
    fireEvent.click(perspective("Colmillos del Caos"));
    fireEvent.click(demoButton("+ TD"));
    const modal = screen.getByTestId("live-action-modal");
    fireEvent.click(
      within(within(modal).getByTestId("dock-pool-own")).getByRole("button", {
        name: /#1/i,
      }),
    );
    expect(heading().textContent).toBe(
      "Águilas de Khemri 0 - 1 Colmillos del Caos",
    );
    const saved = JSON.parse(
      window.localStorage.getItem("bb-demo-partido") ?? "null",
    ) as {
      v: number;
      state: { events: Array<{ kind?: string }> };
    } | null;
    expect(saved?.v).toBe(5);
    expect(saved?.state.events.some((ev) => ev.kind === "td")).toBe(true);
    first.unmount();

    render(<ActaDemoHarness />);
    expect(heading().textContent).toBe(
      "Águilas de Khemri 0 - 1 Colmillos del Caos",
    );

    fireEvent.click(demoButton("Restablecer"));
    expect(heading().textContent).toBe(
      "Águilas de Khemri 0 - 0 Colmillos del Caos",
    );
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();
  });

  // PARKED (intentional harness cleanup): the omniscient scenario chips are
  // gone from the demo — the reducer presets stay but have no UI right now.
  it.skip("the scenario chips jump to the named match state", () => {
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

  it("Restablecer opens the pre-match wizard modal", () => {
    render(<ActaDemoHarness />);
    expect(
      screen.queryByRole("dialog", { name: "Antes del partido" }),
    ).toBeNull();

    fireEvent.click(demoButton("Restablecer"));
    expect(
      screen.getByRole("dialog", { name: "Antes del partido" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(
      screen.queryByRole("dialog", { name: "Antes del partido" }),
    ).toBeNull();
  });

  it("Restablecer starts the pre-match from scratch: wizard at Paso 1 and a clean acta", () => {
    render(<ActaDemoHarness />);
    // The fixture narrative pre-captures both coaches' rolls.
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲3 = 7/);
    expect(document.body.textContent).toMatch(/Sobornos ×1/);

    fireEvent.click(demoButton("Restablecer"));
    // The wizard opens at the very first step (empty capture)…
    expect(screen.getByRole("button", { name: "Tirar 1D3" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Avanzar al Clima" })).toBeTruthy();
    // …and the acta holds no pre-match facts until they are captured again.
    expect(document.body.textContent).not.toMatch(/Afición: 4 \+ 🎲3 = 7/);
    expect(document.body.textContent).not.toMatch(/Sobornos ×1/);
    const fresh = screen.getByRole("region", { name: "Lo que ha sucedido" });
    expect(fresh.textContent).toContain("Aún no hay nada confirmado.");
  });

  it("the pre-match wizard modal fills the screen and scrolls on its own", () => {
    render(<ActaDemoHarness />);
    fireEvent.click(demoButton("Restablecer"));
    const dialog = screen.getByRole("dialog", { name: "Antes del partido" });
    // Full-screen frame (the close button is the way out) + a scrollable body:
    // long steps (the inducement table) scroll INSIDE the modal.
    expect(dialog.className).toMatch(/h-full/);
    expect(dialog.querySelector(".overflow-y-auto")).toBeTruthy();
  });

  it("the turn timeline shows only when the match has really started", () => {
    render(<ActaDemoHarness />);
    // The fixture narrative is a match underway → its turn timeline is there.
    expect(screen.getByTestId("acta-turn-timeline")).toBeTruthy();
    fireEvent.click(demoButton("Restablecer"));
    // A fresh match (pre-match pending) shows no turn timeline yet — only the
    // «Antes del partido» section to complete it.
    expect(screen.queryByTestId("acta-turn-timeline")).toBeNull();
  });

  it("the «Partido» heading shows only when the match has really started", () => {
    render(<ActaDemoHarness />);
    expect(screen.queryByRole("heading", { name: "Partido", level: 2 })).toBeTruthy();
    fireEvent.click(demoButton("Restablecer"));
    // A fresh match (pre-match pending) shows no «Partido» section title yet.
    expect(screen.queryByRole("heading", { name: "Partido", level: 2 })).toBeNull();
  });

  it("«Antes del partido» closes the newest-first chronology: it renders below the match timeline", () => {
    render(<ActaDemoHarness />);
    const timeline = screen.getByTestId("acta-turn-timeline");
    const preMatch = screen.getByRole("region", { name: "Antes del partido" });
    expect(
      timeline.compareDocumentPosition(preMatch) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
  });

  it("the «Solicitar turno» button is gone from the view: the flow is deprecated (face-to-face play)", () => {
    render(<ActaDemoHarness />);
    fireEvent.click(perspective("Colmillos del Caos"));
    // Deprecated for face-to-face play: the request-turn UI is not rendered at
    // all (the flow behind is marked @deprecated in code).
    expect(screen.queryByRole("button", { name: "Solicitar turno" })).toBeNull();
  });

  it("the dock action bar shows only when the match has really started", () => {
    render(<ActaDemoHarness />);
    // The fixture narrative is a match underway → the capture actions are there.
    expect(screen.getByTestId("acta-capture-grid")).toBeTruthy();
    fireEvent.click(demoButton("Restablecer"));
    // A fresh match (pre-match pending) shows no in-game actions yet.
    expect(screen.queryByTestId("acta-capture-grid")).toBeNull();
  });

  // PARKED (intentional harness cleanup): the mid-match preset chips are gone
  // from the demo together with the rest of the scenario jump UI.
  it.skip("mid-match preset chips keep their direct jump (no wizard modal)", () => {
    render(<ActaDemoHarness />);
    fireEvent.click(demoButton("2T · turno 5"));
    expect(
      screen.queryByRole("dialog", { name: "Antes del partido" }),
    ).toBeNull();
    expect(screen.getByText(/TURNO 5 EN JUEGO/)).toBeTruthy();
  });

  // PARKED (intentional harness cleanup): reaching turns 3-4 needs the chip
  // jump / «Fin de turno» controls, which are gone from the harness.
  it.skip("turn accents and stepper pills tint by team color in the demo flow (S3)", () => {
    const { container } = render(<ActaDemoHarness />);
    fireEvent.click(demoButton("1T · turno 3"));

    // Home is the active coach in this scenario: the LIVE group's bubbles are
    // navy — the accent is TEAM-coded and no longer encodes the live state
    // (T3: the transparent group chrome carries no accent of its own).
    const liveCard = container.querySelector(
      '[data-testid="acta-turn-card"][data-turn="3"]',
    );
    expect(
      liveCard?.querySelector('[data-testid="acta-event-row"]')?.className,
    ).toContain("border-l-navy");

    fireEvent.click(demoButton("Fin de turno"));

    // Away's turn 4 now: the active pill takes the away team's red background
    // (it used to be navy for every team).
    const activePill = container.querySelector(
      '[data-testid="ui-v2-match-stepper"] [data-turn="4"]',
    );
    expect(activePill?.className).toContain("bg-red");
  });

  // PARKED (intentional harness cleanup): the «Finalizado» scenario chip is
  // still gone from the harness — the «Abrir cierre» entry point is BACK
  // (T22), so un-parking only needs a seeded finished state instead of the
  // chip; the T14 tests already walk this save shim through the real form.
  it.skip("the closure save shim answers the demo result POST without network and marks the result reported", async () => {
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
    const { container } = render(<ActaDemoHarness />);
    // S1: the trio survives the load — surfaced by the header and the
    // «Antes del partido» block; the timeline no longer renders pre-match rows.
    expect(container.textContent).toContain("Afición: 4 + 🎲3 = 7");
    expect(ante().textContent).toMatch(/Afición/);
    expect(ante().textContent).toMatch(/Clima/);
    expect(screen.queryAllByText(/Factor de aficionados/).length).toBe(0);
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

/**
 * T9 · L39 — the kickoff is OUT of the demo flow: «…omitiremos la patada
 * inicial, eso se hara de manera externa». After the pre-match sequence and
 * the «quién recibe» pick the match starts DIRECTLY in turn 1 with the
 * RECEIVING team active — no kickoff gate step and NO kickoff rows on the
 * acta. The S3 kickoff machinery (gate, 2D6 table, duel) stays in the
 * codebase as reversible infrastructure, never reached by the flow.
 */
const ante = () => screen.getByRole("region", { name: "Antes del partido" });
const wizard = () => screen.getByRole("dialog", { name: "Antes del partido" });
const openWizard = () =>
  fireEvent.click(
    within(ante()).getByRole("button", { name: /secuencia pre-partido/ }),
  );

/** The four wizard steps as ONE coach (dice come from the queue). */
const walkSequence = () => {
  fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D3" }));
  fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
  fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D6" }));
  fireEvent.click(screen.getByRole("button", { name: "Avanzar a Incentivos" }));
  fireEvent.click(
    screen.getByRole("button", { name: "Avanzar al Equipo pateador" }),
  );
  fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D6" }));
  fireEvent.click(screen.getByRole("button", { name: "Finalizar" }));
};

describe("ActaDemoHarness — T9: the kickoff stays OUT of the flow (L39)", () => {
  it("the narrative fixture starts past kickoff: NO gate, the timeline is up", () => {
    render(<ActaDemoHarness />);
    expect(screen.queryByTestId("acta-kickoff-gate")).toBeNull();
    expect(screen.getByTestId("acta-turn-timeline")).toBeTruthy();
  });

  it("after the receiver is confirmed the match starts DIRECTLY in turn 1 with the receiver active (no gate, no kickoff events)", () => {
    // Home (fan 2D3, weather 4, toss 6) then away (fan 1, weather 5, toss 3):
    // the home coach wins the toss 6 vs 3.
    dice.queue = [2, 4, 6, 1, 5, 3];
    render(<ActaDemoHarness />);
    fireEvent.click(demoButton("Restablecer"));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    openWizard();
    walkSequence(); // home done → the waiting screen.
    fireEvent.click(perspective("Colmillos del Caos"));
    openWizard();
    walkSequence(); // away done → both sequences complete.
    // The toss WINNER (home) picks who receives → the match starts.
    fireEvent.click(perspective("Águilas de Khemri"));
    fireEvent.click(
      screen.getByRole("radio", { name: "Recibe Colmillos del Caos" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));

    // NO kickoff gate step: the initial kick is resolved externally (L39).
    expect(screen.queryByRole("region", { name: "Patada inicial" })).toBeNull();
    expect(screen.queryByTestId("acta-kickoff-gate")).toBeNull();
    // NO kickoff events in the acta («Kickoff · …» was the gate rows' copy).
    expect(document.body.textContent).not.toMatch(/Kickoff ·/);
    expect(
      screen
        .queryAllByTestId("acta-event-row")
        .filter((row) => row.getAttribute("data-kind") === "kickoff"),
    ).toHaveLength(0);

    // The timeline + dock unlock at the match start (turn 1 playable now).
    expect(screen.getByTestId("acta-turn-timeline")).toBeTruthy();
    expect(screen.getByTestId("acta-capture-grid")).toBeTruthy();
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();

    // The RECEIVER (Colmillos del Caos, away) plays turn 1: the camera
    // follows the active coach and their capture dock records live.
    expect(pressed("Colmillos del Caos")).toBe("true");
    fireEvent.click(demoButton("+ TD"));
    const modal = screen.getByTestId("live-action-modal");
    fireEvent.click(
      within(within(modal).getByTestId("dock-pool-own")).getByRole("button", {
        name: /#1/i,
      }),
    );
    expect(heading().textContent).toBe("Águilas de Khemri 0 - 1 Colmillos del Caos");

    // The receiver decision stays on the pre-match record («Recibe: …»).
    const summary = within(ante()).getByRole("region", {
      name: "Lo que ha sucedido",
    });
    expect(summary.textContent).toMatch(/Recibe: Colmillos del Caos/);
  });
});

/**
 * T10 · L42 — Step 1 of the approved flow-test plan: turn progression walked
 * through the REAL UI (RTL only — no Playwright). The capture dock's «Fin
 * Turno» opens the reason sheet (Voluntario | Tirada fallida | Baja) whose
 * chip fires `endTurn`. These tests PIN the current correct behavior (no
 * behavior change):
 *   - pair rule (L36): both coaches share ONE turn number — T1 receiver →
 *     T1 rival → T2 — and the «TURNO n EN JUEGO» badge advances only when the
 *     pair closes;
 *   - cards per half-turn (L37): the ACTIVE half-turn always shows its card
 *     with the EN JUEGO chip, a closed half-turn with NOTHING recorded leaves
 *     NO card, and half-turns with events stay as COMPLETADO/CERRADO;
 *   - mid-match reload (localStorage v5): turn number, active side,
 *     perspective and recorded cards survive a remount.
 */

/** The turn card whose heading reads «T{n} · {team}» (user-visible text). */
const turnCard = (turn: number, team: string): HTMLElement =>
  screen.getByText(`T${turn} · ${team}`).closest("article") as HTMLElement;

/** The single card carrying the EN JUEGO chip (the ACTIVE half-turn). */
const enJuegoCard = (): HTMLElement =>
  screen.getByText("EN JUEGO").closest("article") as HTMLElement;

/** Two-touch capture on the real dock: action → own player chip (#1). */
const capture = (action: "+ TD" | "+ Pase") => {
  fireEvent.click(demoButton(action));
  fireEvent.click(
    within(
      within(screen.getByTestId("live-action-modal")).getByTestId("dock-pool-own"),
    ).getByRole("button", { name: /#1/i }),
  );
};

/** «Fin Turno» → reason sheet → the chosen chip fires endTurn immediately. */
const finTurno = (reason: "Voluntario" | "Tirada fallida" | "Baja") => {
  fireEvent.click(demoButton("Fin Turno"));
  fireEvent.click(
    within(screen.getByTestId("live-action-modal")).getByRole("button", {
      name: reason,
    }),
  );
};

/** Full pre-match walk; the toss winner (home, 6 vs 3) lets Águilas RECEIVE. */
const startWithHomeReceiver = () => {
  // Home (fan 2, weather 4, toss 6) then away (fan 1, weather 5, toss 3).
  dice.queue = [2, 4, 6, 1, 5, 3];
  render(<ActaDemoHarness />);
  fireEvent.click(demoButton("Restablecer"));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  openWizard();
  walkSequence(); // home done → the waiting screen.
  fireEvent.click(perspective("Colmillos del Caos"));
  openWizard();
  walkSequence(); // away done → both sequences complete.
  fireEvent.click(perspective("Águilas de Khemri"));
  fireEvent.click(
    screen.getByRole("radio", { name: "Recibe Águilas de Khemri" }),
  );
  fireEvent.click(screen.getByRole("button", { name: "Aceptar" }));
};

describe("ActaDemoHarness — T10: turn flow through the UI (L42)", () => {
  it("pair rule: T1 receiver → T1 rival → T2 — the turn badge advances only when the pair closes", () => {
    startWithHomeReceiver();
    // The match starts DIRECTLY in turn 1 with the RECEIVER (Águilas) active.
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T1 · Águilas de Khemri");
    expect(pressed("Águilas de Khemri")).toBe("true");

    // T1 home: a real dock capture lands in the EN JUEGO card.
    capture("+ TD");
    expect(heading().textContent).toBe("Águilas de Khemri 1 - 0 Colmillos del Caos");
    expect(
      within(turnCard(1, "Águilas de Khemri"))
        .getAllByTestId("acta-event-row")
        .some((row) => row.getAttribute("data-kind") === "td"),
    ).toBe(true);

    // «Fin Turno» → «Voluntario»: the RIVAL plays T1 — the turn number does
    // NOT advance yet (pair rule) and the EN JUEGO card flips sides.
    finTurno("Voluntario");
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T1 · Colmillos del Caos");
    expect(pressed("Colmillos del Caos")).toBe("true");
    expect(
      within(turnCard(1, "Águilas de Khemri")).getByText("COMPLETADO"),
    ).toBeTruthy();

    // T1 away: the rival records their own half-turn and passes the turn.
    capture("+ Pase");
    finTurno("Tirada fallida");

    // The pair closed → T2 of the RECEIVER; both T1 half-turns keep cards.
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T2 · Águilas de Khemri");
    expect(pressed("Águilas de Khemri")).toBe("true");
    expect(
      within(turnCard(1, "Colmillos del Caos")).getByText("COMPLETADO"),
    ).toBeTruthy();
    expect(
      within(turnCard(1, "Águilas de Khemri")).getByText("CERRADO"),
    ).toBeTruthy();
  });

  it("half-turns with NOTHING recorded disappear: no card, the rival's new half-turn appears as EN JUEGO", () => {
    render(<ActaDemoHarness />);
    // The narrative fixture opens with Colmillos active in T1: the ACTIVE
    // half-turn always shows its card (EN JUEGO) even before any capture.
    fireEvent.click(perspective("Colmillos del Caos"));
    expect(enJuegoCard().textContent).toContain("T1 · Colmillos del Caos");

    // «Fin Turno» with zero captures (reason «Baja») → NO card for that
    // half-turn; the rival's new half-turn card appears as EN JUEGO (still
    // T1 — the pair is open).
    finTurno("Baja");
    expect(screen.queryByText("T1 · Colmillos del Caos")).toBeNull();
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T1 · Águilas de Khemri");

    // The rival also passes with nothing recorded → T2 opens and BOTH empty
    // T1 half-turns are gone (only their EN JUEGO successors remain).
    finTurno("Voluntario");
    expect(screen.queryByText("T1 · Águilas de Khemri")).toBeNull();
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T2 · Colmillos del Caos");
  });

  it("mid-match reload keeps the turn, the active side, the perspective and the recorded cards (v5)", () => {
    const first = render(<ActaDemoHarness />);
    // Colmillos scores in T1, then both sides pass: the pair closes into T2.
    fireEvent.click(perspective("Colmillos del Caos"));
    capture("+ TD");
    finTurno("Voluntario"); // → Águilas T1 (nothing recorded)
    finTurno("Voluntario"); // the pair closes → T2, Colmillos active again
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T2 · Colmillos del Caos");
    expect(pressed("Colmillos del Caos")).toBe("true");
    const saved = JSON.parse(
      window.localStorage.getItem("bb-demo-partido") ?? "null",
    ) as { v?: number; state?: { turnNumber?: number } } | null;
    expect(saved?.v).toBe(5);
    expect(saved?.state?.turnNumber).toBe(2);
    first.unmount();

    // The reload (unmount + render) hydrates the SAME match: turn, side,
    // perspective and the recorded cards all survive.
    render(<ActaDemoHarness />);
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T2 · Colmillos del Caos");
    expect(pressed("Colmillos del Caos")).toBe("true");
    expect(
      within(turnCard(1, "Colmillos del Caos"))
        .getAllByTestId("acta-event-row")
        .some((row) => row.getAttribute("data-kind") === "td"),
    ).toBe(true);
  });
});

/**
 * T11 · L44 — Step 2 of the flow-test plan: REAL dock captures landing on the
 * right half-turn cards (re-framed by S10.4 / T16 — L54 superseded L38's
 * capture-author grouping with GAME-TURN grouping):
 *   - «+ TD» / «+ Pase» / «+ Baja» captured in one half-turn all land on THAT
 *     half-turn's card of the acting team (the EN JUEGO card) and the rival's
 *     card stays clean;
 *   - game-turn grouping (L38 → S10.4): the row lands on the half-turn being
 *     PLAYED («placaje y herida de la misma jugada caen en la MISMA card»),
 *     never on the capture author's or the victim's card per se. The guided
 *     «+ Baja» sheet really offers the victim/causer choice (cause → Causante
 *     from the OWN pool → Víctima from the RIVAL pool → injury roll) and its
 *     command stamps the VICTIM's side as the event's `side`
 *     (`buildGuidedCommand` in liveActionEntry.ts); the capture happens during
 *     the acting coach's turn, so the row lands on the ACTING team's card. The
 *     CAPTURE AUTHOR still shows on the row's badge (S10.4.2 — today the
 *     causer's owner types the guided capture);
 *   - the NON-active coach's victim-side capture («Baja propia» — S10.4.1
 *     «el jugador que recibe marca la herida») lands on the SAME game turn's
 *     card with the RECORDER's author badge (the T16 grouping change);
 *   - cards close per play order once the pair moves on: the second-play card
 *     reads COMPLETADO, the opener CERRADO (the step-1 pins) and BOTH keep
 *     their captured rows;
 *   - cross-check: a capture in T1 of one team, none in the rival's T1 and one
 *     in T2 leave EXACTLY the right cards with the right rows.
 */

/**
 * Guided «+ Baja» capture on the real dock: pick the cause (default
 * «Bloqueo») → Causante (own #1) → Víctima (rival #1) → injury roll chip
 * (default 8 — Magullado, non-permanent, so the guided flow fires on the roll
 * chip with no 1D6 step).
 */
const captureBaja = (cause = "Bloqueo", roll = 8) => {
  fireEvent.click(demoButton("+ Baja"));
  fireEvent.click(
    within(screen.getByTestId("live-action-modal")).getByRole("button", {
      name: cause,
    }),
  );
  fireEvent.click(
    within(
      within(screen.getByTestId("live-action-modal")).getByTestId("dock-pool-own"),
    ).getByRole("button", { name: /#1/i }),
  );
  fireEvent.click(
    within(
      within(screen.getByTestId("live-action-modal")).getByTestId("dock-pool-rival"),
    ).getByRole("button", { name: /#1/i }),
  );
  fireEvent.click(
    within(screen.getByTestId("live-action-modal")).getByTestId(`roll-option-${roll}`),
  );
};

/** The `data-kind` of every event row inside one card, in capture order. */
const rowKinds = (card: HTMLElement): Array<string | null> =>
  within(card)
    .getAllByTestId("acta-event-row")
    .map((row) => row.getAttribute("data-kind"));

describe("ActaDemoHarness — T11: dock captures land on the right cards (L44)", () => {
  it("«+ TD», «+ Pase» and «+ Baja» in one half-turn land on the acting team's EN JUEGO card; the rival's card stays clean", () => {
    startWithHomeReceiver();
    // The match starts with the RECEIVER (Águilas) playing T1.
    expect(enJuegoCard().textContent).toContain("T1 · Águilas de Khemri");

    capture("+ TD");
    capture("+ Pase");
    captureBaja();

    // All three rows land on THAT half-turn's card (the EN JUEGO card)…
    const card = enJuegoCard();
    expect(card.textContent).toContain("T1 · Águilas de Khemri");
    expect(rowKinds(card)).toEqual(["td", "completion", "casualty"]);
    // …and the rival has NO card at all: nothing leaked to Colmillos.
    expect(screen.queryByText("T1 · Colmillos del Caos")).toBeNull();

    // After the pass the rival's new half-turn opens with a CLEAN card while
    // the acting card keeps all three captured rows.
    finTurno("Voluntario");
    const rival = enJuegoCard();
    expect(rival.textContent).toContain("T1 · Colmillos del Caos");
    expect(within(rival).queryAllByTestId("acta-event-row")).toHaveLength(0);
    expect(rowKinds(turnCard(1, "Águilas de Khemri"))).toEqual([
      "td",
      "completion",
      "casualty",
    ]);
  });

  it("game-turn grouping: a caused «+ Baja» lands on the GAME TURN's card (the acting half-turn), never the victim's (L38 → S10.4)", () => {
    startWithHomeReceiver();
    // The guided sheet really offers the victim/causer choice (see captureBaja:
    // Causante #1 of the acting roster, Víctima #1 of the rival roster).
    captureBaja();

    // WHY re-framed (T16 / S10.4): the row lands on the card of the half-turn
    // BEING PLAYED (home's T1 — «el jugador que placa informa del placaje»).
    // The capture author (the home causer) shows on the row's badge instead of
    // driving the grouping.
    const card = enJuegoCard();
    expect(card.textContent).toContain("T1 · Águilas de Khemri");
    expect(rowKinds(card)).toEqual(["casualty"]);
    expect(card.textContent).toContain(
      "Khalid el Impávido (#1) → Grishnak Mordaz (#1)",
    );
    // S10.4.2: the badge names who REGISTERED the capture (today's guided
    // casualty is typed by the causer's owner — the acting coach).
    expect(card.textContent).toContain("Registrado por Águilas de Khemri");
    // …and the VICTIM's team never gets a card for this capture (grouping by
    // the event's victim-side `side` would have created one).
    expect(screen.queryByText("T1 · Colmillos del Caos")).toBeNull();
  });

  it("during team A's turn, team B (victim's owner) captures an injury for its own player — the row lands on A's card with B's author badge", () => {
    startWithHomeReceiver();
    // A = Águilas de Khemri plays T1 (the game turn).
    expect(enJuegoCard().textContent).toContain("T1 · Águilas de Khemri");

    // S10.4.1 (L54): B — the victim's owner, watching from the NON-active
    // dock — registers the injury of its OWN knocked-down player («Baja
    // propia», the victim-side capture; the knockdown/causer context is the
    // attacker's own capture — T17's chain).
    fireEvent.click(perspective("Colmillos del Caos"));
    fireEvent.click(demoButton("Baja propia"));
    const modal = screen.getByTestId("live-action-modal");
    // Víctima = B's own player #1, cause «Esquivando — se cayó»…
    fireEvent.click(
      within(within(modal).getByTestId("dock-pool-own")).getByRole("button", {
        name: /#1/i,
      }),
    );
    fireEvent.click(
      within(modal).getByRole("button", { name: "Esquivando — se cayó" }),
    );
    // …injury roll 8 (Magullado — the guided flow fires on the chip).
    fireEvent.click(within(modal).getByTestId("roll-option-8"));

    // The row lands on A's GAME-TURN card («placaje y herida de la misma
    // jugada caen en la MISMA card»)…
    const card = enJuegoCard();
    expect(card.textContent).toContain("T1 · Águilas de Khemri");
    expect(rowKinds(card)).toEqual(["casualty"]);
    // …with B's author badge (S10.4.2 — quién la registró)…
    expect(card.textContent).toContain("Registrado por Colmillos del Caos");
    // …and B gets NO card of its own for this capture.
    expect(screen.queryByText("T1 · Colmillos del Caos")).toBeNull();
  });

  it("when the pair moves on the cards close per play order (second play COMPLETADO, opener CERRADO) keeping their rows", () => {
    startWithHomeReceiver();
    capture("+ TD"); // the opener (T1 · Águilas)
    finTurno("Voluntario");
    capture("+ Pase"); // the second play (T1 · Colmillos)
    finTurno("Tirada fallida"); // the pair closes → T2 · Águilas

    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
    // Second-play card: COMPLETADO with its captured row preserved.
    const second = turnCard(1, "Colmillos del Caos");
    expect(within(second).getByText("COMPLETADO")).toBeTruthy();
    expect(rowKinds(second)).toEqual(["completion"]);
    // Opener card: CERRADO with its captured row preserved.
    const opener = turnCard(1, "Águilas de Khemri");
    expect(within(opener).getByText("CERRADO")).toBeTruthy();
    expect(rowKinds(opener)).toEqual(["td"]);
  });

  it("cross-check: T1 · Águilas records, T1 · Colmillos empty, T2 · Águilas records — exactly the right cards and rows", () => {
    startWithHomeReceiver();
    capture("+ TD"); // T1 · Águilas
    finTurno("Voluntario");
    finTurno("Voluntario"); // T1 · Colmillos plays EMPTY → no card
    capture("+ Pase"); // T2 · Águilas (the EN JUEGO card)

    // EXACTLY two cards: T2 · Águilas (EN JUEGO) and T1 · Águilas (the pair's
    // only recorded half-turn). NO T1 · Colmillos card and NO neutral
    // «AMBOS EQUIPOS» card: the side-null pre-match captures are substituted
    // by the «Antes del partido» block (S1).
    const cards = screen.getAllByTestId("acta-turn-card");
    const titles = cards.map(
      (card) => within(card).getByText(/^T\d+ · /).textContent,
    );
    expect(titles).toEqual([
      "T2 · Águilas de Khemri",
      "T1 · Águilas de Khemri",
    ]);
    expect(screen.queryByText(/AMBOS EQUIPOS/)).toBeNull();
    // Tight rows: each team card holds exactly its own capture.
    expect(rowKinds(turnCard(2, "Águilas de Khemri"))).toEqual(["completion"]);
    expect(rowKinds(turnCard(1, "Águilas de Khemri"))).toEqual(["td"]);
    // The substituted facts still live in the pre-match block above.
    expect(ante().textContent).toMatch(/Afición/);
  });
});

/**
 * T13 · L48 — Step 3 of the flow-test plan: a reload DURING the pre-match
 * wizard with the SECOND coach mid-way (one coach finalized, the other
 * halfway). These tests PIN the shipped v5 persistence (no behavior change):
 *   - the reload keeps BOTH coaches' captures: the finalized coach's sequence
 *     stays closed («Esperando al contrincante», no edit trigger) with their
 *     data on the acta, and the mid-way coach reopens the wizard on their
 *     SAME step (Paso 3 · Incentivos) with steps 1-2 marked ✓ from the
 *     PERSISTED marks (the live roll marks die with the unmount);
 *   - the in-progress coach keeps the «Completar/Editar» trigger state (the
 *     fase1 flow: captures on file → «Editar»);
 *   - hygiene: nothing of the mid-way input is lost and the acta is still
 *     pre-match — no match started, no dock captures, no turn timeline.
 * Distinct from the fase1 single-coach reload pin (:137) — that one covers a
 * SOLO coach mid-wizard; this one is the MIXED state (one finalized + one
 * mid-way).
 */

/**
 * Coach A (Águilas, home) finishes the WHOLE sequence and Finaliza; coach B
 * (Colmillos, away) then walks steps 1-2 (fan 1, weather 5) and sits on
 * Paso 3 · Incentivos — the page reloads THERE (unmount + render). Dice
 * queue: A fan 2 · weather 4 · toss 6, then B fan 1 · weather 5.
 */
const reloadMidWizard = () => {
  dice.queue = [2, 4, 6, 1, 5];
  const first = render(<ActaDemoHarness />);
  fireEvent.click(demoButton("Restablecer"));
  fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  openWizard();
  walkSequence(); // coach A done → the waiting screen is up.
  fireEvent.click(perspective("Colmillos del Caos"));
  openWizard(); // «Completar secuencia pre-partido» — B is fresh.
  fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D3" }));
  fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
  fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D6" }));
  fireEvent.click(screen.getByRole("button", { name: "Avanzar a Incentivos" }));
  // B is mid-wizard on Paso 3 when the reload happens.
  expect(
    within(wizard()).getByRole("group", { name: "Paso 3 · Incentivos" }),
  ).toBeTruthy();
  first.unmount();
  render(<ActaDemoHarness />);
};

const report = () =>
  within(ante()).getByRole("region", { name: "Lo que ha sucedido" });

/**
 * T17 · S4 step 2b (S10.1/S10.2/S10.4.1) — the guided BLOCK ACTION recorded as
 * the real combat chain on the REAL dock: block dice by ST (lib/rules/blocks)
 * -> pick a face -> standalone knockdown entry («Derribo») -> armour 2D6 vs
 * the victim's AR -> when broken, the VICTIM's owner side records the 1D16
 * through the dock's pending-injury callout. Rows land on the GAME TURN's card
 * (T16 grouping — unchanged here) with EACH recorder's author badge: the
 * tackler's coach reports the placaje, the victim's coach marks the herida.
 * Both-down injuries landed in T23 (S10.3 closed — see its describe below);
 * the attacker-down face stays BACKLOG: only the row.
 */

/** «+ Evento» -> «Bloqueo» chain: causer own #1 (Khalid, blitz-ra FUE 3) vs
 *  victim rival #1 (Grishnak, orc blitzer FUE 3 / AR 10) — throws the queued
 *  block dice (6 = «El defensor cae») and records the given armour sum. */
const captureBloqueo = (d6faces: number[], armour: string) => {
  fireEvent.click(demoButton("+ Evento"));
  fireEvent.click(screen.getByRole("button", { name: "Bloqueo" }));
  fireEvent.click(
    within(
      within(screen.getByTestId("live-action-modal")).getByTestId(
        "dock-pool-own",
      ),
    ).getByRole("button", { name: /#1/i }),
  );
  fireEvent.click(
    within(
      within(screen.getByTestId("live-action-modal")).getByTestId(
        "dock-pool-rival",
      ),
    ).getByRole("button", { name: /#1/i }),
  );
  dice.queue = d6faces;
  fireEvent.click(
    within(screen.getByTestId("dock-block-roll")).getByRole("button", {
      name: "Tirar dados de bloqueo",
    }),
  );
  fireEvent.click(
    within(screen.getByTestId("dock-block-face")).getByRole("button", {
      name: "El defensor cae",
    }),
  );
  fireEvent.click(
    within(screen.getByTestId("dock-armour-roll")).getByRole("button", {
      name: armour,
    }),
  );
};

describe("ActaDemoHarness — T17: combat chain on the game-turn cards (S10.1/S10.2/S10.4.1)", () => {
  it("knockdown + victim-recorded injury land on the ATTACKER's game-turn card, each row with its recorder's badge", () => {
    startWithHomeReceiver();
    // Águilas (home) plays T1: Khalid #1 blocks Grishnak #1, armour 11 vs AR
    // 10 -> rota (the chain ends in a potential injury).
    captureBloqueo([6, 1], "11");

    const card = enJuegoCard();
    expect(card.textContent).toContain("T1 · Águilas de Khemri");
    expect(rowKinds(card)).toEqual(["knockdown"]);
    // The row's label carries the recorded chain (face + armour vs AV).
    expect(card.textContent).toContain("Derribo · Ar 11 (10+) rota");
    // S10.4.1/S10.4.2: the TACKLER's coach reported the placaje.
    expect(card.textContent).toContain("Registrado por Águilas de Khemri");

    // S10.4.1: the VICTIM's owner marks the herida — the dock offers them the
    // pending-injury callout and they roll the 1D16.
    fireEvent.click(perspective("Colmillos del Caos"));
    const callout = screen.getByTestId("dock-pending-injury");
    expect(callout.textContent).toContain("TIRADA DE LESIÓN PENDIENTE");
    expect(callout.textContent).toContain("Grishnak Mordaz (#1)");
    fireEvent.click(screen.getByTestId("dock-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-12"));

    // BOTH rows land on the SAME game-turn card (placaje y herida de la misma
    // jugada) — the injury row carries the VICTIM coach's author badge.
    const landed = turnCard(1, "Águilas de Khemri");
    expect(rowKinds(landed)).toEqual(["knockdown", "casualty"]);
    expect(landed.textContent).toContain("Registrado por Colmillos del Caos");
    expect(landed.textContent).toContain("Tirada 1D16: 12");
    // …and the victim side gets NO card of its own for this play (T16).
    expect(screen.queryByText("T1 · Colmillos del Caos")).toBeNull();
  });

  it("S10.2: armour holding registers the standalone knockdown row and opens NO injury callout", () => {
    startWithHomeReceiver();
    // Armour 5 vs AR 10 -> aguanta: the derribo registers by itself.
    captureBloqueo([6, 3], "5");

    const card = enJuegoCard();
    expect(rowKinds(card)).toEqual(["knockdown"]);
    expect(card.textContent).toContain("Derribo · Ar 5 (10+) aguanta");
    fireEvent.click(perspective("Colmillos del Caos"));
    expect(screen.queryByTestId("dock-pending-injury")).toBeNull();
    expect(screen.queryByText("T1 · Colmillos del Caos")).toBeNull();
  });
});

/**
 * T23 · S4 step 4 (S10.3 CLOSED) — the «Ambos caen» face WITH injuries on the
 * REAL dock: the knockdown row registers at face pick (shipped row shape) and
 * the chain continues with one armour stage per fallen player; each broken
 * armour opens the VICTIM OWNER's pending-injury callout (S10.4.1). Rows land
 * on the GAME TURN's card (T16 grouping — untouched) with EACH recorder's
 * badge: the tackler's coach reports the placaje, each victim's owner marks
 * their own herida («solo si llega a producirse»).
 */

/** «+ Evento» -> «Bloqueo» -> both faces «Ambos caen» (dice 2+2): causer own
 *  #1 (Khalid, blitz-ra AR 9) vs victim rival #1 (Grishnak, orc blitzer AR
 *  10) — rolls the two armour sums (DEFENDER first, then the ATTACKER). */
const captureBothDown = (armourDefender: string, armourAttacker: string) => {
  fireEvent.click(demoButton("+ Evento"));
  fireEvent.click(screen.getByRole("button", { name: "Bloqueo" }));
  fireEvent.click(
    within(
      within(screen.getByTestId("live-action-modal")).getByTestId(
        "dock-pool-own",
      ),
    ).getByRole("button", { name: /#1/i }),
  );
  fireEvent.click(
    within(
      within(screen.getByTestId("live-action-modal")).getByTestId(
        "dock-pool-rival",
      ),
    ).getByRole("button", { name: /#1/i }),
  );
  dice.queue = [2, 2]; // both block dice land on «Ambos caen»
  fireEvent.click(
    within(screen.getByTestId("dock-block-roll")).getByRole("button", {
      name: "Tirar dados de bloqueo",
    }),
  );
  fireEvent.click(
    within(screen.getByTestId("dock-block-face")).getByRole("button", {
      name: "Ambos caen",
    }),
  );
  fireEvent.click(
    within(screen.getByTestId("dock-armour-roll")).getByRole("button", {
      name: armourDefender,
    }),
  );
  fireEvent.click(
    within(screen.getByTestId("dock-armour-roll")).getByRole("button", {
      name: armourAttacker,
    }),
  );
};

describe("ActaDemoHarness — T23: «Ambos caen» WITH injuries (S10.3 closed)", () => {
  it("both armours break -> knockdown row + BOTH owner-recorded injuries on the SAME game-turn card, each with its recorder's badge", () => {
    startWithHomeReceiver();
    // Khalid #1 blocks Grishnak #1, both fall: Grishnak 12 > AR 10 -> rota,
    // Khalid 11 > AR 9 -> rota (both injuries materialize).
    captureBothDown("12", "11");

    // The derribo row is already on the EN JUEGO card — shipped row shape
    // («Derribo · ambos caen», both players, no armour line) with the
    // tackler's coach badge.
    const card = enJuegoCard();
    expect(card.textContent).toContain("T1 · Águilas de Khemri");
    expect(rowKinds(card)).toEqual(["knockdown"]);
    expect(card.textContent).toContain("Derribo · ambos caen");
    expect(card.textContent).toContain("Registrado por Águilas de Khemri");

    // S10.4.1: the ATTACKER's owner (Águilas, the viewer) records Khalid's
    // herida through their OWN pending-injury callout…
    const ownCallout = screen.getByTestId("dock-pending-injury");
    expect(ownCallout.textContent).toContain("Khalid el Impávido (#1)");
    fireEvent.click(screen.getByTestId("dock-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-12"));

    // …then the DEFENDER's owner flips perspective and records Grishnak's.
    fireEvent.click(perspective("Colmillos del Caos"));
    const rivalCallout = screen.getByTestId("dock-pending-injury");
    expect(rivalCallout.textContent).toContain("Grishnak Mordaz (#1)");
    fireEvent.click(screen.getByTestId("dock-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-11"));

    // ALL rows land on the SAME game-turn card (T16 grouping untouched:
    // «placaje y herida de la misma jugada caen en la MISMA card») with EACH
    // recorder's badge (S10.4.2) and the victim-side «Tirada 1D16» rows.
    const landed = turnCard(1, "Águilas de Khemri");
    expect(rowKinds(landed)).toEqual(["knockdown", "casualty", "casualty"]);
    expect(landed.textContent).toContain("Tirada 1D16: 12");
    expect(landed.textContent).toContain("Tirada 1D16: 11");
    expect(landed.textContent).toContain("Registrado por Águilas de Khemri");
    expect(landed.textContent).toContain("Registrado por Colmillos del Caos");
    // WHY new (T23): the both-down injury rows keep the DEC-1 «(Ambos
    // derribados)» marker copy (e2e pins its text — never rename it).
    expect(landed.textContent).toContain("(Ambos derribados)");
    // …and the victim side gets NO card of its own for this play (T16).
    expect(screen.queryByText("T1 · Colmillos del Caos")).toBeNull();
  });

  it("one armour holds -> only the broken player's owner records an injury (both may fall out, one, or none)", () => {
    startWithHomeReceiver();
    // Grishnak 12 > AR 10 -> rota; Khalid 5 vs AR 9 -> aguanta.
    captureBothDown("12", "5");

    // The unharmed attacker's owner sees NO callout…
    expect(screen.queryByTestId("dock-pending-injury")).toBeNull();
    // …only the broken defender's owner does («solo si llega a producirse»).
    fireEvent.click(perspective("Colmillos del Caos"));
    const callout = screen.getByTestId("dock-pending-injury");
    expect(callout.textContent).toContain("Grishnak Mordaz (#1)");
    fireEvent.click(screen.getByTestId("dock-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-8"));

    const landed = turnCard(1, "Águilas de Khemri");
    expect(rowKinds(landed)).toEqual(["knockdown", "casualty"]);
    expect(landed.textContent).toContain("Registrado por Colmillos del Caos");
    expect(screen.queryByText("T1 · Colmillos del Caos")).toBeNull();
  });
});

describe("ActaDemoHarness — T20 (L70) under T3: earned SPP VISIBLE on the demo bubbles", () => {
  it("the roll-12 grave row shows the causer's +2 SPP tab at the bubble footer's end, whatever the side", () => {
    startWithHomeReceiver();
    captureBloqueo([6, 1], "11");
    fireEvent.click(perspective("Colmillos del Caos"));
    fireEvent.click(screen.getByTestId("dock-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-12"));

    const landed = turnCard(1, "Águilas de Khemri");
    const row = landed.querySelector(
      '[data-testid="acta-event-row"][data-kind="casualty"]',
    ) as HTMLElement;
    const sppTab = row.querySelector('[data-testid="acta-event-spp"]') as HTMLElement;
    // WHY new (T20, intentional): the user reports earned SPP are NOT showing.
    // The demo's simulated server stores the 1D16 roll but never the derived
    // `band`, so every demo casualty row lost its earned SPP tab. Roll 12 =
    // grave = lasting = the CAUSER's +2 — the tab must render.
    expect(sppTab).not.toBeNull();
    expect(sppTab.textContent).toContain("+2 SPP");
    // WHY changed (T3, intentional): the chat footer is uniform (design/01) —
    // the award sits at the footer END on both sides (the L70 mirror is gone
    // with the category-tab mirror).
    expect(sppTab.className).toContain("ml-auto");
    expect(sppTab.className).not.toContain("mr-auto");
  });
});

/**
 * T24 (L78 + user corrections, «external-assets/Puntos de SPP.md»): the SPP
 * earn rule end-to-end on the REAL dock. SÍ: the guided «+ Baja» through a
 * valid Block/Blitz pays the causer +2 for EVERY injury-table result — USER
 * verbatim: «magullado da 2 spp porque es una herida!» ZERO (user table):
 * Faltas and the Both-Down/pifia injury rows (the `bothDown` flag rows).
 */
describe("ActaDemoHarness — T24 SPP earn rule on the real dock («Puntos de SPP.md», L78)", () => {
  const casualtySppTab = (): HTMLElement | null => {
    const row = enJuegoCard().querySelector(
      '[data-testid="acta-event-row"][data-kind="casualty"]',
    );
    return row?.querySelector('[data-testid="acta-event-spp"]') ?? null;
  };

  it("the guided «+ Baja» pays the causer +2 for EVERY injury-table result — Magullado included («magullado da 2 spp porque es una herida!»)", () => {
    startWithHomeReceiver();
    captureBaja("Bloqueo", 8);
    expect(casualtySppTab()?.textContent).toContain("+2 SPP");
  });

  it("Faltas pay NOTHING: a «+ Baja» with cause «Falta» and a resolved roll shows NO SPP tab", () => {
    startWithHomeReceiver();
    captureBaja("Falta", 12);
    expect(casualtySppTab()).toBeNull();
  });

  it("Both-Down injury rows pay NOTHING: the T23 «Ambos caen» chain shows NO SPP tab on either owner-recorded injury row (the flagged flat +2 is gone)", () => {
    startWithHomeReceiver();
    captureBothDown("12", "11");
    // Each victim owner marks their own herida (S10.4.1) — rolls 12 and 11.
    fireEvent.click(screen.getByTestId("dock-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-12"));
    fireEvent.click(perspective("Colmillos del Caos"));
    fireEvent.click(screen.getByTestId("dock-injury-roll"));
    fireEvent.click(screen.getByTestId("roll-option-11"));

    const landed = turnCard(1, "Águilas de Khemri");
    expect(rowKinds(landed)).toEqual(["knockdown", "casualty", "casualty"]);
    expect(landed.querySelectorAll('[data-testid="acta-event-spp"]')).toHaveLength(0);
  });
});

/**
 * T27 (L87/L88): the skill/team SPP map end-to-end on the REAL harness. The
 * guided dock vocabulary can only pin the DEFAULT rows (it has no
 * special-action / thrown-landing cause and the demo reducer stamps no skill
 * flags) — those pin through the REAL dock; the flag rows ride crafted events
 * through the REAL v5 hydration path (the same persistence contract the reload
 * tests pin). Defaults covered here: a TD pays +3 without «Brutos Peleones»
 * and a failed dodge pays NOTHING without «Llave de Brazo».
 */
describe("ActaDemoHarness — T27 skill & team-rule SPP rows (L87/L88)", () => {
  const rowSpp = (card: HTMLElement, kind: string): string | null =>
    card
      .querySelector(`[data-testid="acta-event-row"][data-kind="${kind}"]`)
      ?.querySelector('[data-testid="acta-event-spp"]')?.textContent ?? null;

  it("the dock's «+ TD» pays the standard +3 SPP (the TD default without «Brutos Peleones»)", () => {
    startWithHomeReceiver();
    capture("+ TD");
    expect(rowSpp(enJuegoCard(), "td")).toContain("+3 SPP");
  });

  it("the dock's self-inflicted «Baja propia» failed dodge pays NOTHING (the dodge-fall default without «Llave de Brazo»)", () => {
    startWithHomeReceiver();
    fireEvent.click(perspective("Colmillos del Caos"));
    fireEvent.click(demoButton("Baja propia"));
    const modal = screen.getByTestId("live-action-modal");
    fireEvent.click(
      within(within(modal).getByTestId("dock-pool-own")).getByRole("button", {
        name: /#1/i,
      }),
    );
    fireEvent.click(
      within(modal).getByRole("button", { name: "Esquivando — se cayó" }),
    );
    fireEvent.click(within(modal).getByTestId("roll-option-8"));
    expect(rowSpp(enJuegoCard(), "casualty")).toBeNull();
  });

  /** Crafted casualty row for the REAL v5 hydration path. */
  const flaggedCasualty = (payload: Record<string, unknown>) => ({
    seq: 50,
    kind: "casualty",
    side: "home",
    playerRosterId: "k1",
    half: 1,
    turnNumber: 1,
    at: BASE + 10 * MIN,
    payload: { victimRosterId: "o1", causerRosterId: "k1", roll16: 12, ...payload },
  });

  /** Load a crafted feed through the REAL v5 hydration path — home is playing
   *  T1 (the active side whose game turn the captures land on, T16 grouping). */
  const seedMatch = (events: object[]) => {
    window.localStorage.setItem(
      "bb-demo-partido",
      JSON.stringify({
        v: 5,
        state: { ...demoState("inicio"), activeSide: "home", events },
      }),
    );
    return render(<ActaDemoHarness />);
  };

  it("«Innovador Violento»: the special-action casualty shows the causer's +2 SPP — and NO tab without the skill (the special-action default)", () => {
    const withSkill = seedMatch([
      flaggedCasualty({ cause: "specialAction", causerSkills: ["Innovador Violento"] }),
    ]);
    expect(rowSpp(enJuegoCard(), "casualty")).toContain("+2 SPP");
    withSkill.unmount();

    const bare = seedMatch([flaggedCasualty({ cause: "specialAction" })]);
    expect(rowSpp(enJuegoCard(), "casualty")).toBeNull();
    bare.unmount();
  });

  it("«Vuelo Letal» (Right-Stuff only): the thrown-landing casualty shows +2 SPP — the skill without Right Stuff shows NO tab", () => {
    const withSkill = seedMatch([
      flaggedCasualty({
        cause: "thrownLanding",
        causerSkills: ["Vuelo Letal", "Right Stuff"],
      }),
    ]);
    expect(rowSpp(enJuegoCard(), "casualty")).toContain("+2 SPP");
    withSkill.unmount();

    const noRightStuff = seedMatch([
      flaggedCasualty({ cause: "thrownLanding", causerSkills: ["Vuelo Letal"] }),
    ]);
    expect(rowSpp(enJuegoCard(), "casualty")).toBeNull();
    noRightStuff.unmount();
  });

  it("«Llave de Brazo»: the escape-fall casualty flips to +2 SPP with the skill", () => {
    const withSkill = seedMatch([
      flaggedCasualty({ cause: "dodge", causerSkills: ["Llave de Brazo"] }),
    ]);
    expect(rowSpp(enJuegoCard(), "casualty")).toContain("+2 SPP");
    withSkill.unmount();
  });

  it("«Brutos Peleones»: the caused casualty shows +3 SPP instead of +2 and the TD +2 instead of +3", () => {
    const casualty = seedMatch([
      flaggedCasualty({ cause: "block", brawlinBrutes: true }),
    ]);
    expect(rowSpp(enJuegoCard(), "casualty")).toContain("+3 SPP");
    casualty.unmount();

    const td = seedMatch([
      {
        seq: 51,
        kind: "td",
        side: "home",
        playerRosterId: "k1",
        half: 1,
        turnNumber: 1,
        at: BASE + 12 * MIN,
        payload: { brawlinBrutes: true },
      },
    ]);
    expect(rowSpp(enJuegoCard(), "td")).toContain("+2 SPP");
    td.unmount();
  });
});

describe("ActaDemoHarness — T13: reload mid-wizard with the second coach (L48)", () => {
  it("the wizard reopens on coach B's SAME step with B's captures intact and coach A still shows completed", () => {
    reloadMidWizard();
    // The reload keeps the viewing coach — B, mid-way.
    expect(pressed("Colmillos del Caos")).toBe("true");
    // B is still in progress → the fase1 «Completar/Editar» trigger state:
    // captures on file, so the label reads «Editar» (never «Completar»).
    expect(
      within(ante()).getByRole("button", {
        name: "Editar secuencia pre-partido",
      }),
    ).toBeTruthy();

    // Reopening the wizard lands on B's SAME step: Paso 3 · Incentivos, with
    // steps 1-2 marked ✓ from the PERSISTED captures (fanRecorded/
    // weatherRecorded died with the unmount — the marks come from storage).
    openWizard();
    expect(
      within(wizard()).getByRole("group", { name: "Paso 3 · Incentivos" }),
    ).toBeTruthy();
    const rail = screen.getByRole("list", { name: "Secuencia pre-partido" });
    const items = within(rail).getAllByRole("listitem");
    expect(items.map((item) => item.textContent)).toEqual([
      "✓ 1 · Los Hinchas",
      "✓ 2 · El Clima",
      "3 · Incentivos",
      "4 · Equipo pateador",
    ]);
    expect(items[2].getAttribute("aria-current")).toBe("step");

    // A's data is kept on the acta report even while B is mid-way.
    expect(report().textContent).toContain(
      "Afición — Águilas de Khemri: 4 + 🎲2 = 6",
    );
    expect(report().textContent).toContain("Incentivos — Águilas de Khemri");

    // Coach A still shows COMPLETED: their sequence is closed and waiting
    // for B (S7.3/S7.4 — no edit trigger), with A's fan line still on the
    // acta header.
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    fireEvent.click(perspective("Águilas de Khemri"));
    expect(within(ante()).getByText(/Esperando al contrincante/)).toBeTruthy();
    expect(
      within(ante()).queryByRole("button", { name: /secuencia pre-partido/ }),
    ).toBeNull();
    expect(document.body.textContent).toMatch(/Afición: 4 \+ 🎲2 = 6/);
  });

  it("reload hygiene: nothing of coach B's in-progress input is lost and the acta is still pre-match", () => {
    reloadMidWizard();
    // Nothing lost: B's captured fan line and weather die (1 + A's 4 → 2D6
    // = 9) still read on the acta, header and report alike.
    expect(document.body.textContent).toMatch(/Afición: 3 \+ 🎲1 = 4/);
    expect(report().textContent).toContain(
      "Afición — Colmillos del Caos: 3 + 🎲1 = 4",
    );
    expect(report().textContent).toContain("Clima: 2D6 = 9 · Perfecto");

    // …and the wizard continues at Paso 3: steps 1-2 are never re-asked.
    openWizard();
    expect(
      within(wizard()).getByRole("group", { name: "Paso 3 · Incentivos" }),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    // Still pre-match: the match has NOT started — no dock captures, no turn
    // timeline, no «Partido» block (the v5 blob agrees: matchStarted false).
    expect(screen.queryByTestId("acta-capture-grid")).toBeNull();
    expect(screen.queryByTestId("acta-turn-timeline")).toBeNull();
    expect(screen.queryByRole("heading", { name: "Partido" })).toBeNull();
    const saved = JSON.parse(
      window.localStorage.getItem("bb-demo-partido") ?? "null",
    ) as { v?: number; state?: { matchStarted?: boolean } } | null;
    expect(saved?.v).toBe(5);
    expect(saved?.state?.matchStarted).toBe(false);
  });
});

/**
 * T14 · L50 — Step 4 of the flow-test plan: the CLOSE-OUT segment of
 * docs/flow-enfrentamiento.md («Partido finalizado» → «Cierre → acta derivada
 * (S5)») walked through the REAL UI: «Fin Turno» closes the 2T8 pair (the
 * match ENDS from the dock), the harness's «Abrir cierre» trigger opens the
 * REAL `ActaClosure` form and the form closes the acta through its own
 * controls (canCloseActa gate → fill → `submitResult` → the harness's demo
 * save shim).
 *
 * T22 · L51 CLOSED the two first-cut debts (INTENTIONAL changes, WHY):
 * (a) ENTRY-POINT: the harness trim (d1e6f72) removed «Abrir cierre» — the
 *   ONLY `openClosure` dispatch — so the first cut seeded `closureOpen:
 *   true` (the exact state that button produced after a reload). WHY
 *   restore: a finished match must reach the real closure form THROUGH THE
 *   UI. The trigger is back in the harness chrome and these tests now CLICK
 *   it — entry path only, the closure-flow assertions are kept.
 * (b) FIXTURE: the stock «segundo-tercio»/«finalizado» homeScore was 2
 *   against a narrative feed carrying ONE home TD (seq 9) + one away TD
 *   (seq 10) and `validateActa`'s Σ anotaciones == marcador guard blocked
 *   every save over it. WHY the score and not the feed: the feed is the
 *   source of truth for the anotaciones (the closure derives its per-player
 *   TD credits from it), so the SCORE was the wrong side — home corrected
 *   2 → 1 (its single feed TD), away already matched (o1). The seeded
 *   `homeScore: 1` override is gone: these tests run over the STOCK
 *   `demoState` scores, pinned by the T22 suite below.
 */

/** The late-match v5 seed: the STOCK «segundo-tercio» scores (T22 · aligned
 *  to the feed) advanced to the 2T8 pair, home active, closure not open.
 *  (`demoState("segundo-tercio")` inherits `activeSide: "away"` from the live
 *  fixture — the home viewer must be the ACTIVE coach to reach «Fin Turno».) */
const closeOutSnapshot = () => ({
  ...demoState("segundo-tercio"),
  half: 2,
  turnNumber: 8,
  activeSide: "home" as const,
});

/** Load the seeded late match through the REAL v5 hydration path. */
const loadLateMatch = () => {
  window.localStorage.setItem(
    "bb-demo-partido",
    JSON.stringify({ v: 5, state: closeOutSnapshot() }),
  );
  return render(<ActaDemoHarness />);
};

/** Two «Fin Turno» close the 2T8 pair → the match ENDS (endMatch). */
const finishMatch = () => {
  finTurno("Voluntario");
  finTurno("Voluntario");
};

/** The stock «finalizado» scenario (already finished) through the REAL v5
 *  hydration path — no turn advance needed. */
const loadFinishedMatch = () => {
  window.localStorage.setItem(
    "bb-demo-partido",
    JSON.stringify({ v: 5, state: demoState("finalizado") }),
  );
  return render(<ActaDemoHarness />);
};

/** Fill the REAL closure controls: MVP per team, final FF + fan 1D6 per team
 *  (the asked missing data — captured feed rows are never re-keyed). */
const fillClosure = () => {
  fireEvent.click(
    screen.getByRole("radio", {
      name: "MVP · Águilas de Khemri · Khalid el Impávido",
    }),
  );
  fireEvent.click(
    screen.getByRole("radio", {
      name: "MVP · Colmillos del Caos · Grishnak Mordaz",
    }),
  );
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Factor fan · Águilas de Khemri" }),
    { target: { value: "7" } },
  );
  fireEvent.change(
    screen.getByRole("spinbutton", { name: "Factor fan · Colmillos del Caos" }),
    { target: { value: "5" } },
  );
  fireEvent.change(
    screen.getByRole("spinbutton", {
      name: "Afición · tirada 1D6 · Águilas de Khemri",
    }),
    { target: { value: "3" } },
  );
  fireEvent.change(
    screen.getByRole("spinbutton", {
      name: "Afición · tirada 1D6 · Colmillos del Caos",
    }),
    { target: { value: "4" } },
  );
};

describe("ActaDemoHarness — T14: close-out through the real closure form (L50)", () => {
  it("the closure form opens ONLY at match end through the real «Abrir cierre» trigger (hidden mid-match)", () => {
    loadLateMatch();

    // 2T8, home playing: NO closure form and NO entry trigger mid-match —
    // the finished gate holds both back.
    expect(screen.getByText(/TURNO 8 EN JUEGO/)).toBeTruthy();
    expect(screen.queryByTestId("acta-closure")).toBeNull();
    expect(screen.queryByRole("button", { name: "Abrir cierre" })).toBeNull();
    expect(screen.getByTestId("acta-capture-grid")).toBeTruthy();

    // First flip: the pair is still open → still no closure.
    finTurno("Voluntario");
    expect(screen.queryByTestId("acta-closure")).toBeNull();

    // Second flip closes the pair → the match ENDS. INTENTIONAL CHANGE (T22,
    // WHY): the form no longer auto-opens at the end — the first cut seeded
    // `closureOpen: true` because d1e6f72's trim had removed the «Abrir
    // cierre» entry point; the trigger is BACK and the real form opens
    // through it (entry path only — the closure-flow assertions are kept).
    finTurno("Voluntario");
    expect(screen.queryByTestId("acta-closure")).toBeNull();
    fireEvent.click(demoButton("Abrir cierre"));
    const closure = screen.getByTestId("acta-closure");
    expect(within(closure).getByText("Cierre del acta")).toBeTruthy();
    expect(
      within(closure).getByRole("button", { name: "Guardar acta" }),
    ).toBeTruthy();
    // The derived final score line (from the live capture).
    expect(closure.textContent).toMatch(
      /Águilas de Khemri 1\s*–\s*1 Colmillos del Caos/,
    );
    // The capture dock is gone with the finished match.
    expect(screen.queryByTestId("acta-capture-grid")).toBeNull();
  });

  it("submitting the REAL closure form reports the acta and the closure survives a reload (v5)", async () => {
    const first = loadLateMatch();
    finishMatch();
    fireEvent.click(demoButton("Abrir cierre"));
    const closure = screen.getByTestId("acta-closure");

    // Captured casualty rolls ride through (the feed's bajas carry their
    // 1D16 + 1D6): nothing is re-asked, and the save gates on missing data.
    expect(within(closure).getByText("Sin tiradas pendientes.")).toBeTruthy();
    const save = within(closure).getByRole("button", { name: "Guardar acta" });
    expect(save.hasAttribute("disabled")).toBe(true);

    // Fill the REAL controls: MVP per team, final FF + fan 1D6 per team.
    fillClosure();
    expect(save.hasAttribute("disabled")).toBe(false);

    // Submit through the real save path: the demo save shim answers the POST,
    // marks the single submitter and the form gives way to the report chrome.
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByTestId("acta-closure")).toBeNull());
    expect(
      screen.getByText(/Resultado reportado por Águilas de Khemri/),
    ).toBeTruthy();
    // The entry trigger retires with the report (nothing left to open).
    expect(screen.queryByRole("button", { name: "Abrir cierre" })).toBeNull();

    // The closed acta survives the reload (v5 blob keeps finished + submitter).
    first.unmount();
    render(<ActaDemoHarness />);
    expect(
      screen.getByText(/Resultado reportado por Águilas de Khemri/),
    ).toBeTruthy();
    expect(screen.queryByTestId("acta-closure")).toBeNull();
    const saved = JSON.parse(
      window.localStorage.getItem("bb-demo-partido") ?? "null",
    ) as { v?: number; state?: { status?: string; submittedBy?: string } } | null;
    expect(saved?.v).toBe(5);
    expect(saved?.state?.status).toBe("finished");
    expect(saved?.state?.submittedBy).toBe("home");
  });
});

/**
 * T22 · L51 — the two T14 closure debts CLOSED at the root (see the T14
 * block note for the WHY of each intentional change):
 *
 * (b) FIXTURE: the scoreboard of every close-out scenario equals its OWN
 * narrative feed's TD tally. Documented choice (WHY the score and not the
 * feed): the FEED is the source of truth for the anotaciones — `validateActa`
 * compares Σ anotaciones (per-player TD credits derived from these events)
 * against the marcador, so the feed narrates what actually happened and the
 * SCORE was the inflated side. «segundo-tercio»/«finalizado» homeScore was 2
 * over a feed with ONE home TD (seq 9 · k3 in 1T2) and one away TD (seq 10 ·
 * o1 in 1T2): home is corrected 2 → 1, away already matched at 1. The feed
 * was never edited.
 *
 * And the proof asked by the debt: with the STOCK scores (no seeded
 * overrides) the real closure form SAVES for both scenarios — the
 * Σ anotaciones == marcador guard passes and «Guardar acta» goes through.
 */
describe("ActaDemoHarness — T22: the stock fixtures close out cleanly (L51 debts)", () => {
  it("the close-out scenarios' scoreboard equals each one's own feed TD tally (validateActa's Σ anotaciones == marcador)", () => {
    for (const scenario of ["segundo-tercio", "finalizado"] as const) {
      const s = demoState(scenario);
      const tds = (side: "home" | "away") =>
        s.events.filter((event) => event.kind === "td" && event.side === side)
          .length;
      expect(`${scenario} · home ${s.homeScore} = ${tds("home")} TD`).toBe(
        `${scenario} · home ${tds("home")} = ${tds("home")} TD`,
      );
      expect(`${scenario} · away ${s.awayScore} = ${tds("away")} TD`).toBe(
        `${scenario} · away ${tds("away")} = ${tds("away")} TD`,
      );
    }
  });

  it("«segundo-tercio» STOCK scores: the closure SAVES through the real form (no seeded score)", async () => {
    loadLateMatch();
    finishMatch();
    fireEvent.click(demoButton("Abrir cierre"));
    const closure = screen.getByTestId("acta-closure");
    const save = within(closure).getByRole("button", { name: "Guardar acta" });

    // The aligned scores clear validateActa: filling the asked data enables
    // the save and the demo save shim reports the acta.
    fillClosure();
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByTestId("acta-closure")).toBeNull());
    expect(
      screen.getByText(/Resultado reportado por Águilas de Khemri/),
    ).toBeTruthy();
  });

  it("«finalizado» STOCK scores: the closure SAVES through the real form", async () => {
    loadFinishedMatch();
    fireEvent.click(demoButton("Abrir cierre"));
    const closure = screen.getByTestId("acta-closure");
    const save = within(closure).getByRole("button", { name: "Guardar acta" });

    fillClosure();
    expect(save.hasAttribute("disabled")).toBe(false);
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByTestId("acta-closure")).toBeNull());
    expect(
      screen.getByText(/Resultado reportado por Águilas de Khemri/),
    ).toBeTruthy();
  });
});

/**
 * T28 (user L92) — the «Plegarias a Nuffle» REVEAL step IS the demo's
 * `activePrayers` producer: the per-team rolls persist on the pre-match state
 * as they happen and feed every acta SPP consumer (the turn cards via the
 * timeline's `activePrayers` prop, the acta feed call site). The reveal step
 * appears ONLY when the coach bought «Plegarias a Nuffle» (>0).
 */
describe("ActaDemoHarness — T28: «Plegarias a Nuffle» rolls feed the acta's activePrayers (L92)", () => {
  const rowSpp = (card: HTMLElement, kind: string): string | null =>
    card
      .querySelector(`[data-testid="acta-event-row"][data-kind="${kind}"]`)
      ?.querySelector('[data-testid="acta-event-spp"]')?.textContent ?? null;

  /** Crafted feed + per-team prayer rolls through the REAL v5 hydration
   *  path (T27's seed pattern — the full pre-match shape, old saves safe). */
  const seedPrayers = (
    events: object[],
    prayerRolls: { home: number[]; away: number[] },
  ) => {
    window.localStorage.setItem(
      "bb-demo-partido",
      JSON.stringify({
        v: 5,
        state: {
          ...demoState("inicio"),
          activeSide: "home",
          events,
          preMatch: {
            fans: { home: null, away: null },
            weatherDice: { home: null, away: null },
            kickDice: { home: null, away: null },
            inducementsDone: { home: false, away: false },
            kicking: null,
            prayerRolls,
          },
        },
      }),
    );
    return render(<ActaDemoHarness />);
  };

  it("the real wizard flow: buying «Plegarias a Nuffle» adds the reveal step, the blessing reveals there and persists for the report", () => {
    // T29 (user L95): the prayer roll is the ONE manual roll of the sequence
    // — the coach throws the real 1D16, types the result and «Aceptar» LOCKS
    // it (the auto-roll die button is retired from this step), so the queue
    // only carries the auto dice: home (fan 1D3 = 2, clima 1D6 = 4) then the
    // rival's fan 1D3 = 1 and clima 1D6 = 5 (the shared 2D6 needs BOTH
    // coaches' dice before «El Clima» reads done). The prayer result 10
    // («Pase perfecto") is entered BY HAND.
    dice.queue = [2, 4, 1, 5];
    render(<ActaDemoHarness />);
    fireEvent.click(demoButton("Restablecer"));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    openWizard();
    fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D3" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
    fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D6" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar a Incentivos" }));
    // Buy ONE prayer → the NEW reveal step opens right after Incentivos.
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir Plegarias a Nuffle" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Avanzar a Plegarias a Nuffle" }),
    );
    const reveal = within(wizard()).getByRole("group", {
      name: "Paso 4 · Plegarias a Nuffle",
    });
    // T29 (user L95): manual entry + «Aceptar» lock — no die button here.
    const prayer = within(reveal).getByRole("group", {
      name: "Plegaria 1 de 1 · Águilas de Khemri",
    });
    fireEvent.change(within(prayer).getByRole("spinbutton"), {
      target: { value: "10" },
    });
    fireEvent.click(within(prayer).getByRole("button", { name: "Aceptar" }));
    expect(reveal.textContent).toContain("Pase perfecto");
    // Cerrar (the kick die is still out) → the report carries the blessing.
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(report().textContent).toContain(
      "Plegarias — Águilas de Khemri: Pase perfecto",
    );
    // The rival rolls their own weather die (per-side capture, S2c).
    fireEvent.click(perspective("Colmillos del Caos"));
    openWizard();
    fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D3" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
    fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D6" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    // The persisted roll reads DONE on reopen: home resumes at Paso 5 and the
    // rail marks the reveal step ✓ (T29: the accepted result is locked —
    // never asked again).
    fireEvent.click(perspective("Águilas de Khemri"));
    openWizard();
    expect(
      within(wizard()).getByRole("group", { name: "Paso 5 · Equipo pateador" }),
    ).toBeTruthy();
    const rail = screen.getByRole("list", { name: "Secuencia pre-partido" });
    expect(
      within(rail)
        .getAllByRole("listitem")
        .map((item) => item.textContent)[3],
    ).toBe("✓ 4 · Plegarias a Nuffle");
  });

  it("«Pase perfecto» (roll 10) pays the completion +2 SPP instead of +1 — the rolls reach the turn cards as activePrayers", () => {
    const completion = {
      seq: 50,
      kind: "completion",
      side: "home",
      playerRosterId: "k1",
      half: 1,
      turnNumber: 1,
      at: BASE + 10 * MIN,
      payload: {},
    };
    const blessed = seedPrayers([completion], { home: [10], away: [] });
    expect(rowSpp(enJuegoCard(), "completion")).toContain("+2 SPP");
    blessed.unmount();

    const plain = seedPrayers([completion], { home: [], away: [] });
    expect(rowSpp(enJuegoCard(), "completion")).toContain("+1 SPP");
    plain.unmount();
  });

  it("«¡Con faltas y a lo loco!» (roll 13) unlocks the foul +2 on the CAUSER side only — the foul=0 default stays pinned", () => {
    const foulCasualty = {
      seq: 50,
      kind: "casualty",
      side: "home",
      playerRosterId: "k1",
      half: 1,
      turnNumber: 1,
      at: BASE + 10 * MIN,
      payload: { victimRosterId: "o1", causerRosterId: "k1", roll16: 12, cause: "foul" },
    };
    // The casualty row's earner is the CAUSER side (away — opposite the
    // victim-side row), so the blessing unlocks there only.
    const blessed = seedPrayers([foulCasualty], { home: [], away: [13] });
    expect(rowSpp(enJuegoCard(), "casualty")).toContain("+2 SPP");
    blessed.unmount();

    const wrongSide = seedPrayers([foulCasualty], { home: [13], away: [] });
    expect(rowSpp(enJuegoCard(), "casualty")).toBeNull();
    wrongSide.unmount();

    const plain = seedPrayers([foulCasualty], { home: [], away: [] });
    expect(rowSpp(enJuegoCard(), "casualty")).toBeNull();
    plain.unmount();
  });
});

/**
 * T29 (user L95) — the point-5 SPP E2E equivalents, one per blessing: the
 * prayer roll is the ONE MANUAL roll of the pre-match («esta de aqui es la
 * unica tirada de esta parte que debemos de dar la opcion de manual» — the
 * coach throws the real 1D16, types the result and «Aceptar» LOCKS it) and
 * the accepted blessing pays its SPP on the acta cards end-to-end (manual
 * entry -> prayerRolls -> activePrayers -> the card's ★ tab). These walk the
 * manual control for the three remaining blessings (10 pass ★2 / 11 catch +1
 * / 12 crowd ★2); the 13 -> foul ★2 pin is the seeded one just above (T28),
 * with its earner-side negative.
 */
describe("ActaDemoHarness — T29: the MANUAL prayer roll pays the blessing SPP end-to-end (L95)", () => {
  const rowSpp = (card: HTMLElement, kind: string): string | null =>
    card
      .querySelector(`[data-testid="acta-event-row"][data-kind="${kind}"]`)
      ?.querySelector('[data-testid="acta-event-spp"]')?.textContent ?? null;

  /** Crafted feed through the REAL v5 hydration (T27/T28 seed pattern) over
   *  a FRESH pre-match, so the wizard walk lands on the manual reveal step. */
  const seedMatch = (events: object[]) => {
    window.localStorage.setItem(
      "bb-demo-partido",
      JSON.stringify({
        v: 5,
        state: {
          ...demoState("inicio"),
          activeSide: "home",
          events,
          preMatch: {
            fans: { home: null, away: null },
            weatherDice: { home: null, away: null },
            kickDice: { home: null, away: null },
            inducementsDone: { home: false, away: false },
            kicking: null,
          },
        },
      }),
    );
    return render(<ActaDemoHarness />);
  };

  /** The REAL wizard walk to the reveal step as Águilas: auto die buttons for
   *  afición + clima (those rolls stay automatic), the «Plegarias a Nuffle»
   *  purchase, then the 1D16 typed BY HAND and locked with «Aceptar» (T29:
   *  the auto-roll die button is retired from this step). */
  const acceptManualRoll = (roll: string) => {
    openWizard();
    fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D3" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar al Clima" }));
    fireEvent.click(within(wizard()).getByRole("button", { name: "Tirar 1D6" }));
    fireEvent.click(screen.getByRole("button", { name: "Avanzar a Incentivos" }));
    fireEvent.click(
      screen.getByRole("button", { name: "Añadir Plegarias a Nuffle" }),
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Avanzar a Plegarias a Nuffle" }),
    );
    const prayer = within(wizard()).getByRole("group", {
      name: "Plegaria 1 de 1 · Águilas de Khemri",
    });
    fireEvent.change(within(prayer).getByRole("spinbutton"), {
      target: { value: roll },
    });
    fireEvent.click(within(prayer).getByRole("button", { name: "Aceptar" }));
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
  };

  /** A casualty caused BY Águilas (the row's side is the VICTIM's — the
   *  earner is the opposite side, so the blessing unlocks on home). */
  const causedCasualty = (cause: string) => ({
    seq: 50,
    kind: "casualty",
    side: "away",
    playerRosterId: "o1",
    half: 1,
    turnNumber: 1,
    at: BASE + 10 * MIN,
    payload: { victimRosterId: "o1", causerRosterId: "k1", roll16: 12, cause },
  });

  it("manual 10 + «Aceptar»: «Pase perfecto» pays the completed pass ★2 on the acta card", () => {
    seedMatch([
      {
        seq: 50,
        kind: "completion",
        side: "home",
        playerRosterId: "k1",
        half: 1,
        turnNumber: 1,
        at: BASE + 10 * MIN,
        payload: {},
      },
    ]);
    acceptManualRoll("10");
    expect(report().textContent).toContain(
      "Plegarias — Águilas de Khemri: Pase perfecto",
    );
    expect(rowSpp(enJuegoCard(), "completion")).toContain("+2 SPP");
  });

  it("manual 11 + «Aceptar»: «Recepciones deslumbrantes» pays the pass-catch +1 (★1 + catch ★1 = ★2) on the acta card", () => {
    seedMatch([
      {
        seq: 50,
        kind: "completion",
        side: "home",
        playerRosterId: "k1",
        half: 1,
        turnNumber: 1,
        at: BASE + 10 * MIN,
        payload: {},
      },
    ]);
    acceptManualRoll("11");
    expect(report().textContent).toContain(
      "Plegarias — Águilas de Khemri: Recepciones deslumbrantes",
    );
    expect(rowSpp(enJuegoCard(), "completion")).toContain("+2 SPP");
  });

  it("manual 12 + «Aceptar»: «Apoyo del público» pays the crowd-push injury ★2 to the pusher on the acta card", () => {
    seedMatch([causedCasualty("crowd")]);
    acceptManualRoll("12");
    expect(report().textContent).toContain(
      "Plegarias — Águilas de Khemri: Apoyo del público",
    );
    expect(rowSpp(enJuegoCard(), "casualty")).toContain("+2 SPP");
  });
});
