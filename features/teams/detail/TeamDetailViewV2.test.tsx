import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlayerProgressionCore, Race, Team } from "../types";
import { DEFAULT_COACHING } from "../types";
import { getRaceById } from "../data/races";
import { skillDisplayName } from "@/lib/progression";
import { mockMatchMedia } from "../test/matchMedia";
import { TeamDetailViewV2 } from "./TeamDetailViewV2";

/**
 * TeamDetailViewV2 component tests (task 3.3, UIR-2 / UIR-4).
 *
 * Pins the slice-3 V2 translation:
 *  - the `ui-v2-*` vocabulary ONLY — legacy testid names are never reused;
 *  - identical props contract: the same handlers legacy gets drive the same
 *    modals/dialogs (hire, improve/rename/fire, reorder);
 *  - desktop ruled table vs mobile stacked cards via `useIsDesktop`;
 *  - presentation-only: V2 sources import neither `features/teams/api` nor
 *    `AppProvider` (static import scan below).
 */

const humanRace = getRaceById("human") as Race;

const baseTeam: Team = {
  id: "t1",
  name: "Reikland Reavers",
  raceId: "human",
  leagueId: null,
  coaching: { ...DEFAULT_COACHING },
  roster: [],
  treasury: 0,
};

const threePlayerTeam: Team = {
  ...baseTeam,
  roster: [
    { id: "p1", name: "John", positionalKey: "lineman" },
    { id: "p2", name: "Jane", positionalKey: "lineman" },
    { id: "p3", name: "Dunk", positionalKey: "blitzer" },
  ],
};

/** Progression rows mirroring the legacy table fixture (p1: full RAU-46 row). */
function progressionFor3(): Record<string, PlayerProgressionCore> {
  const base = (rosterPlayerId: string): PlayerProgressionCore => ({
    rosterPlayerId,
    pe: 3,
    skills: [],
    improvements: 0,
    valueBonus: 0,
    alive: true,
    missNextMatch: false,
  });
  return {
    p1: {
      ...base("p1"),
      pe: 10,
      skills: ["block"],
      valueBonus: 20_000,
      injuries: ["cabeza rota"],
      attributeIncreases: { st: 1 },
      stats: { casualties: 2, mvp: 1 },
    },
    p2: base("p2"),
    p3: base("p3"),
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  // Remove the matchMedia stub installed by mockMatchMedia.
  // @ts-expect-error cleanup restores the pristine jsdom window.
  delete window.matchMedia;
});

/** Every data-testid rendered inside the given subtree. */
function testIds(root: HTMLElement): string[] {
  return Array.from(root.querySelectorAll("[data-testid]")).map(
    (el) => el.getAttribute("data-testid") as string,
  );
}

