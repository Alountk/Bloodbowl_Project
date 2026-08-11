import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { prisma } from "@/lib/prisma";
import {
  improvementCost,
  attributeOptionsForRoll,
  type PlayerAttribute,
} from "@/lib/rules";
import { rollD6, rollD8 } from "@/lib/random";
import {
  rollTwoSkills,
  skillCellIndex,
  cellIndexToSkill,
  SKILL_COLUMNS,
  type SkillColumn,
} from "@/lib/rules/skills";
import { accessLetterForCategory, skillDisplayName, skillElite, skillKey } from "@/lib/progression";
import { computeValueBonus } from "@/lib/value";
import { getSkillById } from "@/features/teams/data/skills";
import { getRaceById } from "@/features/teams/data/races";

/**
 * POST /api/teams/[teamId]/players/[playerId]/improve
 * Spends Primary Experience (PE) on a BB2025 player improvement (progression).
 * `[playerId]` is the roster player's `rosterPlayerId`, resolved against the
 * unique `(teamId, rosterPlayerId)` key. Only the team owner may improve a
 * player (404 for a foreign team — no existence leak), a dead player cannot
 * spend (409), and a spend above the PE balance is rejected (400).
 *
 * Kinds (design fork 6A): `random-roll` starts a server-owned skill roll for a
 * chosen access-letter category and returns two candidates (persisting them via
 * `PlayerPendingRoll` cell indexes); `random-pick` completes the roll by picking
 * one candidate; `primary`/`secondary` buy a specific catalog skill when its
 * category is in the positional's access letters; `attribute` rolls the 1D8
 * table and applies an in-options attribute increase. All dice are server-owned
 * (`lib/random`). Every spend runs in one `$transaction` and appends an
 * improvement record, deducts PE, and recomputes the player's value bonus.
 */

type ImproveBody =
  | { type: "random-roll"; category: string }
  | { type: "random-pick"; selectedSkill: string }
  | { type: "primary" | "secondary"; skillId: string }
  | { type: "attribute"; attribute: string };

const MAX_RE_ROLLS = 100;

function isSkillColumn(value: string): value is SkillColumn {
  return (SKILL_COLUMNS as readonly string[]).includes(value);
}

function isAttribute(value: string): value is PlayerAttribute {
  return ["ma", "st", "ag", "pa", "av"].includes(value);
}

async function parseBody(req: Request): Promise<ImproveBody | null> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return null;
  }
  if (typeof raw !== "object" || raw === null) return null;
  const body = raw as Record<string, unknown>;
  const type = body.type;
  if (typeof type !== "string") return null;
  switch (type) {
    case "random-roll":
      return typeof body.category === "string" ? { type, category: body.category } : null;
    case "random-pick":
      return typeof body.selectedSkill === "string" ? { type, selectedSkill: body.selectedSkill } : null;
    case "primary":
    case "secondary":
      return typeof body.skillId === "string" ? { type, skillId: body.skillId } : null;
    case "attribute":
      return typeof body.attribute === "string" ? { type, attribute: body.attribute } : null;
    default:
      return null;
  }
}

