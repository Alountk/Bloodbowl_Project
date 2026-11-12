import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";

import { listInducements } from "@/lib/rules/inducements";
import { weatherFromRoll } from "@/lib/rules/weather";

import {
  ActaPreMatchFlow,
  type ActaPreMatchSnapshot,
  type PreMatchCommit,
} from "./actaPreMatchFlow";

/**
 * Fase 1 · Pre-partido (S5 + S2c): the capture is scoped PER SIDE — each
 * coach fills only their own rolls and inducements (the user: «cada usuario
 * deberia ver el suyo… las Águilas de Khemri no deberian ver las cosas de
 * Colmillos del Caos y viceversa») — and the «Lo que ha sucedido» report
 * informs every CONFIRMED fact of both sides («se informará de lo que ha
 * sucedido»). No jest-dom matchers (.textContent / regex / role queries).
 */

const EMPTY: ActaPreMatchSnapshot = {
  fans: { home: null, away: null },
  weather: null,
  weatherDice: { home: null, away: null },
  inducements: { home: [], away: [] },
  inducementsDone: { home: false, away: false },
  kickDice: { home: null, away: null },
  kicking: null,
};

function setup(
  snapshot: Partial<ActaPreMatchSnapshot> = {},
  viewerSide: "home" | "away" = "home",
) {
  const commits: PreMatchCommit[] = [];
  const dice = { d3: vi.fn(() => 2), d6: vi.fn(() => 5) };
  render(
    <ActaPreMatchFlow
      homeName="Águilas de Khemri"
      awayName="Colmillos del Caos"
      homeBase={4}
      awayBase={3}
      viewerSide={viewerSide}
      snapshot={{ ...EMPTY, ...snapshot }}
      onCommit={(commit) => commits.push(commit)}
      dice={dice}
    />,
  );
  return { commits, dice };
}

const report = () => screen.getByRole("region", { name: "Lo que ha sucedido" });
const step1 = () => screen.getByRole("group", { name: "Paso 1 · Los Hinchas" });
const step2 = () => screen.getByRole("group", { name: "Paso 2 · El Clima" });
const step3 = () => screen.getByRole("group", { name: "Paso 3 · Incentivos" });
const step4 = () =>
  screen.getByRole("group", { name: "Paso 4 · Equipo pateador" });
const displayName = (id: string) =>
  listInducements().find((entry) => entry.id === id)?.displayName ?? id;

