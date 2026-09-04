import type { ReactNode } from "react";
import { MatchTimelineBar } from "./matchTimelineBar";
import type { LiveMatchEventDto, MatchTeamDetail } from "./api";

/**
 * MatchTimelineBar (v7) story set: the sticky-header horizontal timeline bar —
 * one icon per display event (td/completion/casualty/foul/mvp) positioned by
 * `timelinePercent`, home events on the top lane, away on the bottom, plus the
 * always-on mid start/end markers with their minute labels. Returns null before
 * kickoff (no `startedAt`) or with an empty feed. Data is mock ES — no network.
 */

function player(
  id: string,
  name: string,
  positionalKey: string,
  extras: Partial<MatchTeamDetail["players"][number]> = {},
) {
  return {
    rosterPlayerId: id,
    name,
    positionalKey,
    pe: 0,
    skills: {},
    injuries: {},
    alive: true,
    missNextMatch: false,
    valueBonus: 0,
    ...extras,
  };
}

const homeTeam: MatchTeamDetail = {
  id: "team-khemri",
  name: "Águilas de Khemri",
  raceId: "tomb-kings",
  user: { id: "u1", name: "Entrenadora Susana", email: null },
  players: [
    player("k1", "Khalid el Impávido", "blitz-ra"),
    player("k2", "Ushtep el Mensajero", "thro-ra"),
    player("k3", "Neb el Silencioso", "skeleton-lineman"),
  ],
};

const awayTeam: MatchTeamDetail = {
  id: "team-colmillos",
  name: "Colmillos del Caos",
  raceId: "orc",
  user: { id: "u2", name: "Entrenador Iván", email: null },
  players: [
    player("o1", "Grishnak Mordaz", "blitzer"),
    player("o2", "Durburz Puño de Hierro", "big-un-blocker"),
    player("o3", "Morkok el Carnicero", "lineman"),
  ],
};

/** Kickoff anchor: today at 20:00 (the fixture's real wall clock). */
const BASE = Date.UTC(2026, 8, 4, 20, 0, 0);
const MIN = 60_000;

type Ev = Omit<LiveMatchEventDto, "at" | "turnNumber" | "half">;

/** Build a chronological DTO (half 1 unless told otherwise). */
function ev(
  atMin: number,
  data: Ev & { turn?: number; half?: number },
): LiveMatchEventDto {
  const { turn = 1, half = 1, ...rest } = data;
  return { half, turnNumber: turn, at: BASE + atMin * MIN, ...rest };
}

/** A full narrative: kickoff → td home → casualty away → foul → td away → end. */
const narrative: LiveMatchEventDto[] = [
  ev(0, { seq: 1, kind: "start", side: null, playerRosterId: null, payload: {} }),
  ev(4, { seq: 2, kind: "td", side: "home", playerRosterId: "k1", turn: 2, payload: {} }),
  ev(9, { seq: 3, kind: "casualty", side: "away", playerRosterId: "o2", turn: 3, payload: { victimRosterId: "o2", causerRosterId: "k1", cause: "block", roll16: 9, band: "grave" } }),
  ev(15, { seq: 4, kind: "foul", side: "away", playerRosterId: "o1", turn: 4, payload: { victimRosterId: "k1" } }),
  ev(22, { seq: 5, kind: "td", side: "away", playerRosterId: "o1", turn: 6, payload: {} }),
  ev(60, { seq: 6, kind: "endMatch", side: null, playerRosterId: null, turn: 8, half: 2, payload: {} }),
];

/** A white card wrapper so the full-bleed bar has a visible boundary. */
function Panel({ children, label }: { children: ReactNode; label?: string }) {
  return (
    <div className="flex justify-center bg-[#f8fafc] p-2">
      <div className="w-full max-w-2xl rounded border border-[#e2e8f0] bg-white p-3">
        {label ? <p className="mb-2 text-xs font-semibold text-[#64748b]">{label}</p> : null}
        {children}
      </div>
    </div>
  );
}

export default {
  title: "Live match/Timeline bar (v7)",
  component: MatchTimelineBar,
  parameters: {
    docs: {
      description: {
        component:
          "Barra de línea de tiempo horizontal (v7): un icono por evento de marcador " +
          "(td/completion/casualty/foul/mvp) posicionado por `timelinePercent`, eventos locales " +
          "arriba y visitantes abajo, más los marcadores fijos de inicio (temporizador 0') y fin " +
          "(bandera, minuto final). Devuelve null antes del saque o con feed vacío.",
      },
    },
  },
};

export const BarraCompleta = {
  name: "Barra completa",
  render: () => (
    <Panel label="Inicio → TD local → baja visitante → falta → TD visitante → fin">
      <MatchTimelineBar
        events={narrative}
        startedAt={BASE}
        finishedAt={null}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Narrativa completa: el fin de la barra cae en el último evento de marcador (TD visitante, " +
          "minuto 22), así que la etiqueta final es 22'.",
      },
    },
  },
};

export const SoloInicio = {
  name: "Solo inicio",
  render: () => (
    <Panel label="Solo el evento de inicio">
      <MatchTimelineBar
        events={[ev(0, { seq: 1, kind: "start", side: null, playerRosterId: null, payload: {} })]}
        startedAt={BASE}
        finishedAt={null}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Con solo el evento de inicio la barra aún se renderiza: marcadores 0'/0' + chips de inicio " +
          "y fin, sin iconos de evento.",
      },
    },
  },
};

export const PartidoTerminado = {
  name: "Partido terminado",
  render: () => (
    <Panel label="finishedAt en el minuto 75">
      <MatchTimelineBar
        events={narrative}
        startedAt={BASE}
        finishedAt={BASE + 75 * MIN}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "`finishedAt` establecido (minuto 75): la etiqueta final refleja 75' y los eventos se " +
          "posicionan sobre ese fin.",
      },
    },
  },
};
