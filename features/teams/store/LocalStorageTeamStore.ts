import type { Team } from "../types";
import { DEFAULT_COACHING, DEFAULT_LEAGUE_TYPE, isCoachingStaff } from "../types";
import type { TeamStore } from "./TeamStore";

const STORAGE_KEY = "bb_teams_v1";

/**
 * LocalStorage-backed TeamStore.
 *
 * Design constraints:
 * - Storage is accessed ONLY inside method calls (never at construction time).
 * - Corrupt JSON → returns [] (fail-soft recovery).
 * - QuotaExceededError → console.warn, keep in-memory state, no throw.
 */
export class LocalStorageTeamStore implements TeamStore {
  private readonly _storage: Storage | undefined;

  /**
   * @param storage Injected storage (for testing). Defaults to `window.localStorage`
   *   accessed lazily on first method call — never at construction time.
   */
  constructor(storage?: Storage) {
    this._storage = storage;
  }

  private get storage(): Storage {
    return this._storage ?? window.localStorage;
  }

  /** Backfills coaching/leagueType defaults for legacy persisted teams. */
  private normalize(team: Team): Team {
    const coaching = isCoachingStaff(team.coaching) ? team.coaching : DEFAULT_COACHING;
    return {
      ...team,
      coaching: { ...DEFAULT_COACHING, ...coaching },
      leagueType: team.leagueType ?? DEFAULT_LEAGUE_TYPE,
    };
  }

  private readAll(): Team[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      const parsed = JSON.parse(raw) as Team[];
      return parsed.map((t) => this.normalize(t));
    } catch {
      return [];
    }
  }

  list(): Promise<Team[]> {
    return Promise.resolve(this.readAll());
  }

  save(team: Team): Promise<Team> {
    const current = this.readAll();
    const origIdx = current.findIndex((t) => t.id === team.id);
    let ordered: Team[];
    if (origIdx === -1) {
      ordered = [...current, team];
    } else {
      ordered = current.map((t) => (t.id === team.id ? team : t));
    }

    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(ordered));
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        console.warn("[TeamStore] QuotaExceededError: team not persisted.", e);
      } else {
        throw e;
      }
    }
    return Promise.resolve(team);
  }

  remove(id: string): Promise<void> {
    const current = this.readAll();
    const next = current.filter((t) => t.id !== id);
    try {
      this.storage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch (e) {
      if (e instanceof DOMException && e.name === "QuotaExceededError") {
        console.warn("[TeamStore] QuotaExceededError: remove not persisted.", e);
      } else {
        throw e;
      }
    }
    return Promise.resolve();
  }
}
