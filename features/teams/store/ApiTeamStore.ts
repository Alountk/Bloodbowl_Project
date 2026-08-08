import type { Team } from "../types";
import { DEFAULT_COACHING, DEFAULT_LEAGUE_TYPE, isCoachingStaff } from "../types";
import type { TeamStore } from "./TeamStore";

/** A Team as returned by the user-scoped `/api/teams` routes (Prisma shape). */
interface ApiTeam {
  id: string;
  name: string;
  raceId: string;
  leagueType: string;
  roster: unknown;
  coaching: unknown;
}

/**
 * Server-backed TeamStore that talks to the user-scoped `/api/teams` routes.
 *
 * `list()` GETs the user's teams; `save()` POSTs a new team; `remove(id)`
 * DELETEs a team and treats a 404 as a no-op (idempotent). Any other error
 * response surfaces as a thrown error so the caller can recover (the API
 * routes require a session and return 401 unauthenticated).
 */
export class ApiTeamStore implements TeamStore {
  /** Absolute base URL (e.g. full origin for cross-origin clients). */
  constructor(private readonly baseUrl = "") {}

  private teamFromApi(team: ApiTeam): Team {
    const coaching = isCoachingStaff(team.coaching) ? team.coaching : DEFAULT_COACHING;
    return {
      id: team.id,
      name: team.name,
      raceId: team.raceId,
      leagueType: (team.leagueType as Team["leagueType"]) ?? DEFAULT_LEAGUE_TYPE,
      roster: Array.isArray(team.roster) ? (team.roster as Team["roster"]) : [],
      coaching: { ...DEFAULT_COACHING, ...coaching },
    };
  }

  async list(): Promise<Team[]> {
    const res = await fetch(`${this.baseUrl}/api/teams`);
    if (!res.ok) throw new Error(`Failed to load teams (${res.status})`);
    const data = (await res.json()) as ApiTeam[];
    return data.map((team) => this.teamFromApi(team));
  }

  async save(team: Team): Promise<Team> {
    const res = await fetch(`${this.baseUrl}/api/teams`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(team),
    });
    if (!res.ok) throw new Error(`Failed to save team (${res.status})`);
    const saved = (await res.json()) as ApiTeam;
    return this.teamFromApi(saved);
  }

  async remove(id: string): Promise<void> {
    const res = await fetch(`${this.baseUrl}/api/teams/${encodeURIComponent(id)}`, {
      method: "DELETE",
    });
    // 404 is treated as a no-op (idempotent), matching the TeamStore contract.
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to remove team (${res.status})`);
    }
  }
}
