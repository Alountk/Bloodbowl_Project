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
 * to the ProgressionPanel.
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
