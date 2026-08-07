import type { Race, Team } from "../types";
import { RosterTable } from "../roster-table/RosterTable";
import {
  computeRosterCostFromPlayers,
  computeCoachingCostItems,
  computeCoachingCost,
  STARTING_TREASURY,
} from "../roster";

export interface TeamDetailViewProps {
  team: Team;
  /**
   * Resolved race for this team. Caller is responsible for passing getRaceById(team.raceId)
   * and constructing a FALLBACK_RACE when the catalog returns undefined:
   *   { id: team.raceId, name: team.raceId, rerollCost: 0, positionals: [] }
   * This ensures RosterTable always receives a valid Race shape and the raw raceId is
   * displayed as the race name (spec requirement: Race-not-in-catalog Fallback).
   */
  race: Race;
}

function formatGold(value: number): string {
  return `${(value / 1000).toLocaleString("en-US")}k`;
}

const COACHING_LABELS: Record<string, string> = {
  rerolls: "Rerolls",
  dedicatedFans: "Dedicated Fans",
  assistantCoaches: "Assistant Coaches",
  cheerleaders: "Cheerleaders",
};

export function TeamDetailView({ team, race }: TeamDetailViewProps) {
  const rosterCost = computeRosterCostFromPlayers(race, team.roster);
  const coachingCost = computeCoachingCost(race, team.coaching);
  const treasury = STARTING_TREASURY - rosterCost - coachingCost;
  const coachingItems = computeCoachingCostItems(race, team.coaching);

  return (
    <div>
      {/* Team identity */}
      <header>
        <h1>{team.name}</h1>
        <p>{race.name}</p>
        <p>{team.leagueType}</p>
      </header>

      {/* Read-only roster */}
      <section aria-labelledby="roster-heading">
        <h2 id="roster-heading">Roster</h2>
        <RosterTable readOnly players={team.roster} race={race} bannerText={team.name} apothecary={team.coaching.apothecary} />
      </section>

      {/* Coaching staff breakdown */}
      <section aria-labelledby="coaching-heading">
        <h2 id="coaching-heading">Coaching Staff</h2>
        <ul>
          {coachingItems.map((item) => (
            <li key={item.key}>
              <span>{COACHING_LABELS[item.key] ?? item.key}</span>
              <span>{item.quantity}</span>
              <span>{formatGold(item.unitCost)}</span>
              <span>{formatGold(item.total)}</span>
            </li>
          ))}
          {team.coaching.apothecary && (
            <li key="apothecary">
              <span>Apothecary</span>
              <span>1</span>
              <span>50k</span>
              <span>50k</span>
            </li>
          )}
        </ul>
      </section>

      {/* Derived treasury */}
      <section aria-labelledby="treasury-heading">
        <h2 id="treasury-heading">Treasury</h2>
        <p>{formatGold(treasury)}</p>
      </section>
    </div>
  );
}