interface RosterPlayerModel {
  id: string;
  rosterPlayerId: string;
  positionalKey: string;
  pe: number;
  skills: unknown;
  alive: boolean;
  valueBonus: number;
  improvements: unknown;
  attributeIncreases: unknown;
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ teamId: string; playerId: string }> },
) {
  const { teamId, playerId } = await params;
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const team = await prisma.team.findFirst({
    where: { id: teamId, userId, archivedAt: null },
    select: { id: true, raceId: true },
  });
  if (!team) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const player = (await prisma.player.findUnique({
    where: { teamId_rosterPlayerId: { teamId, rosterPlayerId: playerId } },
    select: {
      id: true,
      rosterPlayerId: true,
      positionalKey: true,
      pe: true,
      skills: true,
      alive: true,
      valueBonus: true,
      improvements: true,
      attributeIncreases: true,
    },
  })) as RosterPlayerModel | null;
  if (!player) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }
  if (!player.alive) {
    return NextResponse.json(
      { error: "A dead player cannot spend PE on improvements" },
      { status: 409 },
    );
  }

  const body = await parseBody(req);
  if (!body) {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  const skillsRefs = Array.isArray(player.skills) ? (player.skills as string[]) : [];
  const improvements = Array.isArray(player.improvements) ? (player.improvements as unknown[]) : [];
  const ownedKeys = new Set(skillsRefs.map(skillKey));

  // Positional access letters (A/F/G/M/P/T) from the race catalog.
  const race = getRaceById(team.raceId);
  const positional = race?.positionals.find((p) => p.key === player.positionalKey);
  const accessPrimary: string[] = positional?.accessPrimary ?? [];
  const accessSecondary: string[] = positional?.accessSecondary ?? [];

  // random-roll
  if (body.type === "random-roll") {
    if (!isSkillColumn(body.category)) {
      return NextResponse.json({ error: "Invalid category" }, { status: 400 });
    }
    const category: SkillColumn = body.category;
    const accessible = accessPrimary.includes(category) || accessSecondary.includes(category);
    if (!accessible) {
      return NextResponse.json(
        { error: "This player cannot access that skill category" },
        { status: 400 },
      );
    }
    const cost = improvementCost(improvements.length + 1, "random");
    if (player.pe < cost) {
      return NextResponse.json(
        { error: "Not enough PE" },
        { status: 400 },
      );
    }

    // Re-roll until at least one rolled candidate is not already owned.
    let candidates: string[] = [];
    for (let i = 0; i < MAX_RE_ROLLS; i++) {
      const dice4 = [rollD6(), rollD6(), rollD6(), rollD6()] as [number, number, number, number];
      const [first, second] = rollTwoSkills(category, dice4);
      const rolled = first === second ? [first] : [first, second];
      candidates = rolled;
      if (candidates.some((c) => !ownedKeys.has(skillKey(c)))) break;
      if (i === MAX_RE_ROLLS - 1) candidates = rolled;
    }
    const eligible = candidates.filter((c) => !ownedKeys.has(skillKey(c)));

    const cellFor = (name: string) => skillCellIndex(category, name);
    const c1 = eligible[0] ?? candidates[0] ?? null;
    const c2 = eligible[1] ?? null;
    if (c1 === null) {
      return NextResponse.json({ error: "No usable skill roll" }, { status: 400 });
    }
    const roll1 = cellFor(c1);
    const roll2 = c2 !== null ? cellFor(c2) : null;

    const fullCandidates = c2 !== null && c2 !== c1 ? [c1, c2] : [c1];
    await prisma.playerPendingRoll.upsert({
      where: { playerId: player.id },
      create: {
        playerId: player.id,
        kind: `random:${category}`,
        roll1: roll1 ?? 0,
        roll2,
      },
      update: {
        kind: `random:${category}`,
        roll1: roll1 ?? 0,
        roll2,
      },
    });

    return NextResponse.json({
      kind: "random",
      candidates: fullCandidates,
      cost,
      pe: player.pe,
    });
  }

  // random-pick
  if (body.type === "random-pick") {
    const pending = await prisma.playerPendingRoll.findUnique({
      where: { playerId: player.id },
    });
    if (!pending || !pending.kind.startsWith("random:")) {
      return NextResponse.json(
        { error: "This player has no pending skill roll" },
        { status: 400 },
      );
    }
    const column = pending.kind.slice("random:".length);
    if (!isSkillColumn(column)) {
      return NextResponse.json(
        { error: "Stale pending roll" },
        { status: 400 },
      );
    }
    const candidateNames = [
      cellIndexToSkill(column, pending.roll1),
      pending.roll2 != null ? cellIndexToSkill(column, pending.roll2) : null,
    ].filter((c): c is string => c !== null);
    if (!candidateNames.includes(body.selectedSkill)) {
      return NextResponse.json(
        { error: "Picked skill is not one of the pending roll candidates" },
        { status: 400 },
      );
    }
    const cost = improvementCost(improvements.length + 1, "random");
    if (player.pe < cost) {
      return NextResponse.json({ error: "Not enough PE" }, { status: 400 });
    }

    const nextSkills = [...skillsRefs, body.selectedSkill];
    const valueBonus = computeValueBonus(nextSkills.map((ref) => ({ elite: skillElite(ref) })));
    await prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { teamId_rosterPlayerId: { teamId, rosterPlayerId: playerId } },
        data: {
          pe: player.pe - cost,
          skills: nextSkills as never,
          valueBonus,
          improvements: [...improvements, { kind: "random", skill: body.selectedSkill, cost }] as never,
        },
      });
      await tx.playerPendingRoll.delete({ where: { playerId: player.id } });
    });

    return NextResponse.json({
      skill: body.selectedSkill,
      skillDisplay: skillDisplayName(body.selectedSkill),
      elite: skillElite(body.selectedSkill),
      peRemaining: player.pe - cost,
      valueBonus,
    });
  }

  // primary / secondary
  if (body.type === "primary" || body.type === "secondary") {
    const catalog = getSkillById(body.skillId);
    if (!catalog) {
      return NextResponse.json({ error: "Unknown skill" }, { status: 400 });
    }
    if (ownedKeys.has(skillKey(catalog.id))) {
      return NextResponse.json(
        { error: "The player already owns that skill" },
        { status: 400 },
      );
    }
    const letter = accessLetterForCategory(catalog.category);
    if (letter === null) {
      return NextResponse.json(
        { error: "That skill cannot be purchased as an improvement" },
        { status: 400 },
      );
    }
    const allowed =
      body.type === "primary" ? accessPrimary.includes(letter) : accessSecondary.includes(letter);
    if (!allowed) {
      return NextResponse.json(
        { error: "This player has no access to that skill category" },
        { status: 400 },
      );
    }
    const cost = improvementCost(improvements.length + 1, body.type);
    if (player.pe < cost) {
      return NextResponse.json({ error: "Not enough PE" }, { status: 400 });
    }

    const nextSkills = [...skillsRefs, catalog.id];
    const valueBonus = computeValueBonus(nextSkills.map((ref) => ({ elite: skillElite(ref) })));
    await prisma.$transaction(async (tx) => {
      await tx.player.update({
        where: { teamId_rosterPlayerId: { teamId, rosterPlayerId: playerId } },
        data: {
          pe: player.pe - cost,
          skills: nextSkills as never,
          valueBonus,
          improvements: [...improvements, { kind: body.type, skill: catalog.id, cost }] as never,
        },
      });
    });

    return NextResponse.json({
      skill: catalog.id,
      skillDisplay: skillDisplayName(catalog.id),
      elite: catalog.elite,
      peRemaining: player.pe - cost,
      valueBonus,
    });
  }

  if (body.type !== "attribute") {
    return NextResponse.json({ error: "Invalid kind" }, { status: 400 });
  }
  const attribute = body.attribute;
  if (!isAttribute(attribute)) {
    return NextResponse.json({ error: "Invalid attribute" }, { status: 400 });
  }
  const cost = improvementCost(improvements.length + 1, "attribute");
  if (player.pe < cost) {
    return NextResponse.json({ error: "Not enough PE" }, { status: 400 });
  }
  const roll8 = rollD8();
  const options = attributeOptionsForRoll(roll8);
  if (!options.includes(attribute)) {
    return NextResponse.json(
      { error: "The rolled attributes do not include that one" },
      { status: 400 },
    );
  }
  const increases =
    typeof player.attributeIncreases === "object" && player.attributeIncreases !== null
      ? (player.attributeIncreases as Record<PlayerAttribute, number>)
      : ({} as Record<PlayerAttribute, number>);
  const nextIncreases = { ...increases, [attribute]: (increases[attribute] ?? 0) + 1 };

  await prisma.$transaction(async (tx) => {
    await tx.player.update({
      where: { teamId_rosterPlayerId: { teamId, rosterPlayerId: playerId } },
      data: {
        pe: player.pe - cost,
        attributeIncreases: nextIncreases as never,
        improvements: [...improvements, { kind: "attribute", attribute, cost }] as never,
      },
    });
  });

  return NextResponse.json({
    attribute,
    peRemaining: player.pe - cost,
    attributeIncreases: nextIncreases,
  });
}
