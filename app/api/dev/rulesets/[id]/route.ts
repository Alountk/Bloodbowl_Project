import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDeveloper } from "@/lib/devGuard";
import {
  rulesetToDto,
  validateRulesetBody,
  validateRulesetPatch,
} from "@/lib/rulesets";

/**
 * PATCH /api/dev/rulesets/[id]
 * Developer-only: partially updates a ruleset (any subset of the POST fields,
 * each validated with the same rules; unknown fields → 400). The partial patch
 * is merged over the stored row and the FULL merged shape is validated again so
 * cross-field invariants (min ≤ max players) always hold. Unknown id → 404.
 */
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dev = await requireDeveloper();
  if (!dev.ok) {
    return NextResponse.json({ error: dev.error }, { status: dev.status });
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const patch = validateRulesetPatch(body);
  if (!patch.ok) {
    return NextResponse.json({ error: patch.error }, { status: 400 });
  }

  const existing = await prisma.ruleset.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const merged = {
    name: existing.name,
    description: existing.description,
    races: Array.isArray(existing.races) ? (existing.races as string[]) : [],
    startingTreasury: existing.startingTreasury,
    tvCap: existing.tvCap,
    minPlayers: existing.minPlayers,
    maxPlayers: existing.maxPlayers,
    hireFire: existing.hireFire,
    seasonReform: existing.seasonReform,
    mercenaries: existing.mercenaries,
    active: existing.active,
    ...patch.value,
  };
  const full = validateRulesetBody(merged);
  if (!full.ok) {
    return NextResponse.json({ error: full.error }, { status: 400 });
  }

  const updated = await prisma.ruleset.update({
    where: { id },
    data: full.value,
  });
  return NextResponse.json(rulesetToDto(updated));
}

/**
 * DELETE /api/dev/rulesets/[id]
 * Developer-only: hard-deletes a ruleset. 409 when any league references it
 * (the FK is SET NULL, but silently clearing a live league's ruleset would hide
 * a misconfiguration — the developer must unlink leagues first). Unknown id
 * → 404.
 */
export async function DELETE(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const dev = await requireDeveloper();
  if (!dev.ok) {
    return NextResponse.json({ error: dev.error }, { status: dev.status });
  }

  const existing = await prisma.ruleset.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const referencing = await prisma.league.count({ where: { rulesetId: id } });
  if (referencing > 0) {
    return NextResponse.json(
      { error: "Ruleset is referenced by a league" },
      { status: 409 },
    );
  }

  await prisma.ruleset.delete({ where: { id } });
  return new NextResponse(null, { status: 204 });
}
