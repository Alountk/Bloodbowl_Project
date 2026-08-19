import type { PlayerProgressionCore } from "./types";
import type { ImproveBody } from "@/lib/progression";

/** Reads and unmarshals a JSON response, throwing with the server's error
 * message (or a generic one) when the response is not OK. Mirrors the
 * `readJson` helper in `features/leagues/api.ts`. */
async function readJson<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    const err = new Error(body?.error ?? `Request failed (${res.status})`) as Error & {
      status?: number;
    };
    err.status = res.status;
    throw err;
  }
  return (await res.json()) as T;
}

/**
 * Fetches the team OWNER's Player progression rows (`GET /api/teams/[teamId]/progression`).
 * Returns `PlayerProgressionCore[]` keyed to the roster by `rosterPlayerId`; an
 * empty list is valid (no result recorded yet). A foreign/archived team returns
 * 404 and a missing session 401 — callers surface the error and render read-only.
 */
export async function fetchTeamProgression(teamId: string): Promise<PlayerProgressionCore[]> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/progression`);
  return readJson<PlayerProgressionCore[]>(res);
}

/**
 * Fires a BB2025 PE spend on a roster player (`POST /api/teams/[teamId]/players/[playerId]/improve`).
 * Resolves with the endpoint JSON (success: `peRemaining`/`skill`/`candidates`;
 * failure: `{ error }` thrown verbatim). This is the `onImprove` client passed
 * to the team detail improve modal.
 */
export async function improvePlayer(
  teamId: string,
  rosterPlayerId: string,
  body: ImproveBody,
): Promise<Record<string, unknown>> {
  const res = await fetch(
    `/api/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(rosterPlayerId)}/improve`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    },
  );
  return readJson<Record<string, unknown>>(res);
}

/**
 * Renames a roster player (`PATCH /api/teams/[teamId]/players/[playerId]`).
 * Resolves with the updated `{ name }`; a foreign/archived team or a player
 * that does not belong to it resolves 404, a blank/oversized name 400, a
 * missing session 401 — failures are thrown with the server's `error` verbatim.
 */
export async function renamePlayer(
  teamId: string,
  rosterPlayerId: string,
  name: string,
): Promise<{ name: string }> {
  const res = await fetch(
    `/api/teams/${encodeURIComponent(teamId)}/players/${encodeURIComponent(rosterPlayerId)}`,
    {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name }),
    },
  );
  return readJson<{ name: string }>(res);
}

/**
 * Reorders the team's roster (`PATCH /api/teams/[teamId]/roster-order`).
 * The dorsal is derived from the roster order, so a reorder renumbers the
 * squad. Resolves with `{ roster }` (the persisted `PlayerEntry[]` in the new
 * order); a non-exact id set resolves 400, a foreign/archived team 404, a
 * missing session 401 — failures are thrown with the server's `error` verbatim.
 */
export async function reorderRoster(
  teamId: string,
  order: string[],
): Promise<{ roster: { id: string; name: string; positionalKey: string }[] }> {
  const res = await fetch(`/api/teams/${encodeURIComponent(teamId)}/roster-order`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ order }),
  });
  return readJson<{ roster: { id: string; name: string; positionalKey: string }[] }>(res);
}
