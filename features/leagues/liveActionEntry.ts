/**
 * Shared live-action ENTRY helpers for the Design-A contextual dock (LM-46),
 * extracted from the removed player-first strip so the dock and the resolution
 * modal share the same naming and command-building logic (no duplication).
 *
 * - Role vocabulary: the ACTIVE coach opens actions on THEIR OWN side
 *   (td/completion/casualty/foul); the NON-active coach opens only casualty
 *   records on their own team — the SELF-INFLICTED dodge/crowd wound and the
 *   "both-down" block casualty. The dock shows the legal chips UP FRONT and a
 *   sheet over it to pick the involved players, keeping the SERVER both-down
 *   semantics intact (DEC-1): the non-active both-down record has the RIVAL
 *   fallen blocker as VICTIM and the tapped own defender as CAUSER
 *   ({side: opp, victimRosterId: rival, causerRosterId: own, bothDown:true}).
 */

import { CASUALTY_CAUSES, type CasualtyCause } from "@/lib/livePhase";
import { getRaceById } from "@/features/teams/data/races";
import type { BlockDieFace } from "@/lib/rules/blocks";
import type { LiveCommand, MatchPlayer } from "./api";

/** The casualty causes that REQUIRE an explicit causer (blitz/foul/block). */
export const CAUSES_REQUIRING_CAUSER: ReadonlySet<CasualtyCause> = new Set([
  "blitz",
  "foul",
  "block",
]);

/** ACTIVE coach may author a caused casualty from these causes. */
export const ACTIVE_CAUSES = CASUALTY_CAUSES.filter((c) =>
  CAUSES_REQUIRING_CAUSER.has(c),
);
/** The NON-active self-inflicted wound is dodge/crowd only (no causer). */
export const SELF_CAUSES = CASUALTY_CAUSES.filter(
  (c) => !CAUSES_REQUIRING_CAUSER.has(c),
);
/** The both-down casualty is ALWAYS a block (D1). */
export const BOTH_DOWN_CAUSE: CasualtyCause = "block";

/**
 * RAU-48: the positional display name for a player line ("blitzer" →
 * "Blitzer"), resolved against the race catalog; unknown keys pass through.
 * Moved here from the deleted `playerActionStrip` so the resolution modal's MJP
 * pickers share the same position label (RAU-13 dorsal).
 */
export function positionName(raceId: string, positionalKey: string): string {
  const race = getRaceById(raceId);
  return race?.positionals.find((pos) => pos.key === positionalKey)?.name ?? positionalKey;
}

/** The dorsal is the served-array index + 1 (D21), matching the feed's table. */
export function dorsalMap(pool: MatchPlayer[]): Map<string, number> {
  return new Map(pool.map((p, i) => [p.rosterPlayerId, i + 1]));
}

/** Chip short name: first name token (mockup "Design B"), whole single token. */
export function shortName(player: MatchPlayer): string {
  return player.name.trim().split(/\s+/)[0] || player.name;
}

/** The alive, eligible players of a roster offered by the dock (RAU-12/13). */
export function eligiblePlayers(pool: MatchPlayer[]): MatchPlayer[] {
  return pool.filter((p) => p.alive && !p.missNextMatch);
}

/**
 * The chosen selections for a Guided casualty/foul flow inside the dock sheet.
 * `roll` values are raw; the band is DERIVED server-side — never client-chosen.
 */
export interface GuidedSelections {
  cause?: CasualtyCause | "";
  causerId?: string;
  victimId?: string;
  roll16?: number | "";
  roll6?: number | "";
  /** S2 (Cambiar clima): the picked `WEATHER_KINDS` code ("" = none yet). */
  weather?: string;
  /** T17 (S10.1): the rolled block dice (empty until «Tirar dados»). */
  blockDice?: BlockDieFace[];
  /** T17: the face picked from the rolled block dice. */
  face?: BlockDieFace;
  /** T17: the recorded 2D6 armour sum ("" = not rolled yet). */
  armourRoll?: number | "";
}

/**
 * T17 (S4 step 2b · S10.1): a roster player's combat stats — the numeric ST
 * and the numeric armour value behind the catalog's "9+" notation — resolved
 * from the race catalog (the SAME lookup `positionName` uses; never a new data
 * source). Null when the race/positional is not in the catalog (defensive — a
 * fixture positional typo degrades the chain honestly, never throws).
 */
