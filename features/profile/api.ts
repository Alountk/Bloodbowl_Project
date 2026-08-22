/**
 * Server-backed profile API wrapper. Mirrors the leagues api.ts readJson /
 * fetch-with-session pattern: the routes return 401 when unauthenticated, and
 * callers surface network/status errors. `getMe` reads the avatar from the DB
 * (GET /api/me, not the JWT); `uploadAvatar` sends the CROPPED blob (never crop
 * coordinates) in the `avatar` multipart field.
 */

/** The session user profile as returned by GET/PATCH /api/me. */
export interface Profile {
  id: string;
  name: string | null;
  email: string;
  avatar: string | null;
}

/** Career stats as served by GET /api/me/stats. */
export interface CareerStats {
  championships: number;
  teams: number;
  leaguesOwned: number;
  leaguesMember: number;
  /** Distinct leagues the user owns OR has a team in. */
  leagues: number;
  matches: number;
  wins: number;
  draws: number;
  losses: number;
}

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

/** GET /api/me — returns id, name, email, and the stored adapter avatar value. */
export async function getMe(): Promise<Profile> {
  return readJson<Profile>(await fetch("/api/me"));
}

/**
 * PATCH /api/me — updates only `name` (free text) or `avatar` (null to clear,
 * or the current adapter-issued value). Any other field or a `data:`/external
 * avatar returns 400.
 */
export async function patchMe(patch: { name?: string; avatar?: string | null }): Promise<Profile> {
  const res = await fetch("/api/me", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return readJson<Profile>(res);
}

/**
 * POST /api/me/avatar — sends the cropped image blob as the `avatar` multipart
 * field. Returns the adapter-issued value the server persisted.
 */
export async function uploadAvatar(blob: Blob): Promise<{ avatar: string }> {
  const form = new FormData();
  form.append("avatar", blob, "avatar.webp");
  const res = await fetch("/api/me/avatar", { method: "POST", body: form });
  return readJson<{ avatar: string }>(res);
}

/** GET /api/me/stats — the session user's career stats. */
export async function getStats(): Promise<CareerStats> {
  return readJson<CareerStats>(await fetch("/api/me/stats"));
}

/**
 * PATCH /api/me/password — self-service password change.
 *
 * The server verifies the CURRENT password with bcrypt and validates the NEW
 * one with the signup rule (>= 8 chars). Thrown errors carry `status` AND a
 * machine-readable `code` (`wrong-current-password` / `weak-new-password`) so
 * the form can pick the right localized copy without parsing English.
 */
export async function changePassword(patch: {
  currentPassword: string;
  newPassword: string;
}): Promise<{ ok: true }> {
  const res = await fetch("/api/me/password", {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    const err = new Error(body?.error ?? `Request failed (${res.status})`) as Error & {
      status?: number;
      code?: string;
    };
    err.status = res.status;
    err.code = body?.code;
    throw err;
  }
  return (await res.json()) as { ok: true };
}
