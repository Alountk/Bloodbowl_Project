import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import type { PlayerEntry } from "@/features/teams/types";

/**
 * Pure: validates a proposed roster order against the team's CURRENT roster ids
 * and returns the next roster sequence. The order must be EXACTLY the same set
 * as the team's roster — same length, no duplicates, no foreign ids (length +
 * uniqueness + membership together also rule out missing ids). The entries
 * themselves are untouched; only their sequence changes (RAU-9: the dorsal is
 * derived from the roster order, so a reorder renumbers the squad).
 */
export function applyRosterOrder(
  roster: PlayerEntry[],
  order: unknown,
): { ok: true; roster: PlayerEntry[] } | { ok: false; error: string } {
  if (!Array.isArray(order)) {
    return { ok: false, error: "order must be an array of roster player ids" };
  }
  if (order.some((id) => typeof id !== "string")) {
    return { ok: false, error: "order must contain only roster player ids" };
  }

  const currentIds = roster.map((entry) => entry.id);
  const unique = new Set(order);
  if (order.length !== currentIds.length || unique.size !== order.length) {
    return { ok: false, error: "order must contain every roster player exactly once" };
  }
  const current = new Set(currentIds);
  if (order.some((id) => !current.has(id))) {
    return { ok: false, error: "order contains ids outside the team's roster" };
  }

  const byId = new Map(roster.map((entry) => [entry.id, entry]));
  return { ok: true, roster: order.map((id) => byId.get(id) as PlayerEntry) };
}

/**
 * PATCH /api/teams/[teamId]/roster-order
 * Reorders the team's roster (RAU-9). Body `{ order: string[] }` must contain
 * the EXACT same set of roster player ids as the team's current roster — no
 * duplicates, no missing, no foreign ids (400 otherwise). The roster JSON is
 * the identity source of truth (`lib/players.ts`), and the dorsal is derived
 * from its order, so renumbering is implicit. Owned team only: a foreign or
 * archived team id returns 404 (no existence leak), unauthenticated 401.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id: teamId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, userId, archivedAt: null },
    select: { id: true, roster: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }
  const order =
    typeof raw === "object" && raw !== null ? (raw as Record<string, unknown>).order : undefined;

  const roster = Array.isArray(team.roster) ? (team.roster as unknown as PlayerEntry[]) : [];
  const applied = applyRosterOrder(roster, order);
  if (!applied.ok) {
    return NextResponse.json({ error: applied.error }, { status: 400 });
  }

  const updated = await prisma.team.update({
    where: { id: teamId },
    data: { roster: applied.roster as never },
  });
  return NextResponse.json({ roster: updated.roster });
}
