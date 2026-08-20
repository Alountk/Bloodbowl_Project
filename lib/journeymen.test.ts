import { describe, expect, it } from "vitest";
import {
  isJourneymanId,
  journeymanId,
  linemanPositionalOf,
  mergeRosterWithJourneymen,
  type PlayerRowLike,
  type TeamRosterInput,
} from "./journeymen";
import { getRaceById } from "@/features/teams/data/races";

/**
 * RAU-13 pure helpers: the synthetic id scheme, the race Lineman positional
 * resolution and the availability-driven journeyman append. Zero-mock.
 */

const elevenRoster = Array.from({ length: 11 }, (_, i) => ({
  id: `p${i + 1}`,
  name: `Jugador ${i + 1}`,
  positionalKey: "lineman",
}));

function teamRow(overrides: Partial<TeamRosterInput> = {}): TeamRosterInput {
  return {
    id: "t1",
    raceId: "human",
    roster: elevenRoster,
    players: [],
    ...overrides,
  };
}

describe("isJourneymanId / journeymanId (synthetic id scheme)", () => {
  it("builds `journeyman-{teamId}-{n}` and recognizes the prefix", () => {
    expect(journeymanId("t1", 1)).toBe("journeyman-t1-1");
    expect(journeymanId("team-abc", 11)).toBe("journeyman-team-abc-11");
    expect(isJourneymanId("journeyman-t1-1")).toBe(true);
  });

  it("rejects real roster ids and null/undefined", () => {
    expect(isJourneymanId("p1")).toBe(false);
    expect(isJourneymanId("")).toBe(false);
    expect(isJourneymanId(null)).toBe(false);
    expect(isJourneymanId(undefined)).toBe(false);
  });
});

describe("linemanPositionalOf", () => {
  it("resolves the core Lineman for races whose key is NOT literally 'lineman'", () => {
    expect(linemanPositionalOf(getRaceById("amazon"))?.key).toBe("linewoman");
    expect(linemanPositionalOf(getRaceById("shambling-undead"))?.key).toBe("skeleton-lineman");
    expect(linemanPositionalOf(getRaceById("halfling"))?.key).toBe("hopeful");
    expect(linemanPositionalOf(getRaceById("dwarf"))?.key).toBe("lineman");
    expect(linemanPositionalOf(getRaceById("lizardmen"))?.key).toBe("skink-runner");
  });

  it("prefers the 0-16 core Lineman over max-limited Lineman-role alternates", () => {
    // human: lineman (0-16) beats halfling-hopeful (0-3).
    expect(linemanPositionalOf(getRaceById("human"))?.key).toBe("lineman");
    // chaos-renegade: renegade-lineman (0-16) beats the max-1 alternates.
    expect(linemanPositionalOf(getRaceById("chaos-renegade"))?.key).toBe("renegade-lineman");
    // underworld-denizens: underworld-goblin (0-16) beats skaven/snotling.
    expect(linemanPositionalOf(getRaceById("underworld-denizens"))?.key).toBe("underworld-goblin");
    // old-world-alliance: human-lineman (0-16) beats dwarf-lineman (0-3) and halfling-hopeful (0-3).
    expect(linemanPositionalOf(getRaceById("old-world-alliance"))?.key).toBe("human-lineman");
  });

  it("returns undefined for an unknown race", () => {
    expect(linemanPositionalOf(undefined)).toBeUndefined();
    expect(linemanPositionalOf(getRaceById("not-a-race"))).toBeUndefined();
  });
});

