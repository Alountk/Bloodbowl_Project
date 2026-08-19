import { describe, expect, it } from "vitest";
import { render, screen, within, fireEvent } from "@testing-library/react";
import type { Race, Team } from "../types";
import { DEFAULT_COACHING } from "../types";
import { getRaceById } from "../data/races";
import { TeamDetailView } from "./TeamDetailView";

const humanRace = getRaceById("human") as Race;

const baseTeam: Team = {
  id: "t1",
  name: "Reikland Reavers",
  raceId: "human",
  leagueId: null,
  coaching: { ...DEFAULT_COACHING },
  roster: [],
};

/** Locates the coaching table and the row identified by its first (Concepto) cell. */
function coachingRow(label: string) {
  const heading = screen.getByRole("heading", { name: "Cuerpo técnico" });
  const table = heading.parentElement?.querySelector("table");
  expect(table).not.toBeNull();
  const row = within(table as HTMLElement)
    .getAllByRole("row")
    .find((r) => within(r).queryByText(label));
  expect(row, `coaching row "${label}" not found`).toBeDefined();
  return row as HTMLElement;
}

function coachingTotalRow() {
  const heading = screen.getByRole("heading", { name: "Cuerpo técnico" });
  const table = heading.parentElement?.querySelector("table");
  expect(table).not.toBeNull();
  const rows = within(table as HTMLElement).getAllByRole("row");
  const totalRow = rows.find((r) => within(r).queryByText("Total cuerpo técnico"));
  expect(totalRow, "total cuerpo técnico row not found").toBeDefined();
  return totalRow as HTMLElement;
}

function treasuryCard(label: string): HTMLElement {
  const heading = screen.getByRole("heading", { name: "Tesorería" });
  const section = heading.closest("section") as HTMLElement;
  const labelEl = within(section).getByText(label);
  return labelEl.closest("div") as HTMLElement;
}

/** Locates the coaching table DOM tree to assert its scroll wrapper. */
function coachingTableElement(): HTMLElement {
  const heading = screen.getByRole("heading", { name: "Cuerpo técnico" });
  const table = heading.parentElement?.querySelector("table");
  expect(table).not.toBeNull();
  return table as HTMLElement;
}