describe("ActaPreMatchFlow — Antes del partido (S5 + S2c)", () => {
  it("opens with the four rulebook steps in order plus the substitutes note", () => {
    setup();
    expect(
      screen.getByRole("region", { name: "Antes del partido" }),
    ).toBeTruthy();
    const headings = screen.getAllByRole("heading", { level: 3 });
    expect(headings.map((heading) => heading.textContent)).toEqual([
      "1 · Los Hinchas",
      "2 · El Clima",
      "3 · Incentivos",
      "4 · Equipo pateador",
      "Lo que ha sucedido",
    ]);
    expect(document.body.textContent).toMatch(
      /Sustitutos: solo en liga — no aplica en esta demo/,
    );
  });

  it("scopes the capture to the viewing coach — the rival's controls are absent", () => {
    setup({}, "home");
    expect(
      within(step1()).getByRole("spinbutton", {
        name: "D3 afición (Águilas de Khemri)",
      }),
    ).toBeTruthy();
    expect(
      within(step1()).queryByRole("spinbutton", {
        name: "D3 afición (Colmillos del Caos)",
      }),
    ).toBeNull();
    expect(
      within(step2()).queryByRole("spinbutton", {
        name: "D6 clima (Colmillos del Caos)",
      }),
    ).toBeNull();
    expect(
      within(step4()).queryByRole("spinbutton", {
        name: "D6 pateador (Colmillos del Caos)",
      }),
    ).toBeNull();
    expect(
      within(step3()).queryByRole("group", {
        name: "Incentivos Colmillos del Caos",
      }),
    ).toBeNull();
    expect(
      within(step3()).getByRole("group", {
        name: "Incentivos Águilas de Khemri",
      }),
    ).toBeTruthy();
  });

  it("manual fan entry totals base + 1D3 and commits only my side's line", () => {
    const { commits } = setup({}, "home");
    fireEvent.change(
      within(step1()).getByRole("spinbutton", {
        name: "D3 afición (Águilas de Khemri)",
      }),
      { target: { value: "3" } },
    );
    expect(document.body.textContent).toMatch(/4 \+ 3 = 7/);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mi tirada de hinchas" }),
    );
    expect(commits).toEqual([
      { step: "fanRoll", side: "home", line: { base: 4, dice: 3, total: 7 } },
    ]);
  });

  it("Auto fan mode rolls the injected die and totals it", () => {
    const { commits, dice } = setup({}, "away");
    fireEvent.click(within(step1()).getByRole("button", { name: "Auto" }));
    fireEvent.click(
      within(step1()).getByRole("button", { name: "Tirar afición" }),
    );
    expect(dice.d3).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).toMatch(/3 \+ 2 = 5/);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mi tirada de hinchas" }),
    );
    expect(commits).toEqual([
      { step: "fanRoll", side: "away", line: { base: 3, dice: 2, total: 5 } },
    ]);
  });

  it("manual weather: my 1D6 joins the rival's confirmed die into the 2D6 table", () => {
    const { commits } = setup({ weatherDice: { home: null, away: 4 } }, "home");
    fireEvent.change(
      within(step2()).getByRole("spinbutton", {
        name: "D6 clima (Águilas de Khemri)",
      }),
      { target: { value: "3" } },
    );
    expect(document.body.textContent).toMatch(/2D6 = 7/);
    expect(document.body.textContent).toContain(weatherFromRoll(7).label);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mi dado de clima" }),
    );
    expect(commits).toEqual([{ step: "weatherRoll", side: "home", die: 3 }]);
  });

  it("Auto weather mode rolls my injected die", () => {
    const { commits, dice } = setup({}, "home");
    fireEvent.click(within(step2()).getByRole("button", { name: "Auto" }));
    fireEvent.click(within(step2()).getByRole("button", { name: "Tirar clima" }));
    expect(dice.d6).toHaveBeenCalledTimes(1);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mi dado de clima" }),
    );
    expect(commits).toEqual([{ step: "weatherRoll", side: "home", die: 5 }]);
  });

  it("inducement picker shows the rulebook price/cap, honors the cap and commits only my cart", () => {
    const { commits } = setup({}, "home");
    const group = within(step3()).getByRole("group", {
      name: "Incentivos Águilas de Khemri",
    });
    expect(group.textContent).toMatch(/Sobornos/);
    expect(group.textContent).toMatch(/100\.000 M\.O\./);
    expect(group.textContent).toMatch(/máx\. 3/);
    for (let i = 0; i < 5; i += 1) {
      fireEvent.click(
        within(group).getByRole("button", { name: "Añadir Sobornos" }),
      );
    }
    expect(group.textContent).toMatch(/Sobornos ×3/);
    expect(group.textContent).not.toMatch(/Sobornos ×4/);
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mis incentivos" }),
    );
    expect(commits).toEqual([
      { step: "inducements", side: "home", items: [{ id: "bribes", count: 3 }] },
    ]);
  });

  it("keeps the petty-cash reference line in the incentives step", () => {
    setup();
    expect(document.body.textContent).toMatch(
      /Caja menor: diferencia de VAE \+ gasto rival en incentivos \(máx\. \+50\.000 M\.O\. de tesorería\)/,
    );
  });

  it("my kicking die commits alone (the rival rolls their own)", () => {
    const { commits } = setup({ kickDice: { home: null, away: 3 } }, "home");
    fireEvent.change(
      within(step4()).getByRole("spinbutton", {
        name: "D6 pateador (Águilas de Khemri)",
      }),
      { target: { value: "5" } },
    );
    fireEvent.click(
      screen.getByRole("button", { name: "Confirmar mi tirada de pateador" }),
    );
    expect(commits).toEqual([{ step: "kickRoll", side: "home", die: 5 }]);
  });

  it("kicking: committed ties force a shared re-roll", () => {
    const { commits } = setup({ kickDice: { home: 4, away: 4 } }, "home");
    expect(document.body.textContent).toMatch(/Empate: repetir tirada/);
    fireEvent.click(screen.getByRole("button", { name: "Repetir tirada" }));
    expect(commits).toEqual([{ step: "kickTie" }]);
  });

  it("kicking: the winner's coach decides who kicks", () => {
    const { commits } = setup({ kickDice: { home: 5, away: 3 } }, "home");
    expect(document.body.textContent).toMatch(/Gana Águilas de Khemri/);
    fireEvent.click(
      screen.getByRole("button", { name: "Patea Colmillos del Caos" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Confirmar pateador" }));
    expect(commits).toEqual([{ step: "kicking", kicking: "away" }]);
  });

  it("kicking: the loser's coach gets no decision controls", () => {
    setup({ kickDice: { home: 5, away: 3 } }, "away");
    expect(
      screen.queryByRole("button", { name: "Patea Águilas de Khemri" }),
    ).toBeNull();
    expect(
      screen.queryByRole("button", { name: "Patea Colmillos del Caos" }),
    ).toBeNull();
  });

  it("the report informs every confirmed fact, including the rival's", () => {
    setup(
      {
        fans: { home: null, away: { base: 3, dice: 2, total: 5 } },
        inducements: { home: [], away: [{ id: "weather-mage", count: 1 }] },
        inducementsDone: { home: false, away: true },
      },
      "home",
    );
    const text = report().textContent ?? "";
    expect(text).toMatch(/Afición — Colmillos del Caos: 3 \+ 🎲2 = 5/);
    expect(text).not.toMatch(/Afición — Águilas/);
    expect(text).toContain(
      `Incentivos — Colmillos del Caos: ${displayName("weather-mage")} ×1`,
    );
  });

  it("the report shows the resolved weather and the kicking outcome", () => {
    setup(
      {
        weather: { roll: 7, value: weatherFromRoll(7).kind },
        kickDice: { home: 5, away: 3 },
        kicking: "away",
      },
      "home",
    );
    const text = report().textContent ?? "";
    expect(text).toMatch(/Clima: 2D6 = 7/);
    expect(text).toContain(weatherFromRoll(7).label);
    expect(text).toMatch(/Pateador: 🎲5 vs 🎲3 — gana Águilas de Khemri/);
    expect(text).toMatch(/Quién patea: Colmillos del Caos/);
  });

  it("an empty capture reports «Aún no hay nada confirmado.»", () => {
    setup();
    expect(report().textContent ?? "").toMatch(/Aún no hay nada confirmado\./);
  });

  it("step states reflect MY side: confirmed shows «Hecho», pending shows «Pendiente»", () => {
    setup(
      {
        fans: { home: null, away: { base: 3, dice: 2, total: 5 } },
        weather: { roll: 7, value: weatherFromRoll(7).kind },
        inducementsDone: { home: true, away: false },
      },
      "home",
    );
    // Step 1 is pending for ME even though the rival's roll is confirmed.
    expect(within(step1()).getByText("Pendiente")).toBeTruthy();
    expect(within(step2()).getByText("Hecho")).toBeTruthy();
    expect(within(step3()).getByText("Hecho")).toBeTruthy();
    expect(within(step4()).getByText("Pendiente")).toBeTruthy();
  });
});