export function statsFor(
  raceId: string,
  positionalKey: string,
): { st: number; av: number | null } | null {
  const positional = getRaceById(raceId)?.positionals.find(
    (pos) => pos.key === positionalKey,
  );
  if (positional == null) return null;
  const av = Number.parseInt(positional.av, 10);
  return { st: positional.st, av: Number.isFinite(av) ? av : null };
}

/**
 * T17 (S10.2): WHO falls for each block-die face. Skills are deliberately NOT
 * modelled (lib/rules/blocks.ts), so a stumble without Dodge knocks the
 * defender down too; a push knocks nobody (no derribo, no entry).
 */
export function knockdownVictimOf(
  face: BlockDieFace,
): "defender" | "attacker" | "both" | null {
  switch (face) {
    case "defenderDown":
    case "defenderStumbles":
      return "defender";
    case "bothDown":
      return "both";
    case "attackerDown":
      return "attacker";
    default:
      return null;
  }
}

/**
 * T17 (S10.1/S10.2): the standalone «Derribo» capture of the guided combat
 * chain — block dice + picked face + (defender falls) the armour 2D6 vs the
 * victim's AV. `side` is the RECORDER's side — the tackler's coach reports the
 * placaje (S10.4.1), so the row's «Registrado por» badge names them.
 *
 * Transport note: the demo reducer's `applyCommand` stamps this additive
 * command; `api.ts`'s `LiveCommand` union is a fixed surface outside this
 * slice, so the dock carries it over that seam with one documented cast. The
 * production route does not accept `type: "knockdown"` yet (demo-first, same
 * stance as the S3 kickoff machinery).
 */
export interface KnockdownCommand {
  type: "knockdown";
  side: "home" | "away";
  causerRosterId: string;
  victimRosterId: string;
  blockDice: BlockDieFace[];
  face: BlockDieFace;
  armourRoll?: number;
  victimAv?: number;
  armourBroken?: boolean;
}

/**
 * Builds the knockdown command from the completed chain selections. Null when
 * the chain is incomplete or the picked face is NOT among the rolled dice — or
 * is a Push (a push is never a derribo, so there is nothing to register).
 * The armour fields ride ONLY the defender's knockdown (T23 closed S10.3:
 * the both-down armour/injury follow-ups land as their own rows, so this row
 * keeps its shipped shape; the attacker-fall follow-up stays backlog).
 */
export function buildKnockdownCommand(args: {
  recorderSide: "home" | "away";
  causerId: string;
  victimId: string;
  blockDice: BlockDieFace[];
  face: BlockDieFace;
  armourRoll?: number | null;
  victimAv?: number | null;
}): KnockdownCommand | null {
  const { recorderSide, causerId, victimId, blockDice, face, armourRoll, victimAv } = args;
  if (!causerId || !victimId) return null;
  if (!blockDice.includes(face)) return null;
  const falls = knockdownVictimOf(face);
  if (falls == null) return null;
  const cmd: KnockdownCommand = {
    type: "knockdown",
    side: recorderSide,
    causerRosterId: causerId,
    victimRosterId: victimId,
    blockDice: [...blockDice],
    face,
  };
  if (falls === "defender" && typeof armourRoll === "number") {
    cmd.armourRoll = armourRoll;
    if (typeof victimAv === "number") {
      cmd.victimAv = victimAv;
      cmd.armourBroken = armourRoll > victimAv;
    }
  }
  return cmd;
}

/**
 * T17 (S10.4.1): the VICTIM owner's injury capture — «el jugador que recibe
 * marca la herida — solo si llega a producirse». A roll-inclusive own-side
 * casualty WITHOUT a causer: the badge must name the victim's coach (the
 * recorder) and the causal context already rides the knockdown row. Null for a
 * missing victim or an out-of-range 1D16 (never a roll-less casualty).
 *
 * T23: `bothDown` stamps the DEC-1 «(Ambos derribados)» marker on the injury
 * rows of a «Ambos caen» fall (the legacy both-down casualty carries it too)
 * — still NEVER a causer (RAU-47 «no-causer pays no-★» is T24's surface).
 */
export function buildVictimInjuryCommand(
  victimSide: "home" | "away",
  victimId: string,
  roll16: number,
  roll6?: number | "",
  cause: CasualtyCause = "block",
  bothDown = false,
): LiveCommand | null {
  if (!victimId || !Number.isInteger(roll16) || roll16 < 1 || roll16 > 16) {
    return null;
  }
  const casualty: Extract<LiveCommand, { type: "casualty" }> = {
    type: "casualty",
    side: victimSide,
    victimRosterId: victimId,
    cause,
    roll16,
  };
  if (roll6 !== "" && roll6 != null) casualty.roll6 = roll6;
  if (bothDown) casualty.bothDown = true;
  return casualty;
}

