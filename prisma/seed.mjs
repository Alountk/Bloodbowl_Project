/**
 * Playground seed — "Campo de pruebas" para desarrollo local.
 *
 * Crea el escenario mínimo para probar el flujo completo de la app SIN hacerlo
 * a mano: dos coaches con equipos humanos, una liga iniciada con una jornada y
 * un partido pendiente (negociación de fecha + partido en vivo).
 *
 * Uso:
 *   pnpm db:seed            # tras `pnpm db:migrate`
 *   pnpm playground         # migra + siembra + levanta el dev server
 *
 * Credenciales creadas:
 *   coach1@test.local / password123   (dueño de la liga, equipo "Campo Uno")
 *   coach2@test.local / password123   (equipo "Campo Dos")
 *
 * Idempotente: borra y recrea los datos del playground (equipos "Campo *" y la
 * liga "Campo de pruebas") — nunca toca datos creados por ti.
 */
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const PASSWORD = "password123";
const LEAGUE_NAME = "Campo de pruebas";
const TEAM_NAMES = ["Campo Uno", "Campo Dos"];
const RULESET_ID = "estandar-bb2025";

/** 11 Human Linemen con el formato de roster que sirve el server. */
function roster(prefix) {
  return Array.from({ length: 11 }, (_, i) => ({
    id: `${prefix}-${i + 1}`,
    name: `Lineman ${i + 1}`,
    positionalKey: "lineman",
  }));
}

const COACHING = { rerolls: 0, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false };

async function main() {
  const passwordHash = await bcrypt.hash(PASSWORD, 4);

  // 1. Coaches (upsert por email).
  const coach1 = await prisma.user.upsert({
    where: { email: "coach1@test.local" },
    update: { name: "Coach Uno" },
    create: { email: "coach1@test.local", name: "Coach Uno", passwordHash },
  });
  const coach2 = await prisma.user.upsert({
    where: { email: "coach2@test.local" },
    update: { name: "Coach Dos" },
    create: { email: "coach2@test.local", name: "Coach Dos", passwordHash },
  });

  // 2. Limpieza idempotente del playground anterior.
  const existingLeague = await prisma.league.findUnique({ where: { name: LEAGUE_NAME } });
  if (existingLeague) {
    await prisma.fixture.deleteMany({ where: { leagueId: existingLeague.id } });
    await prisma.league.delete({ where: { id: existingLeague.id } });
  }
  await prisma.team.deleteMany({ where: { name: { in: TEAM_NAMES } } });

  // 3. Ruleset estándar (se siembra en la migración; defensivo si faltara).
  let ruleset = await prisma.ruleset.findUnique({ where: { id: RULESET_ID } });
  if (!ruleset) {
    ruleset = await prisma.ruleset.create({
      data: {
        id: RULESET_ID,
        name: "Estándar BB2025",
        description: "Reglas estándar de Blood Bowl 2025 (seed del playground).",
        races: ["human"],
        startingTreasury: 1000000,
        minPlayers: 11,
        maxPlayers: 16,
      },
    });
  }

  // 4. Equipos (11 jugadores, tesorería 1M, sin liga asignada aún).
  const team1 = await prisma.team.create({
    data: {
      userId: coach1.id,
      name: TEAM_NAMES[0],
      raceId: "human",
      roster: roster("c1"),
      coaching: COACHING,
      startingTreasury: ruleset.startingTreasury,
    },
  });
  const team2 = await prisma.team.create({
    data: {
      userId: coach2.id,
      name: TEAM_NAMES[1],
      raceId: "human",
      roster: roster("c2"),
      coaching: COACHING,
      startingTreasury: ruleset.startingTreasury,
    },
  });

  // 5. Liga iniciada con UNA jornada (1 fixture pendiente: Campo Uno vs Campo Dos).
  const league = await prisma.league.create({
    data: {
      name: LEAGUE_NAME,
      description: "Playground: partido pendiente para negociar fecha y jugar en vivo.",
      ownerId: coach1.id,
      rulesetId: ruleset.id,
      status: "started",
      seasonLength: 1,
      startedAt: new Date(),
      teams: { connect: [{ id: team1.id }, { id: team2.id }] },
    },
  });
  await prisma.fixture.create({
    data: {
      leagueId: league.id,
      round: 1,
      homeTeamId: team1.id,
      awayTeamId: team2.id,
    },
  });

  console.log("==============================================");
  console.log(" Campo de pruebas listo");
  console.log("----------------------------------------------");
  console.log(` Liga:    ${LEAGUE_NAME} (iniciada, jornada 1 pendiente)`);
  console.log(` Coach 1: coach1@test.local / ${PASSWORD}  -> ${TEAM_NAMES[0]} (dueño)`);
  console.log(` Coach 2: coach2@test.local / ${PASSWORD}  -> ${TEAM_NAMES[1]}`);
  console.log(" Abre la liga en /leagues y negocia la fecha o inicia el partido.");
  console.log(" Para el partido en vivo usa dos navegadores (uno por coach).");
  console.log("==============================================");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
