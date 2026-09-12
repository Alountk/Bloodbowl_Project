import type { ReactNode } from "react";
import { LiveEventCardsActa } from "./eventCardActa";
import type { LiveMatchEventDto, MatchTeamDetail } from "./api";

/**
 * v4 "Acta" event cards: data-sheet style cards over the crema feed shell,
 * newest first, with the important values bolded. Data is mock ES UI — no
 * network, no i18n provider (the repo's `useI18n` falls back to the Spanish
 * dictionary). The mock teams + `ev()` builder mirror
 * `liveEventCards.stories.tsx`.
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

function Feed({
  events,
  now = Date.now(),
}: {
  events: LiveMatchEventDto[];
  now?: number;
}) {
  return (
    <LiveEventCardsActa
      events={events}
      startedAt={BASE}
      homeTeam={homeTeam}
      awayTeam={awayTeam}
      now={now}
    />
  );
}

/** A centered canvas panel that reads like the live-match body. */
function Panel({ children }: { children: ReactNode }) {
  return (
    <div className="flex justify-center bg-background p-2">
      <div className="w-full max-w-lg">{children}</div>
    </div>
  );
}

export default {
  title: "Event Cards/V4 · Acta",
  component: LiveEventCardsActa,
  parameters: {
    docs: {
      description: {
        component:
          "Tarjetas 'Acta' (v4) del feed del partido en vivo. Ficha de datos: cabecera tag/meta, " +
          "nombre serif + dorsal, línea de posición y lista de datos con puntos guía. Los valores " +
          "importantes van en negrita. Datos mock ES, sin red ni proveedor de i18n.",
      },
    },
  },
};

/** One full half of a narrative feed: kickoff → turn starts → plays → finish. */
export const FeedCompleto = {
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
      <Panel>
        <Feed events={events} />
      </Panel>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "1ª parte narrada: inicio (hora), turnos (con motivo), pase ★1, TD local ★3 (marcador 1-0), " +
          "falta visitante con víctima, Herida propia por el público, Baja causada (doble ficha: lesión " +
          "de la víctima + acción del causante ★2), TD visitante ✓ cotejado (1-1) y fin del partido.",
      },
    },
  },
};

/** One card per family/kind, stacked. */
export const TodasLasFamilias = {
  name: "Todas las familias",
  render: () => {
    const events: LiveMatchEventDto[] = [
      ev(0, { seq: 1, kind: "start", side: null, playerRosterId: null, payload: {} }),
      ev(1, { seq: 2, kind: "turnStart", side: "home", playerRosterId: null, turn: 1, payload: { reason: "turnover" } }),
      ev(2, { seq: 3, kind: "completion", side: "home", playerRosterId: "k2", turn: 2, payload: {} }),
      ev(3, { seq: 4, kind: "td", side: "home", playerRosterId: "k1", turn: 3, payload: {} }),
      ev(4, { seq: 5, kind: "foul", side: "away", playerRosterId: "o1", turn: 3, payload: { victimRosterId: "k1" } }),
      ev(5, { seq: 6, kind: "casualty", side: "away", playerRosterId: "o2", turn: 4, payload: { victimRosterId: "o2", causerRosterId: "k1", cause: "block", roll16: 9, band: "grave" } }),
      ev(6, { seq: 7, kind: "mvp", side: "home", playerRosterId: "k1", turn: 8, payload: {} }),
      ev(7, { seq: 8, kind: "journeyman", side: "home", playerRosterId: null, turn: 6, payload: { names: ["Tik-Tak"] } }),
      ev(8, { seq: 9, kind: "expensive_mistake", side: "home", playerRosterId: null, turn: 1, payload: { outcome: "serious-incident", treasuryBefore: 234000, treasuryAfter: 214000 } }),
      ev(9, { seq: 10, kind: "fan_factor", side: null, playerRosterId: null, turn: 1, payload: { home: { base: 2, dice: 2, total: 4 }, away: { base: 1, dice: 3, total: 4 } } }),
      ev(30, { seq: 11, kind: "endHalf", side: null, playerRosterId: null, turn: 8, payload: {} }),
      ev(65, { seq: 12, kind: "endMatch", side: null, playerRosterId: null, turn: 8, half: 2, payload: {} }),
      ev(66, { seq: 13, kind: "concede", side: "away", playerRosterId: null, turn: 5, half: 2, payload: { winnerSide: "home" } }),
    ];
    return (
      <Panel>
        <Feed events={events} />
      </Panel>
    );
  },
  parameters: {
    docs: {
      description: {
        story:
          "Una ficha por familia/tipo: sistema (inicio, fin de mitad, fin, concesión, factor de " +
          "aficionados), equipo (inicio de turno, novato, error costoso) y jugador (pase, TD, falta, " +
          "baja con acción derivada, MVP).",
      },
    },
  },
};

/** Ack row states (Design B): ✓/✗ for the rival, status badges otherwise. */
export const Cotejo = {
  name: "Cotejo ✓/✗ — estados",
  render: () => (
    <Panel>
      {/* The user's ✓/✗ cotejo is DISABLED: only the status badge renders. */}
      <Feed
        now={BASE + 5 * MIN}
        events={[
          // Recent (30 s ago) → still pending (the auto-verify timeout has not elapsed).
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
