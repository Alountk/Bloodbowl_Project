import {
  PE_TD,
  PE_MVP,
  PE_CASUALTY,
  awardPeForActions,
  selectMvpWinner,
  resolveInjury,
  type PlayerActions,
  type InjuryOutcome,
} from "./rules";

/** Re-exported PE award constants for the result route. */
export const PE = {
  TD: PE_TD,
  MVP: PE_MVP,
  CASUALTY: PE_CASUALTY,
};

export type ResultPlayerAction = PlayerActions & { rosterPlayerId: string };

/**
 * Sums a team's per-player TD credits so the route can validate them against
 * the reported final score (match-result R2).
 */
export function sumTds(players: readonly ResultPlayerAction[]): number {
  return players.reduce((total, action) => total + action.tds, 0);
}

/**
 * True only when each team's per-player TDs equal its reported final score
 * (match-result R2). A score report whose TDs mismatch the score is rejected
 * with 400 before any mutation.
 */
export function scoresMatchReportedTotals(
  homePlayers: readonly ResultPlayerAction[],
  homeScore: number,
  awayPlayers: readonly ResultPlayerAction[],
  awayScore: number,
): boolean {
  return sumTds(homePlayers) === homeScore && sumTds(awayPlayers) === awayScore;
}

/**
 * Derives the winner fixture id from the final scores; a draw produces no
 * winner (match-result R2). Used to set `Fixture.winnerId` after a result loads.
 */
export function deriveWinnerId(
  homeScore: number,
  awayScore: number,
  homeTeamId: string,
  awayTeamId: string,
): string | null {
  if (homeScore > awayScore) return homeTeamId;
  if (awayScore > homeScore) return awayTeamId;
  return null;
}

/**
 * Rulebook MJP method: the six nominations numbered 1-6 and a server-owned 1D6
 * roll select the grantee (bb2025-rules R1).
 */
export function computeMvpGrantee(nominations: readonly string[], roll6: number): string {
  return selectMvpWinner(nominations, roll6);
}

/**
 * A list of PE awards — one per reported player plus the MJP grantee — computed
 * from each player's recorded actions and the 4-PE MJP bonus. The grantee is
 * always included (even when unreported in the actions list, per the rulebook
 * MJP method at least the 4 PE are owed).
 */
export function computeTeamPeAwards(
  players: readonly ResultPlayerAction[],
  mvpGrantee: string,
): { rosterPlayerId: string; pe: number }[] {
  const byId = new Map(players.map((action) => [action.rosterPlayerId, awardPeForActions(action)]));
  byId.set(mvpGrantee, (byId.get(mvpGrantee) ?? 0) + PE_MVP);
  return Array.from(byId.entries()).map(([rosterPlayerId, pe]) => ({ rosterPlayerId, pe }));
}

/**
 * Petty cash awarded to the lower-TV team in a result: the absolute team-value
 * difference (proposal: computed from TV difference and persisted in the
 * report). Equal TVs award nothing.
 */
export function computePettyCash(homeTv: number, awayTv: number): number {
  return Math.abs(homeTv - awayTv);
}

/**
 * Team value (TV) used for the petty-cash comparison: roster base cost plus
 * coaching-staff cost plus the skill value bonuses already tracked on Players
 * (+10k normal / +20k élite). The route extracts these three parts from the
 * fetched team+race; this sums them.
 */
export function computeTeamTv(rosterCost: number, coachingCost: number, valueBonusSum: number): number {
  return rosterCost + coachingCost + valueBonusSum;
}

/**
 * Resolves one 1D16 injury outcome per reported casualty, in the order the
 * causes were reported. `rolls` are server-owned 1D16 values. Each casualty
 * yields the rulebook band (bruise/apaleado/grave/permanent/dead); a player
 * carrying a previous permanent injury would add a +1 LMC modifier but that
 * requires victim identity, so the aggregate resolution defaults to 0 here.
 */
export function resolveTeamInjuries(
  casualties: number,
  rolls: readonly number[],
  permanentModifier = 0,
): InjuryOutcome[] {
  const count = Math.max(0, casualties);
  const outcomes: InjuryOutcome[] = [];
  for (let i = 0; i < count; i++) {
    outcomes.push(resolveInjury(rolls[i] ?? 0, permanentModifier));
  }
  return outcomes;
}