describe("mergeRosterWithJourneymen — availability-driven append", () => {
  it("appends 11 - available journeymen when fewer than 11 are available", () => {
    const players: PlayerRowLike[] = [
      ...elevenRoster.slice(0, 9).map((e) => ({
        rosterPlayerId: e.id,
        name: e.name,
        positionalKey: e.positionalKey,
        pe: 0,
        skills: [],
        injuries: [],
        alive: true,
        missNextMatch: false,
        valueBonus: 0,
      })),
      { rosterPlayerId: "p10", name: "Jugador 10", positionalKey: "lineman", pe: 0, skills: [], injuries: [], alive: false, missNextMatch: false, valueBonus: 0 },
    ];
    const served = mergeRosterWithJourneymen(
      teamRow({ roster: elevenRoster.slice(0, 10), players }),
    );
    // p10 is DEAD → only 9 available → 2 journeymen complete the 11 lineup.
    // The dead p10 is still SERVED (a real roster entry), so 10 real + 2.
    expect(served).toHaveLength(12);
    const real = served.filter((p) => !p.journeyman);
    expect(real).toHaveLength(10);
    const jrny = served.slice(10);
    expect(jrny).toHaveLength(2);
    expect(jrny[0]).toMatchObject({
      rosterPlayerId: "journeyman-t1-1",
      name: "Novato 1",
      positionalKey: "lineman",
      pe: 0,
      skills: [],
      injuries: [],
      alive: true,
      missNextMatch: false,
      valueBonus: 0,
      journeyman: true,
    });
    expect(jrny[1]).toMatchObject({
      rosterPlayerId: "journeyman-t1-2",
      name: "Novato 2",
      journeyman: true,
    });
  });

  it("uses the race's Lineman positional for the journeymen (amazon → linewoman)", () => {
    const players: PlayerRowLike[] = elevenRoster.slice(0, 10).map((e) => ({
      rosterPlayerId: e.id,
      name: e.name,
      positionalKey: "linewoman",
      pe: 0,
      skills: [],
      injuries: [],
      alive: true,
      missNextMatch: false,
      valueBonus: 0,
    }));
    const served = mergeRosterWithJourneymen(
      teamRow({ raceId: "amazon", roster: elevenRoster.slice(0, 10), players }),
    );
    const jrny = served.find((p) => p.journeyman);
    expect(jrny?.positionalKey).toBe("linewoman");
  });

  it("counts a missNextMatch (RAU-12) player as unavailable", () => {
    const players: PlayerRowLike[] = elevenRoster.slice(0, 10).map((e) => ({
      rosterPlayerId: e.id,
      name: e.name,
      positionalKey: "lineman",
      pe: 0,
      skills: [],
      injuries: [],
      alive: true,
      missNextMatch: false,
      valueBonus: 0,
    }));
    players[0].missNextMatch = true; // 9 available → 2 journeymen
    const served = mergeRosterWithJourneymen(teamRow({ roster: elevenRoster.slice(0, 10), players }));
    const jrny = served.filter((p) => p.journeyman);
    expect(jrny.map((p) => p.rosterPlayerId)).toEqual(["journeyman-t1-1", "journeyman-t1-2"]);
    expect(jrny.map((p) => p.name)).toEqual(["Novato 1", "Novato 2"]);
  });

  it("does NOT append when 11+ players are available", () => {
    const served = mergeRosterWithJourneymen(teamRow());
    expect(served).toHaveLength(11);
    expect(served.some((p) => p.journeyman)).toBe(false);
  });

  it("does NOT append when includeJourneymen is false (manual-result fixtures)", () => {
    const players: PlayerRowLike[] = elevenRoster.slice(0, 10).map((e) => ({
      rosterPlayerId: e.id,
      name: e.name,
      positionalKey: "lineman",
      pe: 0,
      skills: [],
      injuries: [],
      alive: true,
      missNextMatch: false,
      valueBonus: 0,
    }));
    const served = mergeRosterWithJourneymen(teamRow({ roster: elevenRoster.slice(0, 10), players }), {
      includeJourneymen: false,
    });
    expect(served).toHaveLength(10);
    expect(served.some((p) => p.journeyman)).toBe(false);
  });

  it("appends from the raw Player rows when the roster JSON is missing (fallback)", () => {
    const players: PlayerRowLike[] = elevenRoster.slice(0, 10).map((e) => ({
      rosterPlayerId: e.id,
      name: e.name,
      positionalKey: "lineman",
      pe: 0,
      skills: [],
      injuries: [],
      alive: true,
      missNextMatch: false,
      valueBonus: 0,
    }));
    const served = mergeRosterWithJourneymen(teamRow({ roster: null, players }));
    expect(served).toHaveLength(11);
    expect(served[10].journeyman).toBe(true);
  });

  it("keeps roster-JSON order for real players (journeymen continue after)", () => {
    const roster = [elevenRoster[1], elevenRoster[0]].slice(0, 10); // p2 before p1 + 8 more
    const players: PlayerRowLike[] = roster.map((e) => ({
      rosterPlayerId: e.id,
      name: e.name,
      positionalKey: "lineman",
      pe: 0,
      skills: [],
      injuries: [],
      alive: true,
      missNextMatch: false,
      valueBonus: 0,
    }));
    const served = mergeRosterWithJourneymen(teamRow({ roster, players }));
    const realIds = served.filter((p) => !p.journeyman).map((p) => p.rosterPlayerId);
    expect(realIds).toEqual(roster.map((e) => e.id));
    expect(served[10].journeyman).toBe(true);
  });
});
