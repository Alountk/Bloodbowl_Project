import type { Team } from "../types";
import { DEFAULT_COACHING, isCoachingStaff } from "../types";
import type { TeamStore } from "./TeamStore";

/**
 * Map-based in-memory TeamStore for use in tests and SSR contexts.
 * Zero localStorage access — safe to use in any environment.
 */
export class InMemoryTeamStore implements TeamStore {
  /** Preserves insertion order via ordered array of ids. */
  private readonly ids: string[] = [];
  private readonly map = new Map<string, Team>();

  /** Backfills coaching defaults and guarantees normalized fields on read. */
  private normalize(team: Team): Team {
    const coaching = isCoachingStaff(team.coaching) ? team.coaching : DEFAULT_COACHING;
    return {
      ...team,
      leagueId: team.leagueId ?? null,
      coaching: { ...DEFAULT_COACHING, ...coaching },
    };
  }

  constructor(seed: Team[] = []) {
    for (const team of seed) {
      const normalized = this.normalize(team);
      this.ids.push(normalized.id);
      this.map.set(normalized.id, normalized);
    }
  }

  list(): Promise<Team[]> {
    const teams = this.ids.map((id) => this.map.get(id)!);
    return Promise.resolve(teams.map((t) => this.normalize(t)));
  }

  save(team: Team): Promise<Team> {
    const normalized = this.normalize(team);
    if (!this.map.has(normalized.id)) {
      this.ids.push(normalized.id);
    }
    this.map.set(normalized.id, normalized);
    return Promise.resolve(normalized);
  }

  remove(id: string): Promise<void> {
    const idx = this.ids.indexOf(id);
    if (idx !== -1) {
      this.ids.splice(idx, 1);
      this.map.delete(id);
    }
    return Promise.resolve();
  }
}
