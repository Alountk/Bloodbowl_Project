import type { FixtureDraft, League, LeagueDetail } from "@/features/leagues/api";

/**
 * An upcoming fixture surfaced on the Matches page: the underlying fixture plus
 * the league display name and the resolved home/away team names from the league
 * detail's team map. Team names are `undefined` when the detail map has no
 * matching team (the card falls back at render — the selector stays i18n-free).
 */
export interface UpcomingFixture extends FixtureDraft {
  leagueName: string;
  homeTeamName?: string;
  awayTeamName?: string;
}

export interface SelectUpcomingFixturesInput {
  userId: string | null | undefined;
  leagues: readonly League[];
  details: ReadonlyMap<string, LeagueDetail>;
}

/**
 * Pure selector (MP-1/MP-3): derives the user's upcoming fixtures from the
 * already-fetched league list and per-league details. Scope = leagues that are
 * `started` and that the user owns or is a member of; fixtures with status
 * `pending`|`scheduled` where the user participates (home/away owner, null-
 * safe). Played and foreign fixtures are excluded. Sorted by `scheduledAt`
 * ascending (undated last), then `round` ascending. No de-dup needed — a
 * fixture belongs to a single league.
 */
export function selectUpcomingFixtures(
  input: SelectUpcomingFixturesInput,
): UpcomingFixture[] {
  const { userId, leagues, details } = input;
  if (!userId) return [];

  const scopedLeagues = leagues.filter(
    (league) => league.status === "started" && (league.isMember || league.ownerId === userId),
  );

  const upcoming: UpcomingFixture[] = [];

  for (const league of scopedLeagues) {
    const detail = details.get(league.id);
    if (!detail) continue;

    const teamNameById = new Map(detail.teams.map((team) => [team.id, team.name]));

    for (const fixture of detail.fixtures) {
      const participates =
        fixture.homeOwner?.id === userId || fixture.awayOwner?.id === userId;
      const isUpcoming = fixture.status === "pending" || fixture.status === "scheduled";
      if (!participates || !isUpcoming) continue;

      upcoming.push({
        ...fixture,
        leagueName: league.name,
        homeTeamName: teamNameById.get(fixture.homeTeamId),
        awayTeamName: teamNameById.get(fixture.awayTeamId),
      });
    }
  }

  // scheduledAt ascending (null last), then round ascending.
  upcoming.sort((a, b) => {
    const aDate = a.scheduledAt ? new Date(a.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    const bDate = b.scheduledAt ? new Date(b.scheduledAt).getTime() : Number.POSITIVE_INFINITY;
    if (aDate !== bDate) return aDate - bDate;
    return a.round - b.round;
  });

  return upcoming;
}
