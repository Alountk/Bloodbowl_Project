import type { ReactNode } from "react";
import { LiveEventCards } from "./liveEventCards";
import type { LiveMatchEventDto, MatchTeamDetail } from "./api";

/**
 * Live event card set (Design A, compact v3). White full-width cards over the
 * #f8fafc feed shell, read left → right: token/dorsal + who + label + optional
 * sub-lines, with the turn tag + minute as inline meta and a 3px side accent on
 * team cards (navy home / red away). Data is mock ES UI — no network, no i18n
 * provider (the repo's `useI18n` falls back to the Spanish dictionary).
 *
 * Server feed order is CHRONOLOGICAL (seq ascending); the component renders
 * newest first.
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

/** Build a chronological DTO (half 1 unless told otherwise). Minutes may be fractional. */
function ev(
  atMin: number,
  data: Ev & { turn?: number; half?: number },
): LiveMatchEventDto {
  const { turn = 1, half = 1, ...rest } = data;
  return { half, turnNumber: turn, at: BASE + atMin * MIN, ...rest };
}

const ackNoop = () => undefined;

function Feed({ events, viewerSide = "home", now = Date.now() }: { events: LiveMatchEventDto[]; viewerSide?: "home" | "away" | null; now?: number }) {
  return (
    <LiveEventCards
      events={events}
      startedAt={BASE}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      viewerSide={viewerSide}
      now={now}
      onAck={ackNoop}
    />
  );
}

/** A centered canvas panel that reads like the live-match body. */
function Panel({ children, max = "md" }: { children: ReactNode; max?: "md" | "lg" }) {
  return (
    <div className="flex justify-center bg-[#f8fafc] p-2">
      <div className={`w-full ${max === "lg" ? "max-w-2xl" : "max-w-md"}`}>{children}</div>
    </div>
  );
}

export default {
  title: "Live match/Event cards (v3)",
  component: LiveEventCards,
  parameters: {
    docs: {
      description: {
        component:
          "Tarjetas compactas del feed del partido en vivo (compact v3, mobile-first). " +
          "Cada evento = tarjeta blanca full-width sobre #f8fafc; tarjetas de equipo con acento lateral " +
          "de 3px (marino local / rojo visitante), tag de turno y minuto inline. Los datos son mock ES.",
      },
    },
  },
};

/** One full half of a narrative feed: kickoff → turn starts → plays → finish. */
export const FullFeed = {
  name: "Feed completo (narrativa 1T)",
  render: () => {
    const events: LiveMatchEventDto[] = [
      ev(0, { seq: 1, kind: "start", side: null, playerRosterId: null, payload: {} }),
      ev(1, { seq: 2, kind: "turnStart", side: "home", playerRosterId: null, turn: 1, payload: { reason: "voluntary" } }),
      ev(2, { seq: 3, kind: "completion", side: "home", playerRosterId: "k2", turn: 1, payload: {} }),
      ev(4, { seq: 4, kind: "td", side: "home", playerRosterId: "k1", turn: 2, payload: {} }),
      ev(5, { seq: 5, kind: "turnStart", side: "away", playerRosterId: null, turn: 3, payload: {} }),
      ev(7, { seq: 6, kind: "foul", side: "away", playerRosterId: "o1", turn: 3, payload: { victimRosterId: "k1" } }),
      ev(8, { seq: 7, kind: "casualty", side: "home", playerRosterId: "k3", turn: 4, payload: { cause: "crowd", roll16: 8, band: "bruise" } }),
      ev(10, { seq: 8, kind: "casualty", side: "away", playerRosterId: "o2", turn: 4, payload: { victimRosterId: "o2", causerRosterId: "k1", cause: "block", roll16: 9, band: "grave" } }),
      ev(12, { seq: 9, kind: "td", side: "away", playerRosterId: "o1", turn: 6, payload: {}, ackStatus: "ok", ackAt: BASE + 740 * MIN, ackedBy: "u1" }),
      ev(65, { seq: 10, kind: "endMatch", side: null, playerRosterId: null, turn: 8, half: 2, payload: {} }),
    ];
    return (
      <Panel max="lg">
        <Feed events={events} />
      </Panel>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "1ª parte narrada: inicio, turnos (con etiqueta de razón), pase ★1, TD local ★3 " +
          "(marcador parcial 1-0), falta visitante con línea de víctima, baja propia por el público, " +
          "Baja causada (tarjeta doble: lesión del jugador + acción derivada del causante ★2) y TD " +
          "visitante ✓ cotejado (1-1). Vista local (entrenadora del equipo local).",
      },
    },
  },
};

/** The both-down marker: the non-active coach's own block record (DEC-1). */
export const BothDownMarker = {
  name: "Baja — ambos derribados (marcador)",
  render: () => (
    <Panel>
      <Feed
        events={[
          ev(4, {
            seq: 20,
            kind: "casualty",
            side: "away",
            playerRosterId: "o2",
            turn: 5,
            payload: { victimRosterId: "o2", causerRosterId: "k1", cause: "block", roll16: 9, band: "grave", bothDown: true },
          }),
        ]}
      />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Bloqueo 'ambos derribados' anotado por la entrenadora NO activa: la tarjeta del caído " +
          "lleva el marcador '(Ambos derribados)' en la línea de causa, y el causante recibe la " +
          "tarjeta de acción derivada con su ★2.",
      },
    },
  },
};

/** Ack row states (Design B): ✓/✗ for the rival, status badges otherwise. */
export const AckStates = {
  name: "Cotejo ✓/✗ — estados",
  render: () => (
    <Panel>
      {/* Viewer = local (home): away-authored cards render ✓/✗ when pending. */}
      <Feed
        now={BASE + 5 * MIN}
        viewerSide="home"
        events={[
          // Recent (30 s ago) → the rival still gets ✓/✗ buttons.
          ev(4.5, { seq: 30, kind: "foul", side: "away", playerRosterId: "o1", turn: 3, payload: { victimRosterId: "k1" }, ackStatus: "pending" }),
          ev(3, { seq: 31, kind: "td", side: "away", playerRosterId: "o1", turn: 4, payload: {}, ackStatus: "ok", ackAt: BASE + 200 * MIN, ackedBy: "u1" }),
          ev(5, { seq: 32, kind: "completion", side: "away", playerRosterId: "o2", turn: 5, payload: {}, ackStatus: "nok", ackAt: BASE + 320 * MIN, ackedBy: "u1" }),
          // Old (5 min ago) + pending → auto-verified badge, no buttons.
          ev(0, { seq: 33, kind: "td", side: "away", playerRosterId: "o1", turn: 6, payload: {}, ackStatus: "pending" }),
        ]}
      />
    </Panel>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Diseño B: el rival marca ✓ (Correcto) o ✗ (Revisar) — informativo, nunca bloquea. " +
          "Vista local sobre eventos del visitante: pendiente reciente = botones; cotejado ok/nok = " +
          "badge; pendiente expirado (60 s) = auto-verificado sin botones.",
      },
    },
  },
};
