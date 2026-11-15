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

// Deterministic dice for die-button rolls (S3 · T4 kickoff walk): a per-test
// queue, defaulting to the wizard's classic 2/5 demo rolls.
const dice = vi.hoisted(() => ({ queue: [] as number[] }));
vi.mock("@/lib/random", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/random")>();
  return {
    ...actual,
    rollD3: () => dice.queue.shift() ?? 2,
    rollD6: () => dice.queue.shift() ?? 5,
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

  // PARKED (intentional harness cleanup): the «Finalizado» / «Abrir cierre»
  // controls are gone from the harness — the closure UI needs a new entry
  // point before this shim can be walked again.
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

/** The turn card whose heading reads «T{n} • {team}» (user-visible text). */
const turnCard = (turn: number, team: string): HTMLElement =>
  screen.getByText(`T${turn} • ${team}`).closest("article") as HTMLElement;

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
    expect(enJuegoCard().textContent).toContain("T1 • Águilas de Khemri");
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
    expect(enJuegoCard().textContent).toContain("T1 • Colmillos del Caos");
    expect(pressed("Colmillos del Caos")).toBe("true");
    expect(
      within(turnCard(1, "Águilas de Khemri")).getByText("COMPLETADO"),
    ).toBeTruthy();

    // T1 away: the rival records their own half-turn and passes the turn.
    capture("+ Pase");
    finTurno("Tirada fallida");

    // The pair closed → T2 of the RECEIVER; both T1 half-turns keep cards.
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T2 • Águilas de Khemri");
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
    expect(enJuegoCard().textContent).toContain("T1 • Colmillos del Caos");

    // «Fin Turno» with zero captures (reason «Baja») → NO card for that
    // half-turn; the rival's new half-turn card appears as EN JUEGO (still
    // T1 — the pair is open).
    finTurno("Baja");
    expect(screen.queryByText("T1 • Colmillos del Caos")).toBeNull();
    expect(screen.getByText(/TURNO 1 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T1 • Águilas de Khemri");

    // The rival also passes with nothing recorded → T2 opens and BOTH empty
    // T1 half-turns are gone (only their EN JUEGO successors remain).
    finTurno("Voluntario");
    expect(screen.queryByText("T1 • Águilas de Khemri")).toBeNull();
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T2 • Colmillos del Caos");
  });

  it("mid-match reload keeps the turn, the active side, the perspective and the recorded cards (v5)", () => {
    const first = render(<ActaDemoHarness />);
    // Colmillos scores in T1, then both sides pass: the pair closes into T2.
    fireEvent.click(perspective("Colmillos del Caos"));
    capture("+ TD");
    finTurno("Voluntario"); // → Águilas T1 (nothing recorded)
    finTurno("Voluntario"); // the pair closes → T2, Colmillos active again
    expect(screen.getByText(/TURNO 2 EN JUEGO/)).toBeTruthy();
    expect(enJuegoCard().textContent).toContain("T2 • Colmillos del Caos");
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
    expect(enJuegoCard().textContent).toContain("T2 • Colmillos del Caos");
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
 * Guided «+ Baja» capture on the real dock: cause «Bloqueo» → Causante (own
 * #1) → Víctima (rival #1) → injury roll 8 (Magullado — non-permanent, so the
 * guided flow fires on the roll chip with no 1D6 step).
 */
const captureBaja = () => {
  fireEvent.click(demoButton("+ Baja"));
  fireEvent.click(
    within(screen.getByTestId("live-action-modal")).getByRole("button", {
      name: "Bloqueo",
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
    within(screen.getByTestId("live-action-modal")).getByTestId("roll-option-8"),
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
    expect(enJuegoCard().textContent).toContain("T1 • Águilas de Khemri");

    capture("+ TD");
    capture("+ Pase");
    captureBaja();

    // All three rows land on THAT half-turn's card (the EN JUEGO card)…
    const card = enJuegoCard();
    expect(card.textContent).toContain("T1 • Águilas de Khemri");
    expect(rowKinds(card)).toEqual(["td", "completion", "casualty"]);
    // …and the rival has NO card at all: nothing leaked to Colmillos.
    expect(screen.queryByText("T1 • Colmillos del Caos")).toBeNull();

    // After the pass the rival's new half-turn opens with a CLEAN card while
    // the acting card keeps all three captured rows.
    finTurno("Voluntario");
    const rival = enJuegoCard();
    expect(rival.textContent).toContain("T1 • Colmillos del Caos");
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
    expect(card.textContent).toContain("T1 • Águilas de Khemri");
    expect(rowKinds(card)).toEqual(["casualty"]);
    expect(card.textContent).toContain(
      "Khalid el Impávido (#1) → Grishnak Mordaz (#1)",
    );
    // S10.4.2: the badge names who REGISTERED the capture (today's guided
    // casualty is typed by the causer's owner — the acting coach).
    expect(card.textContent).toContain("Registrado por Águilas de Khemri");
    // …and the VICTIM's team never gets a card for this capture (grouping by
    // the event's victim-side `side` would have created one).
    expect(screen.queryByText("T1 • Colmillos del Caos")).toBeNull();
  });

  it("during team A's turn, team B (victim's owner) captures an injury for its own player — the row lands on A's card with B's author badge", () => {
    startWithHomeReceiver();
    // A = Águilas de Khemri plays T1 (the game turn).
    expect(enJuegoCard().textContent).toContain("T1 • Águilas de Khemri");

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
    expect(card.textContent).toContain("T1 • Águilas de Khemri");
    expect(rowKinds(card)).toEqual(["casualty"]);
    // …with B's author badge (S10.4.2 — quién la registró)…
    expect(card.textContent).toContain("Registrado por Colmillos del Caos");
    // …and B gets NO card of its own for this capture.
    expect(screen.queryByText("T1 • Colmillos del Caos")).toBeNull();
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

    // EXACTLY three cards: T2 · Águilas (EN JUEGO), T1 · Águilas (the pair's
    // only recorded half-turn) and the side-null pre-match system card
    // («AMBOS EQUIPOS»). NO T1 · Colmillos card.
    const cards = screen.getAllByTestId("acta-turn-card");
    const titles = cards.map(
      (card) => within(card).getByText(/^T\d+ • /).textContent,
    );
    expect(titles).toEqual([
      "T2 • Águilas de Khemri",
      "T1 • Águilas de Khemri",
      "T1 • AMBOS EQUIPOS",
    ]);
    // Tight rows: each team card holds exactly its own capture, and no capture
    // row exists anywhere else (the system card holds only side-null rows).
    expect(rowKinds(turnCard(2, "Águilas de Khemri"))).toEqual(["completion"]);
    expect(rowKinds(turnCard(1, "Águilas de Khemri"))).toEqual(["td"]);
    const inGameKinds = new Set(["td", "completion", "casualty", "foul"]);
    expect(
      rowKinds(turnCard(1, "AMBOS EQUIPOS")).some((kind) =>
        inGameKinds.has(kind ?? ""),
      ),
    ).toBe(false);
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
 * match ENDS from the dock) and the REAL `ActaClosure` form closes the acta
 * through its own controls (canCloseActa gate → fill → `submitResult` → the
 * harness's demo save shim). These tests PIN the shipped close-out (no
 * behavior change).
 *
 * ENTRY-POINT DEBT (the one honest seed): the harness trim (d1e6f72) removed
 * «Abrir cierre» — the ONLY `openClosure` dispatch (actaDemoHarness has no
 * other one; the parked shim test above says it outright: "the closure UI
 * needs a new entry point"). The seeded v5 blob therefore carries
 * `closureOpen: true` — the exact state that button produced after a reload —
 * and the close-out runs from there. Ending the match and closing the acta
 * are both the real UI; only the OPEN trigger is seeded.
 *
 * The snapshot is the «segundo-tercio» scenario advanced to the 2T8 pair with
 * homeScore pinned to 1 = its captured TD rows: the stock narrative tally (2)
 * counts one home TD more than its feed carries and `validateActa`'s
 * Σ anotaciones == marcador guard would block every save over it (fixture
 * debt — reported, not patched here).
 */

/** The late-match v5 seed: 2T8 pair, home active, closure ready to open.
 *  (`demoState("segundo-tercio")` inherits `activeSide: "away"` from the live
 *  fixture — the home viewer must be the ACTIVE coach to reach «Fin Turno».) */
const closeOutSnapshot = () => ({
  ...demoState("segundo-tercio"),
  half: 2,
  turnNumber: 8,
  activeSide: "home" as const,
  homeScore: 1,
  closureOpen: true,
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

describe("ActaDemoHarness — T14: close-out through the real closure form (L50)", () => {
  it("the closure form appears ONLY at match end: hidden mid-match, up once the 2T8 pair closes", () => {
    loadLateMatch();

    // 2T8, home playing: NO closure form mid-match — the finished gate holds
    // it back even with the closure-open seed already in the blob.
    expect(screen.getByText(/TURNO 8 EN JUEGO/)).toBeTruthy();
    expect(screen.queryByTestId("acta-closure")).toBeNull();
    expect(screen.getByTestId("acta-capture-grid")).toBeTruthy();

    // First flip: the pair is still open → still no closure.
    finTurno("Voluntario");
    expect(screen.queryByTestId("acta-closure")).toBeNull();

    // Second flip closes the pair → the match ENDS and the REAL closure form
    // is up (canCloseActa: participant + scheduled + finished live).
    finTurno("Voluntario");
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
    const closure = screen.getByTestId("acta-closure");

    // Captured casualty rolls ride through (the feed's bajas carry their
    // 1D16 + 1D6): nothing is re-asked, and the save gates on missing data.
    expect(within(closure).getByText("Sin tiradas pendientes.")).toBeTruthy();
    const save = within(closure).getByRole("button", { name: "Guardar acta" });
    expect(save.hasAttribute("disabled")).toBe(true);

    // Fill the REAL controls: MVP per team, final FF + fan 1D6 per team.
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
    expect(save.hasAttribute("disabled")).toBe(false);

    // Submit through the real save path: the demo save shim answers the POST,
    // marks the single submitter and the form gives way to the report chrome.
    fireEvent.click(save);
    await waitFor(() => expect(screen.queryByTestId("acta-closure")).toBeNull());
    expect(
      screen.getByText(/Resultado reportado por Águilas de Khemri/),
    ).toBeTruthy();

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
