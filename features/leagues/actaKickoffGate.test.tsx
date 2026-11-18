import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";

import { kickoffEventFor } from "@/lib/rules/kickoffEvents";

import { ActaKickoffGate } from "./actaKickoffGate";
import type { ActaDemoKickoff } from "./actaDemoReducer";

/**
 * S3 · T4 — design C «Acta secuencial» (L29): the kickoff builds as sequential
 * acta rows (① roll 2D6 → ② event → ③ opposed duel → ④ registro) with the
 * 11-event table below and the ball-landing footnote. Mobile-first (390),
 * rulebook-light (#12225a/#d11938/#f8fafc, white square panels), Spanish,
 * NO back button / P2P / HASH / network chrome. The gate renders INSTEAD of
 * the turn timeline + dock while `matchStarted && !kickoff.registered`.
 */

afterEach(cleanup);

const NAMES = { homeName: "Águilas de Khemri", awayName: "Colmillos del Caos" };

function gate(
  kickoff: Partial<ActaDemoKickoff>,
  extra: Partial<Parameters<typeof ActaKickoffGate>[0]> = {},
) {
  const onRoll = vi.fn();
  const onRollDuel = vi.fn();
  const onRegister = vi.fn();
  const onSetDie = vi.fn();
  const onSetDuelDie = vi.fn();
  const onSkipDuel = vi.fn();
  const props = {
    ...NAMES,
    kicking: "home" as const,
    viewerSide: "home" as const,
    kickoff: {
      d1: null,
      d2: null,
      registered: false,
      followUp: null,
      source: null,
      duelManual: false,
      ...kickoff,
    },
    onRoll,
    onRollDuel,
    onRegister,
    onSetDie,
    onSetDuelDie,
    onSkipDuel,
    ...extra,
  };
  const view = render(<ActaKickoffGate {...props} />);
  return { ...view, onRoll, onRollDuel, onRegister, onSetDie, onSetDuelDie, onSkipDuel, props };
}

