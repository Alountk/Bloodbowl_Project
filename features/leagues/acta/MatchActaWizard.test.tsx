import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { MatchActaWizard } from "../MatchActaWizard";
import type { RosterPlayerRef } from "../MatchResolveModal";

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
