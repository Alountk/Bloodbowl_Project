import { describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import type { PlayerProgressionCore, Race, Team } from "../types";
import { DEFAULT_COACHING } from "../types";
import { getRaceById } from "../data/races";
import { skillDisplayName } from "@/lib/progression";
import { TeamRosterTable } from "./TeamRosterTable";

const humanRace = getRaceById("human") as Race;

const baseTeam: Team = {
  id: "t1",
  name: "Reikland Reavers",
  raceId: "human",
  leagueId: null,
  coaching: { ...DEFAULT_COACHING },
  roster: [{ id: "p1", name: "John", positionalKey: "lineman" }],
};

/** A progression row with the RAU-46 additions (injuries, stats, attributes). */
function progressionFor(overrides: Partial<PlayerProgressionCore> = {}): Record<string, PlayerProgressionCore> {
  return {
    p1: {
      rosterPlayerId: "p1",
      pe: 10,
      skills: ["block"],
      improvements: 0,
      valueBonus: 20_000,
      alive: true,
      missNextMatch: false,
      injuries: ["cabeza rota"],
      attributeIncreases: { st: 1 },
      stats: { casualties: 2, mvp: 1 },
      ...overrides,
    },
  };
}

describe("TeamRosterTable", () => {
  it("renders the TourPlay column set with the player identity lines", () => {
    render(<TeamRosterTable team={baseTeam} race={humanRace} />);

    for (const header of ["Nº", "Jugador", "Características", "Habilidades y rasgos", "NI", "SPP", "CAS", "MVP", "Valor"]) {
      expect(screen.getByText(header)).toBeTruthy();
    }
    expect(screen.getByText("John")).toBeTruthy();
    expect(screen.getByText("Human Lineman")).toBeTruthy();
    expect(screen.getByText("(Línea, Human)")).toBeTruthy();
    expect(screen.getByTestId("player-icon").textContent).toContain("🚶");
  });

  it("renders the SPP bar segmented with ticks and turns green when pe covers the next cost", () => {
    render(
      <TeamRosterTable
        team={baseTeam}
        race={humanRace}
        progression={progressionFor({ pe: 10 })}
      />,
    );
    // next random improvement cost for a 0-improvement player is 3 → pe 10 covers it.
    const bar = screen.getByTestId("spp-bar-p1");
    expect(bar.getAttribute("data-ready")).toBe("true");
    // the 25/50/75% segment overlay is present.
    expect(screen.getByTestId("spp-bar-ticks-p1")).toBeTruthy();
    expect(screen.getByTestId("spp-pe-p1").textContent).toContain("★10");
  });

  it("shows the value as base+bonus with a (base+bonus)k breakdown when the player has a bonus", () => {
    render(
      <TeamRosterTable
        team={baseTeam}
        race={humanRace}
        progression={progressionFor()}
      />,
    );
    // lineman base 50 000 + 20 000 bonus = 70 000.
    expect(screen.getByTestId("player-value-p1").textContent).toBe("70 000");
    expect(screen.getByTestId("value-breakdown-p1").textContent).toBe("(50+20)k");
  });

  it("shows NI 🩹xN and reduces the row opacity when the player has injuries", () => {
    render(
      <TeamRosterTable
        team={baseTeam}
        race={humanRace}
        progression={progressionFor({ injuries: ["cabeza rota", "grave"] })}
      />,
    );
    expect(screen.getByTestId("ni-p1").textContent).toContain("🩹x2");
    expect(screen.getByTestId("roster-row-p1").className).toContain("opacity-60");
    expect(screen.getByText("🏥")).toBeTruthy();
  });

  it("RAU-12: renders a 'Baja la próxima' marker for a player missing the next match", () => {
    render(
      <TeamRosterTable
        team={baseTeam}
        race={humanRace}
        progression={progressionFor({ missNextMatch: true })}
      />,
    );
    const row = screen.getByTestId("roster-row-p1");
    expect(row.textContent).toContain("Baja la próxima");
    // The marker is distinct from the dead emoji — the player is alive.
    expect(row.textContent).not.toContain("💀");
  });

  it("RAU-12: renders no next-match marker when the player is available", () => {
    render(
      <TeamRosterTable
        team={baseTeam}
        race={humanRace}
        progression={progressionFor({ missNextMatch: false })}
      />,
    );
    expect(screen.queryByText("Baja la próxima")).toBeNull();
  });

  it("renders CAS and MVP from career stats and '·' for zero", () => {
    render(
      <TeamRosterTable
        team={baseTeam}
        race={humanRace}
        progression={progressionFor({ stats: { casualties: 2, mvp: 0 } })}
      />,
    );
    expect(screen.getByTestId("cas-p1").textContent).toBe("2");
    expect(screen.getByTestId("mvp-p1").textContent).toBe("·");
  });

  it("marks XP-bought élite skills with a diamond and leaves starting skills plain", () => {
    // lineman has no starting skills → "block" is bought; élite → ◆ diamond.
    render(
      <TeamRosterTable
        team={baseTeam}
        race={humanRace}
        progression={progressionFor({ skills: ["block"] })}
      />,
    );
    expect(screen.getAllByTestId("elite-diamond").length).toBeGreaterThanOrEqual(1);
  });

  it("does not mark starting skills, only XP-purchased ones", () => {
    // human blitzer starts with block + tackle (block is élite) → no diamond.
    const team: Team = { ...baseTeam, roster: [{ id: "p1", name: "Yan", positionalKey: "blitzer" }] };
    render(<TeamRosterTable team={team} race={humanRace} progression={progressionFor({ skills: [] })} />);
    expect(screen.queryAllByTestId("elite-diamond").length).toBe(0);
  });

  it("separates skills and traits with commas, marking only bought ones", () => {
    // blitzer starts with block + tackle (default); dodge is bought.
    const team: Team = { ...baseTeam, roster: [{ id: "p1", name: "Yan", positionalKey: "blitzer" }] };
    render(
      <TeamRosterTable
        team={team}
        race={humanRace}
        progression={progressionFor({ skills: ["dodge"] })}
      />,
    );
    const row = screen.getByTestId("roster-row-p1");
    // default skills are comma-separated and plain; the bought élite skill keeps the ◆ prefix.
    expect(row.textContent).toContain(
      `${skillDisplayName("block")}, ${skillDisplayName("tackle")},`,
    );
    expect(row.textContent).toContain(`◆ ${skillDisplayName("dodge")}`);
    // only the bought élite skill carries the diamond.
    expect(screen.queryAllByTestId("elite-diamond").length).toBe(1);
  });

  it("highlights an increased characteristic green vs the positional base", () => {
    render(
      <TeamRosterTable
        team={baseTeam}
        race={humanRace}
        progression={progressionFor({ attributeIncreases: { st: 1 } })}
      />,
    );
    // human lineman ST base 3 → 4 (green ↑).
    const row = screen.getByTestId("roster-row-p1");
    const st = Array.from(row.querySelectorAll("span")).find(
      (el) => el.className.includes("text-green-600") && el.textContent?.includes("↑4"),
    );
    expect(st).toBeTruthy();
  });

  it("opens the improve modal on a clickable row and closes it", () => {
    const onImprove = vi.fn(async () => ({}));
    render(
      <TeamRosterTable
        team={baseTeam}
        race={humanRace}
        progression={progressionFor()}
        onImprove={onImprove}
      />,
    );
    fireEvent.click(screen.getByTestId("roster-row-p1"));
    expect(screen.getByTestId("improve-modal")).toBeTruthy();
    // header shows value + ★PE available.
    expect(screen.getByTestId("modal-pe-label").textContent).toContain("★10");
    fireEvent.click(screen.getByRole("button", { name: "Cerrar" }));
    expect(screen.queryByTestId("improve-modal")).toBeNull();
  });

  it("is read-only with no click handlers and '·' stats when progression is absent", () => {
    render(<TeamRosterTable team={baseTeam} race={humanRace} />);
    expect(screen.getByTestId("cas-p1").textContent).toBe("·");
    expect(screen.getByTestId("mvp-p1").textContent).toBe("·");
    // no progression → no SPP render block at all.
    expect(screen.queryByTestId("spp-pe-p1")).toBeNull();
    fireEvent.click(screen.getByTestId("roster-row-p1"));
    expect(screen.queryByTestId("improve-modal")).toBeNull();
  });
});
