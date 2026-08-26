import type { Permission } from "@/lib/permissions";

/** A user row as returned by the dev user-management routes (RAU-52). */
export interface DevUser {
  id: string;
  email: string;
  name: string | null;
  role: string;
  plan: string;
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

/** Developer-only: lists every account for the role/plan manager. */
export async function listDevUsers(): Promise<DevUser[]> {
  const res = await fetch("/api/dev/users");
  return readJson<DevUser[]>(res);
}

/** Developer-only: patches a user's role/plan (PATCH /api/dev/users/[id]). */
export async function patchDevUser(
  id: string,
  data: Partial<Pick<DevUser, "role" | "plan">>,
): Promise<DevUser> {
  const res = await fetch(`/api/dev/users/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(data),
  });
  return readJson<DevUser>(res);
}

export type { Permission };
