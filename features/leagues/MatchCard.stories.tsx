import type { ReactNode } from "react";
import { MatchCard } from "./MatchCard";
import type { FixtureDraft } from "./api";

/**
 * rulebook-style MatchCard (Design B) story set. A per-fixture card whose
 * header is "Partido N · <status>", whose body centers the RESULT (score or
 * "- : -") between the two teams (deterministic emblem + name link + race line)
 * and whose footer exposes the scheduled slot and the "Ver partido" link. Data
 * is mock ES — no network, no i18n provider (the repo's `useI18n` falls back to
 * the Spanish dictionary).
 */

const teamNameById = new Map([
  ["th", "Águilas de Khemri"],
  ["ta", "Colmillos del Caos"],
]);

const raceNameById = new Map([
  ["th", "Reyes funerarios"],
  ["ta", "Orcos"],
]);

function fixture(overrides: Partial<FixtureDraft> = {}): FixtureDraft {
  return {
    id: "f1",
    leagueId: "l1",
    round: 1,
    homeTeamId: "th",
    awayTeamId: "ta",
    createdAt: "2026-02-01",
    scheduledAt: null,
    winnerId: null,
    status: "pending",
    homeOwner: { id: "u1", name: "Susana" },
    awayOwner: { id: "u2", name: "Iván" },
    proposals: [],
    ...overrides,
  };
}

const noop = () => undefined;

/** A centered canvas panel that reads like the jornada list. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-center bg-[#f8fafc] p-2">
      <div className="w-full max-w-md">{children}</div>
    </div>
  );
}

function Card({ fixture: f, admin = false }: { fixture: FixtureDraft; admin?: boolean }) {
  return (
    <MatchCard
      fixture={f}
      teamNameById={teamNameById}
      raceNameById={raceNameById}
      currentUserId="u3"
      isLeagueOwner={admin}
      onNegotiate={noop}
      onForfeit={noop}
      onLoadResult={noop}
      onCorrectResult={noop}
    />
  );
}

export default {
  title: "Jornadas/MatchCard (Design B)",
  component: MatchCard,
  parameters: {
    docs: {
      description: {
        component:
          "Tarjeta de partido estilo rulebook (Design B): cabecera “Partido N · <estado>”, " +
          "resultado centrado (marcador o “- : -”) entre los dos equipos (emblema determinista + " +
          "nombre con enlace al scouting + línea de raza), pie con la fecha acordada y el enlace " +
          "“Ver partido”. El ganador se resalta en marino con el chip “VICTORIA” y el perdedor se " +
          "atenúa; un empate queda neutro.",
      },
    },
  },
};

export const Pendiente = {
  name: "Pendiente",
  render: () => (
    <Panel>
      <Card fixture={fixture()} />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story: "Sin fecha ni resultado: cabecera “Pendiente”, marcador central “- : -” y sin ganador.",
      },
    },
  },
};

export const Programado = {
  name: "Programado",
  render: () => (
    <Panel>
      <Card fixture={fixture({ status: "scheduled", scheduledAt: "2026-03-01T10:00:00.000Z" })} />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Fecha y hora acordadas: la cabecera dice “Programado” y el pie muestra " +
          "“Programado: DD/MM/AAAA, HH:MM”.",
      },
    },
  },
};

export const JugadoVictoriaLocal = {
  name: "Jugado — victoria local",
  render: () => (
    <Panel>
      <Card fixture={fixture({ status: "played", winnerId: "th", homeScore: 2, awayScore: 1 })} />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Resultado 2 : 1 con el local ganador: anillo marino en el emblema + chip “VICTORIA”; " +
          "el visitante se atenúa.",
      },
    },
  },
};

export const JugadoEmpate = {
  name: "Jugado — empate",
  render: () => (
    <Panel>
      <Card fixture={fixture({ status: "played", winnerId: null, homeScore: 1, awayScore: 1 })} />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story: "Empate 1 : 1: sin chip “VICTORIA” ni anillo; ambas columnas quedan neutras.",
      },
    },
  },
};

export const EnVivo = {
  name: "En vivo",
  render: () => (
    <Panel>
      <Card
        fixture={fixture({
          status: "scheduled",
          scheduledAt: "2026-03-01T10:00:00.000Z",
          live: { status: "live", homeScore: 1, awayScore: 0, half: 2, turnNumber: 5 },
        })}
      />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Partido en curso: badge “EN VIVO” pulsante + marcador en vivo (1 : 0) en rojo; el partido " +
          "en vivo es dueño del marcador (sin “Cargar resultado”).",
      },
    },
  },
};

export const VistaAdmin = {
  name: "Vista del admin",
  render: () => (
    <div className="flex flex-col gap-4 bg-[#f8fafc] p-2">
      <div className="mx-auto w-full max-w-md">
        <Card admin fixture={fixture({ status: "scheduled", scheduledAt: "2026-03-01T10:00:00.000Z" })} />
      </div>
      <div className="mx-auto w-full max-w-md">
        <Card admin fixture={fixture({ status: "played", winnerId: "th", homeScore: 2, awayScore: 1 })} />
      </div>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Dueño de liga (admin): en un partido programado ve “Cargar resultado” + “Otorgar victoria”; " +
          "en uno jugado ve “Corregir resultado”.",
      },
    },
  },
};