/**
 * Builds the `LiveCommand` for the dock's guided flows (Baja / Falta) plus the
 * non-active "Baja — ambos derribados" and "Baja propia". Pure and shared:
 * returns `null` when any required selection is missing (the Registrar button
 * is gated by the shape-validity instead).
 *
 * Resolved semantics (mirrored one-to-one from the removed strip's onRegister):
 *  - casualtyCaused (ACTIVE):  { type:casualty, side: opp, victim:rival,
 *    causer:own, cause, roll16(+roll6) }.
 *  - selfInflicted (NON-active, dodge/crowd, no causer): { type:casualty,
 *    side: viewer, victim:own, cause, roll16(+roll6) }.
 *  - bothDown (NON-active): { type:casualty, side: opp, victim: rival fallen
 *    blocker, causer: own defender tapped, cause:'block', bothDown:true,
 *    roll16(+roll6) } — DEC-1 canonical.
 *  - foul (ACTIVE): { type:foul, side: viewer, playerRosterId: aggressor own,
 *    victimRosterId: victim rival }.
 */
export function buildGuidedCommand(
  kind: "casualty" | "selfInflicted" | "bothDown" | "foul",
  viewerSide: "home" | "away",
  selections: GuidedSelections,
): LiveCommand | null {
  const oppSide = viewerSide === "home" ? "away" : "home";
  const { cause, causerId, victimId, roll16, roll6 } = selections;

  if (kind === "foul") {
    if (!causerId || !victimId) return null;
    return {
      type: "foul",
      side: viewerSide,
      playerRosterId: causerId,
      victimRosterId: victimId,
    };
  }

  if (kind === "selfInflicted") {
    if (!cause || !victimId || roll16 === "" || !roll16) return null;
    const base: LiveCommand = {
      type: "casualty",
      side: viewerSide,
      victimRosterId: victimId,
      cause,
      roll16,
    };
    if (roll6 !== "" && roll6 != null)
      (base as Extract<LiveCommand, { type: "casualty" }>).roll6 = roll6;
    return base;
  }

  if (kind === "bothDown") {
    if (!causerId || !victimId || roll16 === "" || !roll16) return null;
    const casualty: Extract<LiveCommand, { type: "casualty" }> = {
      type: "casualty",
      side: oppSide,
      victimRosterId: victimId,
      causerRosterId: causerId,
      cause: BOTH_DOWN_CAUSE,
      roll16: Number(roll16),
      bothDown: true,
    };
    if (roll6 !== "" && roll6 != null) casualty.roll6 = Number(roll6);
    return casualty;
  }

  // casualtyCaused (ACTIVE): causer REQUIRED for blitz/foul/block.
  if (!causerId || !cause || !victimId || roll16 === "" || !roll16) return null;
  const base: LiveCommand = {
    type: "casualty",
    side: oppSide,
    victimRosterId: victimId,
    causerRosterId: causerId,
    cause,
    roll16: Number(roll16),
  };
  if (roll6 !== "" && roll6 != null)
    (base as Extract<LiveCommand, { type: "casualty" }>).roll6 = Number(roll6);
  return base;
}

/** Builds the instant two-touch command for TD / Pase (active, own scorer).
 * LM-13 (Slice E): the union also carries the acta-vocabulary scored actions
 * (interception / throw-team-mate / landed-safe) — same one-tap shape, same
 * server gate as `completion`. */
export function buildScoredCommand(
  kind: "td" | "completion" | "interception" | "throwTeamMate" | "landedSafe",
  viewerSide: "home" | "away",
  playerRosterId: string,
): LiveCommand {
  return { type: kind, side: viewerSide, playerRosterId };
}

/**
 * Builds the S2 "Cambiar clima" command from the dock's kind pick (+ the
 * optional recorded d6). Pure: `null` until a weather kind is picked, and the
 * roll travels ONLY when one was recorded — the server validates both fields.
 */
export function buildWeatherCommand(
  value: string | "",
  roll: number | "" = "",
): LiveCommand | null {
  if (!value) return null;
  const cmd: Extract<LiveCommand, { type: "weather" }> = { type: "weather", value };
  if (roll !== "" && roll != null) cmd.roll = roll;
  return cmd;
}

/** True when the viewer is the ACTIVE (current turn) side's coach. */
export function isActiveActor(
  viewerSide: "home" | "away" | null,
  activeSide: "home" | "away",
): boolean {
  return viewerSide != null && viewerSide === activeSide;
}
