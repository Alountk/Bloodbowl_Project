import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MatchActaWizard } from "../MatchActaWizard";
import type { RosterPlayerRef } from "../MatchResolveModal";
import type { ResultPayload } from "../api";
import type { ActaActionLine, ActaState, ActaTeamDraft } from "./actaState";

/**
 * S2 (RAU-122) — the MatchActaWizard shell (MAW-1 entry, MAW-2 Contexto,
 * MAW-3 Marcador, MAW-4 Acciones). The dialog exposes step navigation with
 * `aria-current="step"`, traps Tab inside the dialog, closes on Escape, and
 * restores focus to the previously focused element. Assertions use
 * textContent/regex — this repo has no jest-dom matchers.
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

function actaDraft(overrides: Partial<ActaTeamDraft> = {}): ActaTeamDraft {
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

function tdLine(id: string, rosterPlayerId: string, quantity: number): ActaActionLine {
  return { id, rosterPlayerId, kind: "td", quantity };
}

/** A valid acta: Σ anotaciones == marcador and one MVP per team. */
function validActa(): ActaState {
  return {
    weather: "Perfecto",
    home: actaDraft({
      ff: 4,
      score: 2,
      mvpGrantee: "h1",
      actions: [tdLine("h", "h1", 2)],
    }),
    away: actaDraft({
      ff: 3,
      score: 1,
      mvpGrantee: "a1",
      actions: [tdLine("a", "a1", 1)],
    }),
  };
}

