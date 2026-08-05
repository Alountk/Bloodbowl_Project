import type { Team } from "../types";
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

  private readAll(): Team[] {
    try {
      const raw = this.storage.getItem(STORAGE_KEY);
      if (!raw) return [];
      return JSON.parse(raw) as Team[];
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
