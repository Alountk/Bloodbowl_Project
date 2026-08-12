import type { LiveMatchView, LiveMatchEventDto } from "./api";
import type { ResultTeamDraft } from "./ResultModal";

/**
 * Result prefill (LM-9/D8): maps a finished `LiveMatchView` into the result
 * modal's INITIAL per-team draft — the final scores and each scorer's TD count
 * derived from the live `td` events. Coaches still confirm MVP/MJP nominations,
 * casualty victims (with the coach-reported band), and every other action count;
 * the existing result POST validates (Σ TD == score, exactly 6 MJP nominations,
 * server-side 1D6/1D16 rolls) and stays the single authority. No dice logic, no
 * parallel result path.
 */

/** The zeroed action row used for a scorer (only `tds` is set by the prefill). */
const EMPTY_ACTIONS = {
  tds: 0,
  casualties: 0,
  completions: 0,
  interceptions: 0,
  fouls: 0,
  throwTeamMates: 0,
  landedSafe: 0,
};

/** Sums one side's per-scorer TDs from the live `td` events. */
function tdsByScorer(events: readonly LiveMatchEventDto[], side: "home" | "away"): Map<string, number> {
  const map = new Map<string, number>();
  for (const event of events) {
    if (event.kind === "td" && event.side === side && event.playerRosterId) {
      map.set(event.playerRosterId, (map.get(event.playerRosterId) ?? 0) + 1);
    }
  }
  return map;
}

function teamDraft(
  side: "home" | "away",
  score: number,
  scorers: Map<string, number>,
): ResultTeamDraft {
  const players: ResultTeamDraft["players"] = {};
  for (const [rosterPlayerId, tds] of scorers) {
    players[rosterPlayerId] = { ...EMPTY_ACTIONS, tds };
  }
  return {
    score,
    ballHeld: true,
    players,
    // MJP nominations and casualty victims stay coach input.
    mvpNominations: [],
    casualties: [],
  };
}

/** Prefills the result modal draft from a finished live match (initial state only). */
export function buildResultPrefill(live: LiveMatchView): { home: ResultTeamDraft; away: ResultTeamDraft } {
  return {
    home: teamDraft("home", live.homeScore, tdsByScorer(live.events, "home")),
    away: teamDraft("away", live.awayScore, tdsByScorer(live.events, "away")),
  };
}
