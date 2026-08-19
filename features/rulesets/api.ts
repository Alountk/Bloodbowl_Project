import type { RulesetDto } from "@/lib/rulesets";

/** A ruleset as returned by the developer-only `/api/dev/rulesets` routes. */
export type Ruleset = RulesetDto;

/** The full wizard save payload (all Ruleset fields except id/timestamps). */
export interface RulesetDraft {
  name: string;
  description: string | null;
  races: string[];
  startingTreasury: number;
  tvCap: number | null;
  minPlayers: number;
  maxPlayers: number;
  hireFire: "between-jornadas" | "libre";
  seasonReform: boolean;
  mercenaries: boolean;
  active: boolean;
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

/** Developer-only: lists every ruleset (active and inactive). */
export async function listRulesets(): Promise<Ruleset[]> {
  const res = await fetch("/api/dev/rulesets");
  return readJson<Ruleset[]>(res);
}

/** Developer-only: creates a ruleset from the wizard draft. */
export async function createRuleset(draft: RulesetDraft): Promise<Ruleset> {
  const res = await fetch("/api/dev/rulesets", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(draft),
  });
  return readJson<Ruleset>(res);
}

/** Developer-only: partially updates a ruleset (any subset of the draft). */
export async function updateRuleset(
  id: string,
  patch: Partial<RulesetDraft>,
): Promise<Ruleset> {
  const res = await fetch(`/api/dev/rulesets/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(patch),
  });
  return readJson<Ruleset>(res);
}

/** Developer-only: hard-deletes an unreferenced ruleset. */
export async function deleteRuleset(id: string): Promise<void> {
  const res = await fetch(`/api/dev/rulesets/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(body?.error ?? `Request failed (${res.status})`);
  }
}

/**
 * UI formatters matching the Option-B preview chips: treasury/TV in the short
 * "1M"/"1,1M"/"1,15M" style and a "∞" for no cap.
 */
export function formatGold(value: number): string {
  if (value >= 1_000_000 && value % 1_000_000 === 0) {
    return `${value / 1_000_000}M`;
  }
  if (value >= 1_000_000) {
    const millions = value / 1_000_000;
    return `${Math.round(millions * 100) / 100}M`.replace(".", ",");
  }
  return value.toLocaleString("es-ES");
}

export function formatTvCap(value: number | null): string {
  return value === null ? "∞" : formatGold(value);
}