describe("ActaKickoffGate — the sequential kickoff acta (design C)", () => {
  it("headers the gate with the Patea/Recibe chips and screens the 2D6 roll with the rulebook intro", () => {
    gate({});
    expect(screen.getByText(/PATADA INICIAL · EVENTO 2D6/)).toBeTruthy();
    expect(screen.getByText(/Patea · Águilas de Khemri/)).toBeTruthy();
    expect(screen.getByText(/Recibe · Colmillos del Caos/)).toBeTruthy();
    // The verbatim intro quote («…el Entrenador del equipo pateador tira 2D6…»).
    expect(
      screen.getByText(/Inmediatamente después de que el chute se desvíe/),
    ).toBeTruthy();
  });

  it("row ① rolls the 2D6 through the die button and locks it after the throw", () => {
    const { onRoll } = gate({});
    const roll = screen.getByRole("button", { name: "Tirar 2D6" });
    expect((roll as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(roll);
    expect(onRoll).toHaveBeenCalledTimes(1);
    cleanup();

    gate({ d1: 3, d2: 5 });
    expect(
      (screen.getByRole("button", { name: "Tirar 2D6" }) as HTMLButtonElement)
        .disabled,
    ).toBe(true);
  });

  it("row ② shows the sum, the rolled event name and the VERBATIM effect", () => {
    gate({ d1: 1, d2: 5 });
    expect(screen.getByText(/2D6 = 6/)).toBeTruthy();
    expect(screen.getByText("LOS HINCHAS ANIMAN")).toBeTruthy();
    expect(
      screen.getByText(
        /Cada Entrenador tira 1D6 y le suma el número de Animadoras de su Hoja de plantilla/,
      ),
    ).toBeTruthy();
  });

  it("row ③ is an opposed duel (two 1D6 buttons TÚ vs RIVAL) ONLY on opposed faces", () => {
    gate({ d1: 1, d2: 5 });
    expect(screen.getByText("③ Duelo 1D6")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Tirar 1D6 · TÚ" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tirar 1D6 · RIVAL" }),
    ).toBeTruthy();
    // Tie rule PER THAT EVENT'S TEXT (6/7: highest, tie → both win).
    expect(screen.getByText(/empate → ambos ganan el beneficio/)).toBeTruthy();
    cleanup();

    const manual = gate({ d1: 2, d2: 2 });
    expect(manual.container.textContent).not.toMatch(/③ Duelo 1D6/);
    expect(manual.container.textContent).not.toMatch(/Tirar 1D6 · TÚ/);
  });

  it("manual faces carry «Aplicación manual en la demo» on the effect row; weather faces point at the new Clima roll", () => {
    const manual = gate({ d1: 1, d2: 1 });
    expect(screen.getByText("ÁRBITRO INTIMIDADO")).toBeTruthy();
    expect(manual.container.textContent).toMatch(
      /Aplicación manual en la demo/,
    );
    cleanup();

    const weather = gate({ d1: 3, d2: 5 });
    expect(screen.getByText("CLIMA CAMBIANTE")).toBeTruthy();
    expect(
      screen.getByText(/Nueva tirada de Clima al registrar/),
    ).toBeTruthy();
    expect(weather.container.textContent).not.toMatch(/③ Duelo 1D6/);
  });

  it("the duel buttons roll each side's 1D6 and the totals/tie-rule line resolves", () => {
    const home = gate({ d1: 1, d2: 5, followUp: { home: null, away: null } });
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D6 · TÚ" }));
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D6 · RIVAL" }));
    expect(home.onRollDuel).toHaveBeenCalledWith("home");
    expect(home.onRollDuel).toHaveBeenCalledWith("away");
    cleanup();

    // Viewing as the away coach: TÚ maps to away, RIVAL to home.
    const away = gate(
      { d1: 1, d2: 5, followUp: { home: null, away: null } },
      { viewerSide: "away" },
    );
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D6 · TÚ" }));
    expect(away.onRollDuel).toHaveBeenCalledWith("away");
    cleanup();

    // Resolved duel: totals + winner (5 vs 3 → the home coach).
    gate({ d1: 1, d2: 5, followUp: { home: 5, away: 3 } });
    expect(
      screen.getByText(/Duelo 1D6: 5 vs 3 → gana Águilas de Khemri/),
    ).toBeTruthy();
    cleanup();

    // Tie (6/7 face): both coaches win the benefit.
    gate({ d1: 1, d2: 5, followUp: { home: 4, away: 4 } });
    expect(
      screen.getByText(/Duelo 1D6: 4 vs 4 → empate: ambos ganan el beneficio/),
    ).toBeTruthy();
  });

  it("row ④ is the registro line «Kickoff · <evento> → …»", () => {
    gate({ d1: 1, d2: 5, followUp: { home: 5, away: 3 } });
    expect(
      screen.getByText(
        /Kickoff · LOS HINCHAS ANIMAN → beneficio para Águilas de Khemri \(5 vs 3\)/,
      ),
    ).toBeTruthy();
    cleanup();

    gate({ d1: 1, d2: 5, followUp: { home: null, away: null } });
    expect(
      screen.getByText(
        /Kickoff · LOS HINCHAS ANIMAN → duelo sin resolver \(manual\)/,
      ),
    ).toBeTruthy();
  });

  it("the 11-face table chips highlight the rolled sum", () => {
    const { container } = gate({ d1: 3, d2: 5 });
    const chips = container.querySelectorAll('[data-testid="kickoff-face-chip"]');
    expect(chips).toHaveLength(11);
    const active = container.querySelector(
      '[data-testid="kickoff-face-chip"][data-sum="8"]',
    );
    expect(active?.className).toContain("bg-red");
    const other = container.querySelector(
      '[data-testid="kickoff-face-chip"][data-sum="2"]',
    );
    expect(other?.className).not.toContain("bg-red");
  });

  it("the footnote keeps the ball-landing rule and the two closing quotes", () => {
    gate({});
    expect(
      screen.getByText(
        /El balón aterriza después del evento — Recepción libre si sale de banda\./,
      ),
    ).toBeTruthy();
    expect(
      screen.getByText(/TODO LO QUE SUBE, BAJA: En cuanto se haya resuelto/),
    ).toBeTruthy();
    expect(
      screen.getByText(/RECEPCIÓN LIBRE: Para que la patada sea legal/),
    ).toBeTruthy();
  });

  it("the footer CTA registers into the acta and is disabled until the 2D6 roll", () => {
    const idle = gate({});
    const ctaIdle = screen.getByRole("button", {
      name: "REGISTRAR EN ACTA Y CONTINUAR",
    });
    expect((ctaIdle as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(ctaIdle);
    expect(idle.onRegister).not.toHaveBeenCalled();
    cleanup();

    const ready = gate({ d1: 1, d2: 5 });
    const cta = screen.getByRole("button", {
      name: "REGISTRAR EN ACTA Y CONTINUAR",
    });
    expect((cta as HTMLButtonElement).disabled).toBe(false);
    fireEvent.click(cta);
    expect(ready.onRegister).toHaveBeenCalledTimes(1);
    expect(kickoffEventFor(1, 5).name).toBe("LOS HINCHAS ANIMAN");
  });
});

describe("U12 · L32 — manual or automatic 2D6, per-coach duel, optional skip", () => {
  it("row ① renders TWO separate die fields (each face shown individually)", () => {
    gate({ d1: 4, d2: 3 });
    const one = screen.getByLabelText("Dado 1 del kickoff") as HTMLInputElement;
    const two = screen.getByLabelText("Dado 2 del kickoff") as HTMLInputElement;
    expect(one.value).toBe("4");
    expect(two.value).toBe("3");
  });

  it("typing each die by hand resolves the event and enables the CTA (no roll needed)", () => {
    const { onSetDie } = gate({});
    fireEvent.change(screen.getByLabelText("Dado 1 del kickoff"), {
      target: { value: "4" },
    });
    fireEvent.change(screen.getByLabelText("Dado 2 del kickoff"), {
      target: { value: "3" },
    });
    expect(onSetDie).toHaveBeenCalledWith(1, 4);
    expect(onSetDie).toHaveBeenCalledWith(2, 3);
    expect(screen.getByRole("button", { name: "Tirar 2D6" })).toBeTruthy();
    cleanup();

    gate({ d1: 4, d2: 3 });
    expect(screen.getByText("ENTRENADOR BRILLANTE")).toBeTruthy();
    expect(
      (
        screen.getByRole("button", {
          name: "REGISTRAR EN ACTA Y CONTINUAR",
        }) as HTMLButtonElement
      ).disabled,
    ).toBe(false);
  });

  it("out-of-range input is ignored; an empty field clears the die", () => {
    const ignored = gate({});
    fireEvent.change(screen.getByLabelText("Dado 1 del kickoff"), {
      target: { value: "9" },
    });
    expect(ignored.onSetDie).not.toHaveBeenCalled();
    cleanup();

    const clearing = gate({ d1: 4, d2: 3 });
    fireEvent.change(screen.getByLabelText("Dado 1 del kickoff"), {
      target: { value: "" },
    });
    expect(clearing.onSetDie).toHaveBeenCalledWith(1, null);
  });

  it("an automatic roll locks both fields and the roll button", () => {
    gate({ d1: 3, d2: 5, source: "auto" });
    expect(
      (screen.getByLabelText("Dado 1 del kickoff") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (screen.getByLabelText("Dado 2 del kickoff") as HTMLInputElement).disabled,
    ).toBe(true);
    expect(
      (
        screen.getByRole("button", { name: "Tirar 2D6" }) as HTMLButtonElement
      ).disabled,
    ).toBe(true);
  });

  it("the duel gives each coach their OWN throw: one button and one field per side", () => {
    const { onSetDuelDie } = gate({
      d1: 1,
      d2: 5,
      followUp: { home: null, away: null },
    });
    expect(screen.getByText(/Cada entrenador tira su propio dado/)).toBeTruthy();
    const mine = screen.getByLabelText("Dado TÚ (manual)") as HTMLInputElement;
    const theirs = screen.getByLabelText("Dado RIVAL (manual)") as HTMLInputElement;
    fireEvent.change(mine, { target: { value: "4" } });
    expect(onSetDuelDie).toHaveBeenCalledWith("home", 4);
    fireEvent.change(theirs, { target: { value: "6" } });
    expect(onSetDuelDie).toHaveBeenCalledWith("away", 6);
    expect(screen.getByRole("button", { name: "Tirar 1D6 · TÚ" })).toBeTruthy();
    expect(
      screen.getByRole("button", { name: "Tirar 1D6 · RIVAL" }),
    ).toBeTruthy();
  });

  it("the opposed duel can be resolved manually: skip marks it and replaces the rolls", () => {
    const { onSkipDuel } = gate({
      d1: 1,
      d2: 5,
      followUp: { home: null, away: null },
    });
    fireEvent.click(
      screen.getByRole("button", { name: "Duelo resuelto manualmente" }),
    );
    expect(onSkipDuel).toHaveBeenCalledTimes(1);
    cleanup();

    gate({
      d1: 1,
      d2: 5,
      followUp: { home: null, away: null },
      duelManual: true,
    });
    expect(screen.getByText(/Duelo resuelto manualmente en la mesa/)).toBeTruthy();
    expect(
      screen.queryByRole("button", { name: "Tirar 1D6 · TÚ" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Duelo resuelto manualmente" }),
    ).toBeNull();
  });
});

describe("ActaKickoffGate — T34 · migración del dado del duelo a DieD6", () => {
  // WHY (T34, L121): the duel dice (one 1D6 per coach) migrate to the shared
  // DieD6 (highlight default "none") keeping their pinned button names via
  // the component's rollLabel prop.

  it("los dos dados 1D6 del duelo se renderizan con el componente DieD6 (TÚ y RIVAL)", () => {
    gate({ d1: 1, d2: 5, followUp: { home: null, away: null } });
    expect(screen.getByRole("img", { name: /Dado 1D6 · TÚ/ })).toBeTruthy();
    expect(screen.getByRole("img", { name: /Dado 1D6 · RIVAL/ })).toBeTruthy();
  });
});