function renderWizard(props: Partial<Parameters<typeof MatchActaWizard>[0]> = {}) {
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

function activeStepLabel(): string | null {
  const nav = screen.getByRole("navigation", { name: "Acta del partido" });
  return nav.querySelector('[aria-current="step"]')?.textContent ?? null;
}

describe("MatchActaWizard shell", () => {
  it("renders a modal dialog with a seven-step navigation marking the active step", () => {
    renderWizard();
    const dialog = screen.getByRole("dialog");
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    const nav = screen.getByRole("navigation", { name: "Acta del partido" });
    expect(nav.querySelectorAll("li")).toHaveLength(7);
    expect(activeStepLabel()).toContain("Contexto");
  });

  it("advances and rewinds the active step with the footer controls", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(activeStepLabel()).toContain("Marcador");
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect(activeStepLabel()).toContain("Contexto");
  });

  it("moves focus into the newly rendered step when the step changes", () => {
    renderWizard();
    const siguiente = screen.getByRole("button", { name: "Siguiente" });
    siguiente.focus();
    fireEvent.click(siguiente);
    const marcador = screen.getByRole("group", { name: "Marcador" });
    expect(document.activeElement).toBe(marcador);
    expect(marcador.contains(screen.getByLabelText(homeName))).toBe(true);
  });

  it("closes on Escape", () => {
    const { onClose } = renderWizard();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps Tab focus inside the dialog and wraps at both ends", () => {
    renderWizard();
    const dialog = screen.getByRole("dialog");
    const focusables = Array.from(
      dialog.querySelectorAll<HTMLElement>(
        'button:not([disabled]), input, select, [tabindex]:not([tabindex="-1"])',
      ),
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    last.focus();
    fireEvent.keyDown(document, { key: "Tab" });
    expect(document.activeElement).toBe(first);
    first.focus();
    fireEvent.keyDown(document, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the previously focused element on close", () => {
    const trigger = document.createElement("button");
    document.body.appendChild(trigger);
    trigger.focus();
    const { unmount } = renderWizard();
    unmount();
    expect(document.activeElement).toBe(trigger);
    document.body.removeChild(trigger);
  });
});

describe("MatchActaWizard capture", () => {
  it("captures the Contexto fields across step changes", () => {
    renderWizard();
    fireEvent.change(screen.getByLabelText(`Factor fan · ${homeName}`), {
      target: { value: "5" },
    });
    fireEvent.click(screen.getByLabelText(`${homeName} NUNCA tuvo el balón`));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    const ff = screen.getByLabelText(`Factor fan · ${homeName}`) as HTMLInputElement;
    expect(ff.value).toBe("5");
    const never = screen.getByLabelText(
      `${homeName} NUNCA tuvo el balón`,
    ) as HTMLInputElement;
    expect(never.checked).toBe(true);
  });

  it("captures the Marcador scores across step changes", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.change(screen.getByLabelText(homeName), { target: { value: "2" } });
    fireEvent.change(screen.getByLabelText(awayName), { target: { value: "1" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    expect((screen.getByLabelText(homeName) as HTMLInputElement).value).toBe("2");
    expect((screen.getByLabelText(awayName) as HTMLInputElement).value).toBe("1");
  });

  it("renders the real MVP step at step 3 and captures one grantee per team", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(activeStepLabel()).toContain("MVP");
    fireEvent.click(
      screen.getByRole("radio", { name: `MVP · ${homeName} · Khalid el Impávido` }),
    );
    fireEvent.click(
      screen.getByRole("radio", { name: `MVP · ${awayName} · Grishnak Mordaz` }),
    );
    // Navigate away and back: the captured grantees survive the step change.
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Atrás" }));
    const homeMvp = screen.getByRole("radio", {
      name: `MVP · ${homeName} · Khalid el Impávido`,
    }) as HTMLInputElement;
    const awayMvp = screen.getByRole("radio", {
      name: `MVP · ${awayName} · Grishnak Mordaz`,
    }) as HTMLInputElement;
    expect(homeMvp.checked).toBe(true);
    expect(awayMvp.checked).toBe(true);
    expect(screen.getByText(/★4 PE/)).toBeTruthy();
  });

  it("renders the real Bajas step at step 4, deriving the victims from Step 2", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    const home = screen.getByRole("region", { name: homeName });
    fireEvent.click(
      within(home).getByRole("button", { name: `Añadir acción · ${homeName}` }),
    );
    fireEvent.change(within(home).getByLabelText(`Acción 1 · ${homeName}`), {
      target: { value: "casualty" },
    });
    fireEvent.change(within(home).getByLabelText(`Víctima 1 · ${homeName}`), {
      target: { value: "away:a1" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    expect(activeStepLabel()).toContain("Bajas");
    const bajas = screen.getByRole("group", { name: "Bajas" });
    expect(bajas.textContent).toContain("Grishnak Mordaz");
    expect(bajas.textContent).not.toContain("porción posterior");
  });

  it("renders the real Final step at step 5 with a fan roll input per team", () => {
    renderWizard();
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    }
    expect(activeStepLabel()).toContain("Final");
    const final = screen.getByRole("group", { name: "Final" });
    expect(final.textContent).not.toContain("porción posterior");
    expect(screen.getByLabelText(`Afición · tirada 1D6 · ${homeName}`)).toBeTruthy();
    expect(screen.getByLabelText(`Afición · tirada 1D6 · ${awayName}`)).toBeTruthy();
  });

  it("captures an Acciones casualty line and surfaces it as a derived victim", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    const home = screen.getByRole("region", { name: homeName });
    fireEvent.click(within(home).getByRole("button", { name: `Añadir acción · ${homeName}` }));
    fireEvent.change(within(home).getByLabelText(`Jugador 1 · ${homeName}`), {
      target: { value: "h1" },
    });
    fireEvent.change(within(home).getByLabelText(`Acción 1 · ${homeName}`), {
      target: { value: "casualty" },
    });
    fireEvent.change(within(home).getByLabelText(`Víctima 1 · ${homeName}`), {
      target: { value: "away:a1" },
    });
    expect(home.textContent).toMatch(/bajas causadas\s*1/i);
  });

  it("labels the inducement fields with the Spanish term", () => {
    renderWizard();
    expect(screen.queryAllByText(/inducements/i)).toHaveLength(0);
    expect(screen.getByLabelText(`Incentivos · ${homeName}`)).toBeTruthy();
    expect(screen.getByLabelText(`Incentivos · ${awayName}`)).toBeTruthy();
  });

  it("hides the quantity control on a casualty line", () => {
    renderWizard();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    const home = screen.getByRole("region", { name: homeName });
    fireEvent.click(within(home).getByRole("button", { name: `Añadir acción · ${homeName}` }));
    expect(within(home).getByLabelText(`Cantidad 1 · ${homeName}`)).toBeTruthy();
    fireEvent.change(within(home).getByLabelText(`Acción 1 · ${homeName}`), {
      target: { value: "casualty" },
    });
    expect(within(home).queryByLabelText(`Cantidad 1 · ${homeName}`)).toBeNull();
  });
});

describe("MatchActaWizard submit (s4a)", () => {
  function goToRevisar() {
    for (let i = 0; i < 6; i += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
    }
  }

  it("renders the real Revisar step at step 6 and submits the built payload", () => {
    const onSubmit = vi.fn<(payload: ResultPayload) => void>();
    renderWizard({ initial: validActa(), onSubmit });
    goToRevisar();

    expect(activeStepLabel()).toContain("Revisar");
    const revisar = screen.getByRole("group", { name: "Revisar" });
    expect(revisar.textContent).not.toContain("porción posterior");
    expect(screen.getByRole("region", { name: "Resumen del acta" })).toBeTruthy();

    const save = screen.getByRole("button", { name: "Guardar acta" }) as HTMLButtonElement;
    expect(save.disabled).toBe(false);
    fireEvent.click(save);

    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.home.score).toBe(2);
    expect(payload.home.mvp.grantee).toBe("h1");
    expect(payload.away.mvp.grantee).toBe("a1");
  });

  it("blocks submit while a team has no MVP selected", () => {
    const onSubmit = vi.fn<(payload: ResultPayload) => void>();
    const state = validActa();
    state.home.mvpGrantee = "";
    renderWizard({ initial: state, onSubmit });
    goToRevisar();

    const save = screen.getByRole("button", { name: "Guardar acta" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);

    expect(onSubmit).not.toHaveBeenCalled();
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toMatch(/MVP/);
    expect(alert.textContent).toContain(homeName);
  });

  it("blocks submit when Σ anotaciones differs from the marcador", () => {
    const onSubmit = vi.fn<(payload: ResultPayload) => void>();
    const state = validActa();
    state.away.score = 3;
    renderWizard({ initial: state, onSubmit });
    goToRevisar();

    const save = screen.getByRole("button", { name: "Guardar acta" }) as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    fireEvent.click(save);

    expect(onSubmit).not.toHaveBeenCalled();
    expect(screen.getByRole("alert").textContent).toMatch(/anotaciones/i);
  });

  it("shows an alert and keeps the dialog open when onSubmit rejects (s4c corrective)", async () => {
    // A 400/409 rejection must not be swallowed: the shell surfaces it in a
    // visible role="alert" and keeps the acta open so the captain can retry.
    const onSubmit = vi.fn(() => Promise.reject(new Error("rejected")));
    renderWizard({ initial: validActa(), onSubmit });
    goToRevisar();

    fireEvent.click(screen.getByRole("button", { name: "Guardar acta" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toMatch(
        /No se pudo guardar el acta/,
      ),
    );
    expect(screen.getByRole("dialog")).toBeTruthy();
  });
});

