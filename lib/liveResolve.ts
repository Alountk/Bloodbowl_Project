/**
 * Pure end-of-match resolution derivations for a LIVE match (RAU-49).
 *
 * The live resolve command (`resolveLiveMatch` in `lib/liveStore.ts`) closes a
 * finished live match the way the result route closes a reported one: it rolls
 * the MJP grantees, derives the PE awards from the persisted live events
 * (TD ★3, completion ★1, lasting casualty ★2, MVP ★4), validates the 6-per-team
 * MVP nominations, and mirrors the result-route snapshot shape. Everything here
 * is side-effect-free and deterministic so the server award and the client's
 * resolution summary can share the SAME derivation (D23).
 *
 * A casualty event's `side` is the VICTIM's side (LM-12/RAU-39); the LASTING
 * band awards its ★2 to the CAUSER (`payload.causerRosterId`, who plays on the
 * OPPOSITE side). Self-inflicted casualties (dodge/crowd) carry no causer → no
 * award, mirroring `deriveTeamStats`'s lasting-bucket rule.
 */

import { PE_TD, PE_MVP, PE_CASUALTY, PE_COMPLETION } from "./rules/pe";

/** One player's total PE for the match (rosterPlayerId + earned PE). */
export interface PeAward {
  rosterPlayerId: string;
  pe: number;
}

/** The minimum per-event surface the PE/casualty derivations need. */
export interface ResolveEventLike {
  kind: string;
  side: "home" | "away" | null;
  playerRosterId: string | null;
  payload: Record<string, unknown>;
}

/** The lasting injury bands that award the ★2 casualty PE (bandToDisplay bucket). */
export const LASTING_BANDS = new Set(["apaleado", "grave", "permanent", "dead"]);

/** True for a lasting band (`apaleado|grave|permanent|dead`); a bruise is not. */
export function isLastingBand(band: string): boolean {
  return LASTING_BANDS.has(band);
}

/**
 * Derives each team's per-player PE from the persisted live events, BEFORE the
 * MVP grant (the MJP +4 is added separately via `addMvpPe` so the same roll
 * stays authoritative). TD ★3 and completion ★1 go to the event's side; a
 * lasting casualty awards ★2 to its causer (the OPPOSITE side).
 */
export function deriveLivePeAwards(
  events: readonly ResolveEventLike[],
): { home: PeAward[]; away: PeAward[] } {
  const home = new Map<string, number>();
  const away = new Map<string, number>();
  const add = (side: "home" | "away" | null, rosterPlayerId: string, pe: number) => {
    if (side === null) return;
    const map = side === "home" ? home : away;
    map.set(rosterPlayerId, (map.get(rosterPlayerId) ?? 0) + pe);
  };

  for (const event of events) {
    switch (event.kind) {
      case "td":
        if (event.playerRosterId) add(event.side, event.playerRosterId, PE_TD);
        break;
      case "completion":
        if (event.playerRosterId) add(event.side, event.playerRosterId, PE_COMPLETION);
        break;
      case "casualty": {
        const band = event.payload.band;
        if (typeof band === "string" && isLastingBand(band)) {
          const causer = event.payload.causerRosterId;
          if (typeof causer === "string") {
            add(event.side === "home" ? "away" : event.side === "away" ? "home" : null, causer, PE_CASUALTY);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const toList = (map: Map<string, number>): PeAward[] =>
    Array.from(map.entries()).map(([rosterPlayerId, pe]) => ({ rosterPlayerId, pe }));
  return { home: toList(home), away: toList(away) };
}

/**
 * Adds the MJP grantee's +4 PE to a team's awards (upsert). The grantee is
 * ALWAYS owed at least the 4 PE even when they recorded no action (mirrors the
 * result route's `computeTeamPeAwards`).
 */
export function addMvpPe(awards: readonly PeAward[], grantee: string): PeAward[] {
  const byId = new Map(awards.map((a) => [a.rosterPlayerId, a.pe]));
  byId.set(grantee, (byId.get(grantee) ?? 0) + PE_MVP);
  return Array.from(byId.entries()).map(([rosterPlayerId, pe]) => ({ rosterPlayerId, pe }));
}

/**
 * A casualty victim derived from a persisted casualty event: the victim's side,
 * rosterPlayerId and the SERVER-DERIVED band (persisted at confirm time, never
 * re-rolled). Mirrors the result route's `ResolvedCasualty` snapshot shape.
 */
export interface LiveCasualtyVictim {
  team: "home" | "away";
  rosterPlayerId: string;
  band: string;
}

/** Collects the casualties from the live events (band already server-derived). */
export function casualtyVictimsFromEvents(
  events: readonly ResolveEventLike[],
): LiveCasualtyVictim[] {
  const out: LiveCasualtyVictim[] = [];
  for (const event of events) {
    if (event.kind !== "casualty" || event.side == null || !event.playerRosterId) continue;
    const band = event.payload.band;
    if (typeof band !== "string") continue;
    out.push({ team: event.side, rosterPlayerId: event.playerRosterId, band });
  }
  return out;
}

/**
 * Validates a team's six MJP nominations: exactly 6 DISTINCT roster player ids
 * (duplicates and foreign ids are rejected). Returns an error message (the
 * i18n key fragment) or null when valid.
 */
export function validateMvpNominations(
  rawHome: unknown,
  rawAway: unknown,
  homeRosterIds: ReadonlySet<string>,
  awayRosterIds: ReadonlySet<string>,
): string | null {
  const check = (raw: unknown, rosterIds: ReadonlySet<string>): string | null => {
    if (!Array.isArray(raw) || raw.length !== 6) return "mvp.six";
    const seen = new Set<string>();
    for (const nomination of raw) {
      if (typeof nomination !== "string" || nomination.length === 0) return "mvp.ids";
      if (seen.has(nomination)) return "mvp.duplicate";
      seen.add(nomination);
      if (!rosterIds.has(nomination)) return "mvp.foreign";
    }
    return null;
  };
  return check(rawHome, homeRosterIds) ?? check(rawAway, awayRosterIds);
}