describe("TeamDetailViewV2", () => {
  it("renders the shared props contract: name, race, league and the badge row", () => {
    const team: Team = { ...threePlayerTeam, leagueId: "league-1" };
    render(
      <TeamDetailViewV2 team={team} race={humanRace} leagueName="North Reikland League" />,
    );

    // Hero: serif team name + bold race + resolved league.
    expect(screen.getByRole("heading", { level: 1 }).textContent).toContain(
      "Reikland Reavers",
    );
    const raceEl = screen.getByText("Human");
    expect(raceEl.tagName).toBe("B");
    expect(screen.getByTestId("ui-v2-hero").textContent).toContain(
      "North Reikland League",
    );
    expect(screen.queryByText("league-1")).toBeNull();

    // Back arrow to the team list + badge row (TV / tesorería / liga / listo).
    const back = screen.getByTestId("ui-v2-back");
    expect(back.getAttribute("href")).toBe("/teams");
    expect(screen.getByTestId("ui-v2-tv").textContent).toMatch(/^TV:/);
    expect(screen.getByTestId("ui-v2-treasury-badge").textContent).toContain(
      "Tesorería:",
    );
    expect(screen.getByTestId("ui-v2-league-badge").textContent).toBe(
      "North Reikland League",
    );
    expect(screen.getByTestId("ui-v2-ready-badge").textContent).toBe("Equipo listo");
  });

  it("mounts every ui-v2-* section marker and no legacy testid at all", () => {
    const { container } = render(
      <TeamDetailViewV2
        team={threePlayerTeam}
        race={humanRace}
        progression={progressionFor3()}
        onImprove={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    for (const id of [
      "ui-v2-hero",
      "ui-v2-roster",
      "ui-v2-progresion",
      "ui-v2-coaching",
      "ui-v2-treasury",
    ]) {
      expect(screen.getByTestId(id), `${id} missing`).toBeTruthy();
    }

    // The three bookkeeping headings survive in the V2 presentation.
    expect(screen.getByRole("heading", { name: "Plantilla" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Cuerpo técnico" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Tesorería" })).toBeTruthy();

    // Legacy testid vocabulary must never appear in V2 (task 2.1 / UIR-3).
    const legacy = testIds(container).filter(
      (id) =>
        id === "team-roster-table" ||
        id === "open-hire-dialog" ||
        /^(roster-|spp-|ni-|cas-|mvp-|player-value-|value-breakdown-|reorder-(up|down)-|player-icon|elite-diamond|hire-)/.test(
          id,
        ),
    );
    expect(legacy).toEqual([]);
  });

  it("desktop: renders the ruled roster table with the full legacy information", () => {
    render(
      <TeamDetailViewV2
        team={threePlayerTeam}
        race={humanRace}
        progression={progressionFor3()}
        onImprove={vi.fn()}
        onReorder={vi.fn()}
        onFire={vi.fn()}
        onRename={vi.fn()}
      />,
    );

    const table = screen.getByTestId("ui-v2-roster-table");
    expect(table).toBeTruthy();

    // Brief columns: # / Nombre / Posicional / stats / Habilidades / PE … Acciones.
    expect(within(table).getByText("Nombre")).toBeTruthy();
    expect(within(table).getByText("Posicional")).toBeTruthy();
    expect(within(table).getByText(/Habilidades/)).toBeTruthy();
    expect(within(table).getByText("PE")).toBeTruthy();
    expect(within(table).getByText("Acciones")).toBeTruthy();

    const row = screen.getByTestId("ui-v2-roster-row-p1");
    // Dorsal follows the roster order.
    expect(row.textContent).toContain("1");
    // Name + posicional + (role, race) sub-line.
    expect(within(row).getByText("John")).toBeTruthy();
    expect(within(row).getByText("Human Lineman")).toBeTruthy();
    expect(row.textContent).toContain("Lineman");
    // Stat chips MA/ST/AG/PA/AR with the ST increase highlighted.
    for (const attr of ["MA", "ST", "AG", "PA", "AR"]) {
      expect(within(row).getByText(attr), `stat chip ${attr}`).toBeTruthy();
    }
    expect(within(row).getByText("↑4")).toBeTruthy();
    // Skills (bought with XP, elite marker) — display name from the catalog.
    expect(within(row).getByText(new RegExp(skillDisplayName("block")))).toBeTruthy();
    // PE stars toward the next improvement + progress bar.
    expect(within(row).getByTestId("ui-v2-pe-p1").textContent).toContain("★10");
    expect(within(row).getByTestId("ui-v2-pe-bar-p1")).toBeTruthy();
    // NI / CAS / MVP / Valor — nothing legacy shows may be lost.
    expect(within(row).getByTestId("ui-v2-ni-p1").textContent).toContain("🩹x1");
    expect(within(row).getByTestId("ui-v2-cas-p1").textContent).toBe("2");
    expect(within(row).getByTestId("ui-v2-mvp-p1").textContent).toBe("1");
    expect(within(row).getByTestId("ui-v2-value-p1").textContent).toBe("70 000");
    // Owner reorder affordances live in the acciones column: the first row
    // only offers "down", the second row offers "up".
    expect(within(row).getByTestId("ui-v2-reorder-down-p1")).toBeTruthy();
    expect(within(row).queryByTestId("ui-v2-reorder-up-p1")).toBeNull();
    const row2 = screen.getByTestId("ui-v2-roster-row-p2");
    expect(within(row2).getByTestId("ui-v2-reorder-up-p2")).toBeTruthy();
  });

  it("desktop: reorder arrows hand the swapped sequence to onReorder (RAU-9)", () => {
    const onReorder = vi.fn().mockResolvedValue({});
    render(
      <TeamDetailViewV2
        team={threePlayerTeam}
        race={humanRace}
        progression={progressionFor3()}
        onImprove={vi.fn()}
        onReorder={onReorder}
      />,
    );

    fireEvent.click(screen.getByTestId("ui-v2-reorder-down-p1"));
    expect(onReorder).toHaveBeenCalledWith(["p2", "p1", "p3"]);

    fireEvent.click(screen.getByTestId("ui-v2-reorder-up-p3"));
    expect(onReorder).toHaveBeenLastCalledWith(["p1", "p3", "p2"]);
  });

  it("mobile (<768px): stacked player cards replace the table", () => {
    const { setMatches } = mockMatchMedia(false);
    const { container } = render(
      <TeamDetailViewV2
        team={threePlayerTeam}
        race={humanRace}
        progression={progressionFor3()}
        onImprove={vi.fn()}
        onReorder={vi.fn()}
      />,
    );

    expect(screen.queryByTestId("ui-v2-roster-table")).toBeNull();
    const card = screen.getByTestId("ui-v2-roster-card-p1");
    // Same information as the table, stacked: dorsal, nombre, posicional,
    // stat chips, skills, PE star, meta (NI/CAS/MVP/valor) and affordances.
    expect(card.textContent).toContain("1");
    expect(within(card).getByText("John")).toBeTruthy();
    expect(within(card).getByText("Human Lineman")).toBeTruthy();
    for (const attr of ["MA", "ST", "AG", "PA", "AR"]) {
      expect(within(card).getByText(attr), `stat chip ${attr}`).toBeTruthy();
    }
    expect(within(card).getByText(new RegExp(skillDisplayName("block")))).toBeTruthy();
    expect(within(card).getByTestId("ui-v2-pe-p1").textContent).toContain("★10");
    expect(within(card).getByTestId("ui-v2-value-p1").textContent).toBe("70 000");
    expect(within(card).getByTestId("ui-v2-reorder-down-p1")).toBeTruthy();
    expect(within(card).queryByTestId("ui-v2-reorder-up-p1")).toBeNull();
    expect(within(card).getByTestId("ui-v2-improve-p1")).toBeTruthy();
    expect(within(card).getByTestId("ui-v2-ni-p1").textContent).toContain("🩹x1");

    // Resizing back to desktop swaps the cards for the ruled table.
    act(() => setMatches(true));
    expect(screen.queryByTestId("ui-v2-roster-card-p1")).toBeNull();
    expect(screen.getByTestId("ui-v2-roster-table")).toBeTruthy();
    expect(container.querySelectorAll('[data-testid^="ui-v2-roster-card-"]')).toHaveLength(0);
  });

  it("PE upgrade affordance opens the improve modal driven by props (UIR-2)", () => {
    render(
      <TeamDetailViewV2
        team={threePlayerTeam}
        race={humanRace}
        progression={progressionFor3()}
        onImprove={vi.fn().mockResolvedValue({})}
        onRename={vi.fn().mockResolvedValue({})}
        onFire={vi.fn().mockResolvedValue({})}
      />,
    );

    // The explicit upgrade affordance on the PE cell.
    fireEvent.click(screen.getByTestId("ui-v2-improve-p1"));
    expect(screen.getByTestId("improve-modal")).toBeTruthy();
    expect(screen.getByTestId("modal-pe-label").textContent).toContain("★10");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));

    // …and the whole row is the affordance (hover/click parity with legacy).
    fireEvent.click(screen.getByTestId("ui-v2-roster-row-p2"));
    expect(screen.getByTestId("improve-modal")).toBeTruthy();
  });

  it("hire flow: Contratar opens the dialog and the Editar toggle hides it", () => {
    const onHire = vi.fn().mockResolvedValue({});
    render(
      <TeamDetailViewV2
        team={threePlayerTeam}
        race={humanRace}
        onHire={onHire}
        shieldControl={<div data-testid="fake-shield-control" />}
      />,
    );

    fireEvent.click(screen.getByTestId("ui-v2-hire"));
    expect(screen.getByTestId("hire-dialog")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByTestId("hire-dialog")).toBeNull();

    // "Editar" (aria-pressed) toggles the roster's hire affordance.
    const edit = screen.getByTestId("ui-v2-action-edit");
    expect(edit.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(edit);
    expect(edit.getAttribute("aria-pressed")).toBe("false");
    expect(screen.queryByTestId("ui-v2-hire")).toBeNull();
    fireEvent.click(edit);
    expect(screen.getByTestId("ui-v2-hire")).toBeTruthy();

    // "Emblema" toggles the owner's shield control slot, OPEN by default
    // (legacy parity: the shield control is always visible for the owner).
    expect(screen.getByTestId("fake-shield-control")).toBeTruthy();
    fireEvent.click(screen.getByTestId("ui-v2-action-emblem"));
    expect(screen.queryByTestId("fake-shield-control")).toBeNull();
  });

  it("read-only rival view: no hire, improve or reorder affordances", () => {
    const scouted: Team = {
      ...threePlayerTeam,
      roster: [{ id: "p1", name: "John", positionalKey: "lineman", pe: 7 }],
    };
    const { container } = render(<TeamDetailViewV2 team={scouted} race={humanRace} />);

    expect(screen.queryByTestId("ui-v2-hire")).toBeNull();
    expect(screen.queryByTestId("ui-v2-improve-p1")).toBeNull();
    expect(screen.queryByTestId("ui-v2-reorder-down-p1")).toBeNull();
    expect(screen.queryByTestId("ui-v2-action-edit")).toBeNull();
    expect(screen.queryByTestId("ui-v2-action-emblem")).toBeNull();
    // Read-only players still surface their served PE (legacy RAU-14 parity).
    const roster = screen.getByTestId("ui-v2-roster");
    expect(roster.textContent).toContain("★7");
    expect(container).toBeTruthy();
  });

  it("Progresión card summarizes plantilla PE, bajas and miss-next", () => {
    const progression: Record<string, PlayerProgressionCore> = {
      p1: {
        rosterPlayerId: "p1",
        pe: 10,
        skills: [],
        improvements: 0,
        valueBonus: 0,
        alive: false,
        missNextMatch: false,
      },
      p2: {
        rosterPlayerId: "p2",
        pe: 3,
        skills: [],
        improvements: 0,
        valueBonus: 0,
        alive: true,
        missNextMatch: true,
      },
      p3: {
        rosterPlayerId: "p3",
        pe: 3,
        skills: [],
        improvements: 0,
        valueBonus: 0,
        alive: true,
        missNextMatch: false,
      },
    };
    render(
      <TeamDetailViewV2
        team={threePlayerTeam}
        race={humanRace}
        progression={progression}
        onImprove={vi.fn()}
      />,
    );

    const card = screen.getByTestId("ui-v2-progresion");
    expect(within(card).getByRole("heading", { name: "Progresión" })).toBeTruthy();
    expect(card.textContent).toContain("PE de plantilla");
    expect(card.textContent).toContain("★16");
    expect(card.textContent).toContain("Muerto");
    expect(card.textContent).toContain("Baja la próxima");
    expect(within(card).getAllByText("1")).toHaveLength(2);
  });

  it("coaching and treasury sections keep the legacy figures", () => {
    render(<TeamDetailViewV2 team={threePlayerTeam} race={humanRace} />);

    const coaching = screen.getByTestId("ui-v2-coaching");
    expect(within(coaching).getByText("Total cuerpo técnico")).toBeTruthy();
    // Legacy item sub-lines: quantity × unit cost.
    expect(coaching.textContent).toMatch(/\d+\s×/);

    const treasury = screen.getByTestId("ui-v2-treasury");
    expect(within(treasury).getByText("Coste plantilla")).toBeTruthy();
    expect(within(treasury).getByText("Tesorería restante")).toBeTruthy();
  });

  it("empty roster renders the roster.empty message inside the section", () => {
    render(<TeamDetailViewV2 team={baseTeam} race={humanRace} />);

    const roster = screen.getByTestId("ui-v2-roster");
    expect(within(roster).getByText("Todavía no hay jugadores en la plantilla.")).toBeTruthy();
  });

  it("V2 sources stay presentation-only (no api or AppProvider imports)", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const sources = ["TeamDetailViewV2.tsx"];
    const v2Dir = path.join(dir, "v2");
    for (const file of readdirSync(v2Dir)) {
      if (file.endsWith(".tsx") || file.endsWith(".ts")) sources.push(path.join("v2", file));
    }

    for (const rel of sources) {
      const content = readFileSync(path.join(dir, rel), "utf8");
      const specifiers = Array.from(content.matchAll(/from\s+["']([^"']+)["']/g)).map(
        (m) => m[1],
      );
      const apiImport = specifiers.find((s) => s.endsWith("features/teams/api"));
      expect(apiImport, `${rel} must not import features/teams/api`).toBeUndefined();
      const appProviderImport = specifiers.find((s) => s.includes("AppProvider"));
      expect(appProviderImport, `${rel} must not import AppProvider`).toBeUndefined();
      expect(content, `${rel} must not use dynamic import()`).not.toMatch(/import\s*\(/);
    }
    // v2/ must contain at least the RosterV2 subcomponent (task 3.1).
    expect(sources).toContain(path.join("v2", "RosterV2.tsx"));
  });
});