describe("TeamDetailView", () => {
  it("renders the Style A hero: team name, bold race, Sin liga, and tags", () => {
    render(<TeamDetailView team={baseTeam} race={humanRace} />);

    // Team name is the primary heading.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Reikland Reavers");

    // Meta line: bold race name + "Sin liga" for an unassigned team.
    const meta = screen.getByText(/Sin liga/);
    expect(meta).toBeTruthy();
    // Race name is the bold element inside the meta line.
    expect(meta.querySelector("b")?.textContent).toBe("Human");

    // Two tags.
    expect(screen.getByText("Equipo listo")).toBeTruthy();
    // treasury = 1 000 000 for an empty roster with default coaching.
    expect(screen.getAllByText("Tesorería: 1 000 000").length).toBeGreaterThanOrEqual(1);
  });

  it("shows the resolved league name for an assigned team and never raw tokens", () => {
    const assignedTeam: Team = { ...baseTeam, leagueId: "league-1" };
    render(<TeamDetailView team={assignedTeam} race={humanRace} leagueName="North Reikland League" />);

    expect(screen.getByText(/North Reikland League/)).toBeTruthy();
    expect(screen.queryByText(/Sin liga/)).toBeNull();
    expect(screen.queryByText(/league-1/)).toBeNull();
  });

  it("renders the three Spanish book section headings", () => {
    render(<TeamDetailView team={baseTeam} race={humanRace} />);

    expect(screen.getByRole("heading", { name: "Plantilla" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cuerpo técnico" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tesorería" })).toBeTruthy();
  });

  it("renders readOnly player names and no remove buttons", () => {
    const team: Team = {
      ...baseTeam,
      roster: [
        { id: "p1", name: "John", positionalKey: "lineman" },
        { id: "p2", name: "Jane", positionalKey: "blitzer" },
      ],
    };
    render(<TeamDetailView team={team} race={humanRace} />);

    expect(screen.getByText("John")).toBeTruthy();
    expect(screen.getByText("Jane")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /remove/i })).toBeNull();
  });

  it("renders the RosterTable footer suppressed (no apothecary prop passed)", () => {
    const team: Team = {
      ...baseTeam,
      roster: [{ id: "p1", name: "John", positionalKey: "lineman" }],
    };
    render(<TeamDetailView team={team} race={humanRace} />);

    // The rulebook footer "0-8 Segundas oportunidades: …" only renders when the
    // apothecary prop is passed. TeamDetailView must NOT pass it (coaching table owns it).
    expect(screen.queryByText(/0-8 Segundas oportunidades/)).toBeNull();
    expect(screen.queryByText(/Apotecario: SÍ/)).toBeNull();
    expect(screen.queryByText(/Apotecario: NO/)).toBeNull();
  });

  it("shows raw raceId when race is not in catalog (FALLBACK_RACE)", () => {
    const unknownRace: Race = {
      id: "ancient-chaos",
      name: "ancient-chaos",
      rerollCost: 0,
      positionals: [],
    };
    const team: Team = { ...baseTeam, raceId: "ancient-chaos", name: "Chaos Warriors" };
    render(<TeamDetailView team={team} race={unknownRace} />);

    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain("Chaos Warriors");
    expect(screen.getByText(/ancient-chaos/)).toBeTruthy();
  });

  it("renders coaching breakdown rows with unit and total; apothecary NO when absent", () => {
    const team: Team = {
      ...baseTeam,
      coaching: {
        rerolls: 2,
        dedicatedFans: 1,
        assistantCoaches: 1,
        cheerleaders: 0,
        apothecary: false,
      },
    };
    render(<TeamDetailView team={team} race={humanRace} />);

    // Segundas oportunidades: 2 × 50 000 = 100 000.
    const rerolls = coachingRow("Segundas oportunidades");
    expect(within(rerolls).getByText("2")).toBeTruthy();
    expect(within(rerolls).getByText("50 000")).toBeTruthy();
    expect(within(rerolls).getByText("100 000")).toBeTruthy();

    // Fanáticos dedicados: quantity 1, paid upgrade 0 → total 0.
    const fans = coachingRow("Fanáticos dedicados");
    expect(within(fans).getByText("0")).toBeTruthy();

    // Entrenadores asistentes: 1 × 10 000 (unit and total both = 10 000).
    const coaches = coachingRow("Entrenadores asistentes");
    expect(within(coaches).getAllByText("10 000")).toHaveLength(2);

    // Animadoras: quantity 0 → total 0 (qty cell and total cell both "0").
    const cheerleaders = coachingRow("Animadoras");
    expect(within(cheerleaders).getAllByText("0")).toHaveLength(2);

    // Apotecario always present: NO, unit 50 000, total 0.
    const apothecary = coachingRow("Apotecario");
    expect(within(apothecary).getByText("NO")).toBeTruthy();
    expect(within(apothecary).getAllByText("50 000").length).toBe(1);
    expect(within(apothecary).getByText("0")).toBeTruthy();
  });

  it("shows Apotecario SÍ with total 50 000 and total row = items + 50 000 when present", () => {
    const team: Team = {
      ...baseTeam,
      coaching: {
        rerolls: 2,
        dedicatedFans: 1,
        assistantCoaches: 1,
        cheerleaders: 0,
        apothecary: true,
      },
    };
    render(<TeamDetailView team={team} race={humanRace} />);

    const apothecary = coachingRow("Apotecario");
    expect(within(apothecary).getByText("SÍ")).toBeTruthy();
    expect(within(apothecary).getAllByText("50 000")).toHaveLength(2); // unit + total

    // items Σ = 110 000; + 50 000 apothecary = 160 000.
    const totalRow = coachingTotalRow();
    expect(within(totalRow).getByText("160 000")).toBeTruthy();
  });

  it("shows total cuerpo técnico = items sum when no apothecary", () => {
    const team: Team = {
      ...baseTeam,
      coaching: {
        rerolls: 2,
        dedicatedFans: 1,
        assistantCoaches: 1,
        cheerleaders: 0,
        apothecary: false,
      },
    };
    render(<TeamDetailView team={team} race={humanRace} />);

    const totalRow = coachingTotalRow();
    expect(within(totalRow).getByText("110 000")).toBeTruthy();
  });

  it("renders three treasury cards with rulebook-formatted values", () => {
    // roster: 3 linemen × 50 000 = 150 000; coaching: 2 rerolls (100 000), no apothecary.
    const team: Team = {
      ...baseTeam,
      roster: [
        { id: "p1", name: "A", positionalKey: "lineman" },
        { id: "p2", name: "B", positionalKey: "lineman" },
        { id: "p3", name: "C", positionalKey: "lineman" },
      ],
      coaching: { rerolls: 2, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false },
    };
    // Treasury = 1 000 000 − 150 000 roster − 100 000 coaching = 750 000.
    render(<TeamDetailView team={team} race={humanRace} />);

    const costePlantilla = treasuryCard("Coste plantilla");
    expect(within(costePlantilla).getByText("150 000")).toBeTruthy();

    const cuerpoTecnico = treasuryCard("Cuerpo técnico");
    expect(within(cuerpoTecnico).getByText("100 000")).toBeTruthy();

    const restante = treasuryCard("Tesorería restante");
    expect(within(restante).getByText("750 000")).toBeTruthy();
  });

  it("includes apothecary in the coaching card and reduces remaining treasury", () => {
    // 3 linemen (150 000) + 2 rerolls (100 000) + apothecary (50 000) = 300 000 spent.
    const team: Team = {
      ...baseTeam,
      roster: [
        { id: "p1", name: "A", positionalKey: "lineman" },
        { id: "p2", name: "B", positionalKey: "lineman" },
        { id: "p3", name: "C", positionalKey: "lineman" },
      ],
      coaching: { rerolls: 2, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: true },
    };
    // Treasury = 1 000 000 − 150 000 roster − 150 000 coaching (incl. apothecary) = 700 000.
    render(<TeamDetailView team={team} race={humanRace} />);

    const cuerpoTecnico = treasuryCard("Cuerpo técnico");
    expect(within(cuerpoTecnico).getByText("150 000")).toBeTruthy();

    const restante = treasuryCard("Tesorería restante");
    expect(within(restante).getByText("700 000")).toBeTruthy();
  });

  describe("coaching table horizontal scroll", () => {
    it("wraps the coaching table in an overflow-x-auto wrapper and min-width panel", () => {
      render(<TeamDetailView team={baseTeam} race={humanRace} />);
      // Table -> panel (min-w) -> overflow-x-auto wrapper.
      const panel = coachingTableElement().parentElement;
      expect(panel?.className).toContain("min-w-[640px]");
      const wrapper = panel?.parentElement;
      expect(wrapper?.className).toContain("overflow-x-auto");
    });
  });

  describe("progression wiring (RAU-46 roster)", () => {
    const roster = [
      { id: "p1", name: "Marty", positionalKey: "blitzer" },
      { id: "p2", name: "Jane", positionalKey: "lineman" },
    ];

    it("renders the TourPlay roster table with progression and opens the improve modal on a row click", () => {
      render(
        <TeamDetailView
          team={{ ...baseTeam, roster }}
          race={humanRace}
          progression={{
            p1: {
              rosterPlayerId: "p1",
              pe: 12,
              // dodge is élite and NOT a blitzer starting skill → bought → ◆ diamond.
              skills: ["dodge"],
              improvements: 2,
              valueBonus: 20_000,
              alive: true,
              missNextMatch: false,
              injuries: [],
              stats: { casualties: 1, mvp: 2 },
            },
            p2: {
              rosterPlayerId: "p2",
              pe: 3,
              skills: [],
              improvements: 0,
              valueBonus: 0,
              alive: true,
              missNextMatch: false,
              injuries: [],
              stats: { casualties: 0, mvp: 0 },
            },
          }}
          onImprove={async () => ({})}
        />,
      );
      // The separate Progresión section is gone; progression lives in the table.
      expect(screen.queryByRole("heading", { name: "Progresión" })).toBeNull();
      expect(screen.getByTestId("team-roster-table")).toBeTruthy();
      expect(screen.getByTestId("spp-pe-p1").textContent).toContain("★12");
      expect(screen.getByTestId("cas-p1").textContent).toBe("1");
      expect(screen.getByTestId("mvp-p1").textContent).toBe("2");
      // élite bought skill renders with the ◆ diamond inside the table.
      expect(screen.getAllByTestId("elite-diamond").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Marty").length).toBeGreaterThanOrEqual(1);
      expect(screen.getAllByText("Jane").length).toBeGreaterThanOrEqual(1);

      // A row click opens the PE-spending modal.
      fireEvent.click(screen.getByTestId("roster-row-p1"));
      expect(screen.getByTestId("improve-modal")).toBeTruthy();
    });

    it("renders the roster read-only (no Progresión section, no modal) without progression data", () => {
      render(<TeamDetailView team={{ ...baseTeam, roster }} race={humanRace} />);
      expect(screen.queryByRole("heading", { name: "Progresión" })).toBeNull();
      expect(screen.getByTestId("team-roster-table")).toBeTruthy();
      expect(screen.queryByTestId("spp-pe-p1")).toBeNull();
      expect(screen.getByText("Marty")).toBeTruthy(); // roster still renders
      fireEvent.click(screen.getByTestId("roster-row-p1"));
      expect(screen.queryByTestId("improve-modal")).toBeNull();
    });
  });
});
