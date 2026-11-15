import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";

import { ActaDemoHarness } from "./actaDemoHarness";

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
