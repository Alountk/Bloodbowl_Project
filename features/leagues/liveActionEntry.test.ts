import { describe, expect, it } from "vitest";
import {
  ACTIVE_CAUSES,
  SELF_CAUSES,
  buildGuidedCommand,
  buildScoredCommand,
  buildWeatherCommand,
  eligiblePlayers,
  positionName,
} from "./liveActionEntry";
import type { LiveCommand, MatchPlayer } from "./api";

function player(over: Partial<MatchPlayer> & { id: string }): MatchPlayer {
  return {
    rosterPlayerId: over.id,
    name: over.name ?? "X",
    positionalKey: over.positionalKey ?? "lineman",
    pe: 0,
    skills: [],
    injuries: [],
    alive: over.alive ?? true,
    missNextMatch: over.missNextMatch ?? false,
    valueBonus: 0,
    journeyman: over.journeyman,
  };
}

describe("liveActionEntry — role sets + building shared commands (Design A dock)", () => {
  it("splits the casualty causes by CI: active (causer-required) vs self (dodge/crowd)", () => {
    expect(ACTIVE_CAUSES).toEqual(["blitz", "foul", "block"]);
    expect(SELF_CAUSES).toEqual(["dodge", "crowd"]);
  });

  it("eligiblePlayers keeps only alive, non-missing players (RAU-12/13)", () => {
    const pool = [
      player({ id: "a", name: "Aldric", positionalKey: "blitzer" }),
      player({ id: "b", name: "Bram", positionalKey: "lineman", alive: false }),
      player({ id: "c", name: "Ced", positionalKey: "lineman", missNextMatch: true }),
    ];
    expect(eligiblePlayers(pool).map((p) => p.rosterPlayerId)).toEqual(["a"]);
  });

  it("positionName resolves a positional from the race catalog (blitzer → Human Blitzer)", () => {
    expect(positionName("human", "blitzer")).toBe("Human Blitzer");
    expect(positionName("human", "not-a-position")).toBe("not-a-position");
  });

  it("buildScoredCommand sends td / completion on the actor's own side", () => {
    expect(buildScoredCommand("td", "away", "a1")).toEqual({
      type: "td",
      side: "away",
      playerRosterId: "a1",
    });
    expect(buildScoredCommand("completion", "home", "h2")).toEqual({
      type: "completion",
      side: "home",
      playerRosterId: "h2",
    });
  });

  it("buildScoredCommand sends the LM-13 acta-vocabulary actions on the actor's own side (Slice E)", () => {
    for (const [kind, playerRosterId] of [
      ["interception", "h3"],
      ["throwTeamMate", "a4"],
      ["landedSafe", "h5"],
    ] as const) {
      const side = playerRosterId.startsWith("h") ? "home" : "away";
      expect(buildScoredCommand(kind, side, playerRosterId)).toEqual({
        type: kind,
        side,
        playerRosterId,
      });
    }
  });

  it("buildGuidedCommand drops a self-inflicted dodge with NO causer", () => {
    const cmd = buildGuidedCommand("selfInflicted", "home", {
      cause: "dodge",
      victimId: "h1",
      roll16: 7,
    }) as Extract<LiveCommand, { type: "casualty" }>;
    expect(cmd).toMatchObject({
      type: "casualty",
      side: "home",
      victimRosterId: "h1",
      cause: "dodge",
      roll16: 7,
    });
    expect("causerRosterId" in cmd).toBe(false);
  });

  it("buildGuidedCommand keeps the both-down DEC-1 shape (rival victim, block, bothDown)", () => {
    const cmd = buildGuidedCommand("bothDown", "home", {
      causerId: "h4", // own defender who blocked
      victimId: "a5", // rival fallen blocker
      cause: "block",
      roll16: 13,
      roll6: 4,
    });
    expect(cmd).toEqual({
      type: "casualty",
      side: "away",
      victimRosterId: "a5",
      causerRosterId: "h4",
      cause: "block",
      roll16: 13,
      roll6: 4,
      bothDown: true,
    } as LiveCommand);
  });

  it("refuses guided commands when required inputs are missing", () => {
    expect(buildGuidedCommand("casualty", "home", { cause: "block" })).toBeNull();
    expect(buildGuidedCommand("foul", "home", { causerId: "h1" })).toBeNull();
    expect(buildGuidedCommand("bothDown", "home", { victimId: "a1" })).toBeNull();
  });
});

describe("liveActionEntry — buildWeatherCommand (S2: Cambiar clima)", () => {
  it("returns null when no weather kind was picked", () => {
    expect(buildWeatherCommand("")).toBeNull();
    expect(buildWeatherCommand("", 4)).toBeNull();
  });

  it("builds a value-only weather command when no d6 was recorded (roll stays optional)", () => {
    const cmd = buildWeatherCommand("rain");
    expect(cmd).toEqual({ type: "weather", value: "rain" });
    expect("roll" in (cmd ?? {})).toBe(false);
  });

  it("travels the recorded d6 alongside the kind", () => {
    expect(buildWeatherCommand("blizzard", 6)).toEqual({
      type: "weather",
      value: "blizzard",
      roll: 6,
    });
  });
});
