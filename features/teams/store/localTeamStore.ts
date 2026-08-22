import { InMemoryTeamStore } from "./InMemoryTeamStore";

/**
 * The local/anonymous-mode team store.
 *
 * A single module-level `InMemoryTeamStore` is shared by every shell mount so
 * teams survive client-side navigation within the tab session (create → home →
 * detail). A full reload re-evaluates the module and starts empty: local mode
 * no longer persists teams anywhere. The legacy `bb_teams_v1` localStorage key
 * is only ever READ by the one-time migration (see features/migration).
 */
let localStore: InMemoryTeamStore | null = null;

export function getLocalTeamStore(): InMemoryTeamStore {
  localStore ??= new InMemoryTeamStore();
  return localStore;
}
