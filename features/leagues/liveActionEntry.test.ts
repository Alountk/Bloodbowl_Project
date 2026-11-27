import { describe, expect, it } from "vitest";
import {
  ACTIVE_CAUSES,
  SELF_CAUSES,
  buildGuidedCommand,
  buildKnockdownCommand,
  buildScoredCommand,
  buildVictimInjuryCommand,
  buildWeatherCommand,
  eligiblePlayers,
  knockdownVictimOf,
  positionName,
  statsFor,
  withoutLiveDead,
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

describe("liveActionEntry — T17 combat chain: knockdown -> armour -> victim injury (S10.1/S10.2/S10.4.1)", () => {
  it("statsFor resolves ST and numeric AV from the race catalog (human blitzer -> 3 / 9+); unknown positionals -> null", () => {
    expect(statsFor("human", "blitzer")).toEqual({ st: 3, av: 9 });
    expect(statsFor("human", "lineman")).toEqual({ st: 3, av: 9 });
    expect(statsFor("human", "not-a-position")).toBeNull();
  });

  it("knockdownVictimOf maps the block faces to WHO falls (push -> nobody = no knockdown entry)", () => {
    expect(knockdownVictimOf("defenderDown")).toBe("defender");
    // Skills are deliberately NOT modelled (lib/rules/blocks.ts) — a stumble
    // without Dodge knocks the defender down too.
    expect(knockdownVictimOf("defenderStumbles")).toBe("defender");
    expect(knockdownVictimOf("bothDown")).toBe("both");
    expect(knockdownVictimOf("attackerDown")).toBe("attacker");
    expect(knockdownVictimOf("push")).toBeNull();
  });

  it("buildKnockdownCommand records the tackler-side chain: dice, picked face, armour 2D6 vs the victim AV", () => {
    const cmd = buildKnockdownCommand({
      recorderSide: "home",
      causerId: "p1",
      victimId: "o1",
      blockDice: ["push", "defenderDown"],
      face: "defenderDown",
      armourRoll: 10,
      victimAv: 9,
    });
    // S10.4.1: the TACKLER's coach records the knockdown — the command's side
    // is the recorder's (the event badge «Registrado por» follows it).
    expect(cmd).toEqual({
      type: "knockdown",
      side: "home",
      causerRosterId: "p1",
      victimRosterId: "o1",
      blockDice: ["push", "defenderDown"],
      face: "defenderDown",
      armourRoll: 10,
      victimAv: 9,
      armourBroken: true,
    });
  });

  it("an armour roll AT the victim AV keeps the armour (armourBroken false — S10.2 knockdown without baja)", () => {
    const cmd = buildKnockdownCommand({
      recorderSide: "home",
      causerId: "p1",
      victimId: "o1",
      blockDice: ["defenderDown"],
      face: "defenderDown",
      armourRoll: 9,
      victimAv: 9,
    });
    expect(cmd?.armourBroken).toBe(false);
  });

  it("a non-defender knockdown entry carries NO armour fields (T23 keeps the both-down ROW shape — follow-ups ride their own rows)", () => {
    // WHY renamed (T23, intentional): S10.3 closed — the both-down armour/
    // injury follow-ups now exist, but as SEPARATE rows (the owner-recorded
    // casualty captures). The «Derribo» row itself keeps its shipped shape.
    const cmd = buildKnockdownCommand({
      recorderSide: "away",
      causerId: "o2",
      victimId: "p3",
      blockDice: ["bothDown"],
      face: "bothDown",
    });
    expect(cmd).toEqual({
      type: "knockdown",
      side: "away",
      causerRosterId: "o2",
      victimRosterId: "p3",
      blockDice: ["bothDown"],
      face: "bothDown",
    });
  });

  it("never builds a knockdown for a push, a face outside the rolled dice, or a missing player", () => {
    expect(
      buildKnockdownCommand({
        recorderSide: "home",
        causerId: "p1",
        victimId: "o1",
        blockDice: ["push", "push"],
        face: "push",
      }),
    ).toBeNull();
    expect(
      buildKnockdownCommand({
        recorderSide: "home",
        causerId: "p1",
        victimId: "o1",
        blockDice: ["push"],
        face: "defenderDown", // not among the rolled dice
      }),
    ).toBeNull();
    expect(
      buildKnockdownCommand({
        recorderSide: "home",
        causerId: "",
        victimId: "o1",
        blockDice: ["defenderDown"],
        face: "defenderDown",
      }),
    ).toBeNull();
  });

  it("buildVictimInjuryCommand is the VICTIM-owner's roll-inclusive capture: own-side casualty WITHOUT a causer (S10.4.1)", () => {
    const cmd = buildVictimInjuryCommand("away", "o1", 9);
    expect(cmd).toEqual({
      type: "casualty",
      side: "away",
      victimRosterId: "o1",
      cause: "block",
      roll16: 9,
    } as LiveCommand);
    // No causer key: the badge must name the VICTIM's coach (the recorder) and
    // the causal context already rides the knockdown row.
    expect("causerRosterId" in (cmd ?? {})).toBe(false);
    const permanent = buildVictimInjuryCommand("away", "o1", 13, 4);
    expect(permanent).toEqual({
      type: "casualty",
      side: "away",
      victimRosterId: "o1",
      cause: "block",
      roll16: 13,
      roll6: 4,
    } as LiveCommand);
    expect(buildVictimInjuryCommand("away", "", 9)).toBeNull();
    expect(buildVictimInjuryCommand("away", "o1", 0)).toBeNull();
  });

  it("T23: buildVictimInjuryCommand stamps the both-down marker only on the «Ambos caen» follow-up (no causer — S10.4.1)", () => {
    // WHY new (T23): the both-down injury keeps the DEC-1 «(Ambos derribados)»
    // marker copy on its row (the legacy both-down casualty carries it too),
    // but NEVER a causer — each victim's owner records their own herida and
    // nobody pays ★ (RAU-47 is T24's surface; this only pins the payload).
    const cmd = buildVictimInjuryCommand("home", "p1", 12, "", "block", true);
    expect(cmd).toEqual({
      type: "casualty",
      side: "home",
      victimRosterId: "p1",
      cause: "block",
      roll16: 12,
      bothDown: true,
    } as LiveCommand);
    expect("causerRosterId" in (cmd ?? {})).toBe(false);
    // The T17 chain (defender knockdown) stays byte-identical: NO marker key.
    const plain = buildVictimInjuryCommand("away", "o1", 9) as Record<string, unknown>;
    expect("bothDown" in (plain ?? {})).toBe(false);
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

describe("withoutLiveDead", () => {
  const roster = ["p1", "p2"].map((id) => ({
    rosterPlayerId: id, name: id, positionalKey: "lineman", pe: 0, skills: [], injuries: [],
    alive: true, missNextMatch: false, valueBonus: 0,
  }));
  const casualty = (side: "home" | "away", victim: string, roll16?: number) => ({
    seq: 1, kind: "casualty" as const, side, playerRosterId: victim, half: 1, turnNumber: 1,
    payload: { victimRosterId: victim, ...(roll16 == null ? {} : { roll16 }) }, at: 0,
  });

  it("drops a player who died in this match from the selectable pool, keeping roster order", () => {
    const next = withoutLiveDead(roster, "home", [casualty("home", "p1", 16)]);
    expect(next.map((p) => p.rosterPlayerId)).toEqual(["p1", "p2"]);
    expect(eligiblePlayers(next).map((p) => p.rosterPlayerId)).toEqual(["p2"]);
  });

  it("keeps non-dead, pending and other-side casualties selectable", () => {
    const next = withoutLiveDead(roster, "home", [
      casualty("home", "p1", 9),
      casualty("home", "p2"),
      casualty("away", "p2", 16),
    ]);
    expect(eligiblePlayers(next)).toHaveLength(2);
  });
});
