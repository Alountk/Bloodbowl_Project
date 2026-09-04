import type { ReactNode } from "react";
import { StandingsTable } from "./StandingsTable";
import type { FixtureDraft, LeagueMemberTeam } from "./api";

/**
 * StandingsTable (RAU-40 UI) story set: the 3/1/0 classification computed by
 * the same pure `computeStandings` the season-close logic uses, over three mock
 * teams (Reavers/human, Orcs/orc, Zombies/necromantic). Spanish copy via the
 * repo's provider-less `useI18n` fallback. Data is mock ES — no network.
 */

const TEAMS: LeagueMemberTeam[] = [
  { id: "t1", name: "Reavers", raceId: "human", leagueId: "l1", userId: "u1", roster: [], coaching: null },
  { id: "t2", name: "Orcs", raceId: "orc", leagueId: "l1", userId: "u2", roster: [], coaching: null },
  { id: "t3", name: "Zombies", raceId: "necromantic", leagueId: "l1", userId: "u3", roster: [], coaching: null },
];

function fixture(overrides: Partial<FixtureDraft> = {}): FixtureDraft {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "t1",
    awayTeamId: "t2",
    createdAt: "2026-02-01",
    scheduledAt: null,
    winnerId: null,
    status: "pending",
    homeOwner: { id: "u1", name: "raul" },
    awayOwner: { id: "u2", name: "maria" },
    proposals: [],
    ...overrides,
  };
}

/** The played set that yields Zombies first on TD diff (mirrors the test). */
const playedFixtures: FixtureDraft[] = [
  fixture({ id: "f1", round: 1, homeTeamId: "t1", awayTeamId: "t2", homeScore: 2, awayScore: 1, winnerId: "t1", status: "played" }),
  fixture({ id: "f2", round: 2, homeTeamId: "t3", awayTeamId: "t1", homeScore: 1, awayScore: 1, winnerId: null, status: "played" }),
  fixture({ id: "f3", round: 2, homeTeamId: "t2", awayTeamId: "t3", homeScore: 0, awayScore: 3, winnerId: "t3", status: "played" }),
];

function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-center bg-[#f8fafc] p-2">
      <div className="w-full max-w-2xl">{children}</div>
    </div>
  );
}

export default {
  title: "Jornadas/Clasificación (StandingsTable)",
  component: StandingsTable,
  parameters: {
    docs: {
      description: {
        component:
          "Tabla de clasificación (RAU-40): puntos 3/1/0 + cadena de desempate aprobada " +
          "(puntos → diferencia de TD → TD a favor → enfrentamiento directo → id), calculada por el " +
          "mismo `computeStandings` puro que usa el cierre de temporada. Fila dorada para el campeón " +
          "almacenado; estado vacío cuando ningún partido tiene marcador.",
      },
    },
  },
};

export const TablaCompleta = {
  name: "Tabla completa (3/1/0 + desempates)",
  render: () => (
    <Panel>
      <StandingsTable teams={TEAMS} fixtures={playedFixtures} />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Zombies primero por diferencia de TD (+3), Reavers segundo (+1, mismos 4 puntos), " +
          "Orcs tercero (−4, 0 puntos). El desempate por diferencia de TD decide entre los dos líderes.",
      },
    },
  },
};

export const Campeon = {
  name: "Campeón (dorado)",
  render: () => (
    <Panel>
      <StandingsTable teams={TEAMS} fixtures={playedFixtures} championTeamId="t3" />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Liga terminada con Zombies campeón: la fila del campeón almacenado se resalta en dorado, " +
          "independiente del líder calculado.",
      },
    },
  },
};

export const Vacia = {
  name: "Vacía",
  render: () => (
    <Panel>
      <StandingsTable
        teams={TEAMS}
        fixtures={[fixture({ status: "scheduled", scheduledAt: "2026-02-05", homeScore: null, awayScore: null })]}
      />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Sin partidos con marcador: estado vacío “Aún no hay resultados.” (la tabla no se renderiza).",
      },
    },
  },
};
