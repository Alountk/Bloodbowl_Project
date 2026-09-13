import type { ActaActionLine, ActaTeamDraft } from "./actaState";

/**
 * A casualty victim derived from the Acciones step: the team whose player was
 * injured and that player's roster id. Mirrors the payload's casualty entry
 * shape so `buildActaPayload` can pass it straight through.
 */
export interface ActaCasualtyEntry {
  team: "home" | "away";
  rosterPlayerId: string;
}

/**
 * Pure: maps the casualty action lines recorded by ONE team into the victim
 * entries that team caused. A casualty line is one casualty against one victim
 * (the wizard adds a new line per casualty, so quantity is not multiplied here);
 * non-casualty lines and lines without a chosen victim are ignored. This is the
 * single mapping the Bajas step and the payload assembly share, so the derived
 * list can never drift from what Step 2 recorded (MAW-4 / MAW-6).
 */
export function casualtiesFromActions(
  actions: readonly ActaActionLine[],
): ActaCasualtyEntry[] {
  const entries: ActaCasualtyEntry[] = [];
  for (const action of actions) {
    if (action.kind !== "casualty") continue;
    if (!action.victimRosterPlayerId) continue;
    entries.push({
      team: action.victimTeam ?? "away",
      rosterPlayerId: action.victimRosterPlayerId,
    });
  }
  return entries;
}

/**
 * Pure: the combined victim list for the whole match (both teams), in the order
 * the Acciones step recorded them. The Bajas step renders this read-only list;
 * it is never re-entered (MAW-4 / MAW-6).
 */
export function deriveCasualtyEntries(state: {
  home: ActaTeamDraft;
  away: ActaTeamDraft;
}): ActaCasualtyEntry[] {
  return [
    ...casualtiesFromActions(state.home.actions),
    ...casualtiesFromActions(state.away.actions),
  ];
}
