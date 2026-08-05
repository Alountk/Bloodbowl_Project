import type { Team } from "../types";
import type { TeamStore } from "./TeamStore";

/**
 * Map-based in-memory TeamStore for use in tests and SSR contexts.
 * Zero localStorage access — safe to use in any environment.
 */
export class InMemoryTeamStore implements TeamStore {
  /** Preserves insertion order via ordered array of ids. */
  private readonly ids: string[] = [];
  private readonly map = new Map<string, Team>();

  constructor(seed: Team[] = []) {
    for (const team of seed) {
      this.ids.push(team.id);
      this.map.set(team.id, team);
    }
  }

  list(): Promise<Team[]> {
    return Promise.resolve(this.ids.map((id) => this.map.get(id)!));
  }

  save(team: Team): Promise<Team> {
    if (!this.map.has(team.id)) {
      this.ids.push(team.id);
    }
    this.map.set(team.id, team);
    return Promise.resolve(team);
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
