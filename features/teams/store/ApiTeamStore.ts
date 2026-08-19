import type { Team } from "../types";
import { DEFAULT_COACHING, isCoachingStaff } from "../types";
import type { TeamStore } from "./TeamStore";

/**
 * Thrown when a DELETE is blocked because the team still belongs to a league.
 * The API returns 409 for member teams; the UI surfaces this message so the
 * user can expel the team from its league before deleting.
 */
export class ArchiveGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ArchiveGuardError";
  }
}

/** A Team as returned by the user-scoped `/api/teams` routes (Prisma shape). */
interface ApiTeam {
  id: string;
  name: string;
  raceId: string;
  leagueId: string | null;
  roster: unknown;
  coaching: unknown;
  treasury: number;
}

/**
 * Server-backed TeamStore that talks to the user-scoped `/api/teams` routes.
 *
 * `list()` GETs the user's teams; `save()` POSTs a new team; `remove(id)`
 * DELETEs a team and treats a 404 as a no-op (idempotent), while a 409 (team
 * still in a league) surfaces as an `ArchiveGuardError` so the UI can explain
 * the block. Any other error response surfaces as a thrown error so the caller
 * can recover (the API routes require a session and return 401 unauthenticated).
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
      leagueId: team.leagueId ?? null,
      roster: Array.isArray(team.roster) ? (team.roster as Team["roster"]) : [],
      coaching: { ...DEFAULT_COACHING, ...coaching },
      // Legacy API responses without the field default to 0 (no winnings yet).
      treasury: team.treasury ?? 0,
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
    if (res.status === 409) {
      throw new ArchiveGuardError("This team still belongs to a league. Expel it first.");
    }
    if (!res.ok && res.status !== 404) {
      throw new Error(`Failed to remove team (${res.status})`);
    }
  }
}
