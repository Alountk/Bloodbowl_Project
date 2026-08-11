/**
 * BB2025 primary experience (PE) awards per action — user-validated table
 * (bb2025-rules R1). Values are pinned here and exhaustively asserted by tests.
 */

export const PE_TD = 3;
export const PE_MVP = 4;
export const PE_INTERCEPTION = 2;
export const PE_CASUALTY = 2;
export const PE_COMPLETION = 1;
export const PE_TTM = 1;
export const PE_LANDED_SAFE = 1;

/** Per-player action counts reported with a scored result. */
export interface PlayerActions {
  tds: number;
  casualties: number;
  completions: number;
  interceptions: number;
  fouls: number;
  throwTeamMates: number;
  landedSafe: number;
}

/**
 * Computes the PE a single player earns from their recorded actions.
 * Fouls never award PE in the user-validated table.
 */
export function awardPeForActions(actions: PlayerActions): number {
  return (
    actions.tds * PE_TD +
    actions.casualties * PE_CASUALTY +
    actions.completions * PE_COMPLETION +
    actions.interceptions * PE_INTERCEPTION +
    actions.throwTeamMates * PE_TTM +
    actions.landedSafe * PE_LANDED_SAFE
  );
}

/**
 * Rulebook MJP method: six nominated players numbered 1-6; a 1D6 roll
 * (`roll`, 1-6) selects the winner. Returns the nominated player.
 */
export function selectMvpWinner(nominations: readonly string[], roll: number): string {
  return nominations[roll - 1];
}
