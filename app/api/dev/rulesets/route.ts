import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireDeveloper } from "@/lib/devGuard";
import {
  rulesetToDto,
  validateRulesetBody,
} from "@/lib/rulesets";

/**
 * GET /api/dev/rulesets
 * Developer-only: lists every ruleset (active AND inactive) ordered by name.
 * Guards: 401 unauthenticated, 403 non-developer (DB-authoritative role).
 */
export async function GET() {
  const dev = await requireDeveloper();
  if (!dev.ok) {
    return NextResponse.json({ error: dev.error }, { status: dev.status });
  }
  const rulesets = await prisma.ruleset.findMany({ orderBy: { name: "asc" } });
  return NextResponse.json(rulesets.map(rulesetToDto));
}

/**
 * POST /api/dev/rulesets
 * Developer-only: creates a ruleset owned by the session user (`createdBy` is
 * injected from the session, never read from the body). 400 on any invalid
 * field (see validateRulesetBody: non-empty name, races ⊆ the 31-race catalog,
 * treasury/tvCap positive integers, 1..16 players with min ≤ max, known keys).
 */
export async function POST(req: Request) {
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

  const parsed = validateRulesetBody(body);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.error }, { status: 400 });
  }

  const ruleset = await prisma.ruleset.create({
    data: { ...parsed.value, createdBy: dev.userId },
  });
  return NextResponse.json(rulesetToDto(ruleset), { status: 201 });
}
