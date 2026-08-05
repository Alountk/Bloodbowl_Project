import type { Team } from "../types";

export interface TeamStore {
  /** Returns all persisted teams, ordered by insertion time (oldest first). */
  list(): Promise<Team[]>;
  /** Upserts a team by id. Returns the saved team. */
  save(team: Team): Promise<Team>;
  /** Removes a team by id. No-op if id does not exist (idempotent). */
  remove(id: string): Promise<void>;
}
