import type {
  LiveMatchEventDto,
  LiveMatchViewState,
  MatchDetail,
  MatchPlayer,
  MatchTeamDetail,
  ResolutionSideState,
} from "./api";
import type { ActaClosureViewer } from "./actaClosure";
import type { LeagueAccess } from "./useLeagueName";

/**
 * Mock builders shared by the "Acta en vivo" flow stories (Storybook only).
 * Plain typed objects over the `./api` types — no network, no i18n provider
 * (the repo's `useI18n` falls back to the Spanish dictionary). The team /
 * `ev()` style mirrors `eventCardActa.stories.tsx`, factored here because four
 * stories compose the same match.
 */

export function player(
  id: string,
  name: string,
  positionalKey: string,
  extras: Partial<MatchPlayer> = {},
): MatchPlayer {
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

export const homeTeam: MatchTeamDetail = {
  id: "team-khemri",
  name: "Águilas de Khemri",
  raceId: "tomb-kings",
  user: { id: "u1", name: "Entrenadora Susana", email: null },
  players: [
    player("k1", "Khalid el Impávido", "blitz-ra"),
    player("k2", "Ushtep el Mensajero", "thro-ra"),
    player("k3", "Neb el Silencioso", "skeleton-lineman"),
    player("k4", "Amarath Guardián", "tomb-royal-guard"),
    player("k5", "Sefu el Veloz", "skeleton-lineman"),
    player("k6", "Khetra la Inmortal", "blitz-ra", { journeyman: true }),
  ],
};

export const awayTeam: MatchTeamDetail = {
  id: "team-colmillos",
  name: "Colmillos del Caos",
  raceId: "orc",
  user: { id: "u2", name: "Entrenador Iván", email: null },
  players: [
    player("o1", "Grishnak Mordaz", "blitzer"),
    player("o2", "Durburz Puño de Hierro", "big-un-blocker"),
    player("o3", "Morkok el Carnicero", "lineman"),
    player("o4", "Wurrzag Colmillo Negro", "thrower"),
    player("o5", "Ugluk el Terco", "lineman"),
  ],
};

/** Kickoff anchor: 2026-09-04 20:00 UTC (the fixture's wall clock). */
export const BASE = Date.UTC(2026, 8, 4, 20, 0, 0);
export const MIN = 60_000;

type Ev = Omit<LiveMatchEventDto, "at" | "turnNumber" | "half">;

/** Build a chronological event DTO (half 1 / turn 1 unless told otherwise). */
export function ev(
  atMin: number,
  data: Ev & { turn?: number; half?: number },
): LiveMatchEventDto {
  const { turn = 1, half = 1, ...rest } = data;
  return { half, turnNumber: turn, at: BASE + atMin * MIN, ...rest };
}

function sideState(): ResolutionSideState {
  return {
    step: "winnings",
    fansDone: false,
    fans: null,
    mvpConfirmed: false,
    mvpRolled: false,
    casualtiesDone: false,
    journeymenDone: false,
  };
}

/** Mid-game live state (2T, turno 3; the viewer coaches "home"). */
export function liveState(
  overrides: Partial<LiveMatchViewState> = {},
): LiveMatchViewState {
  return {
    seq: 14,
    status: "live",
    half: 2,
    turnNumber: 3,
    activeSide: "away",
    homeConsented: true,
    awayConsented: true,
    viewerSide: "home",
    startedAt: BASE,
    elapsed: 58 * MIN,
    homeTurnMs: 30 * MIN,
    awayTurnMs: 28 * MIN,
    paused: false,
    homeScore: 2,
    awayScore: 1,
    finishedAt: null,
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null },
    resolutionState: { home: sideState(), away: sideState() },
    lastTurnReason: "voluntary",
    ...overrides,
  };
}

/** A narrative feed: kickoff → jugadas → TDs → bajas → 2T. */
export const narrativeEvents: LiveMatchEventDto[] = [
  ev(0, { seq: 1, kind: "start", side: null, playerRosterId: null, payload: {} }),
  ev(0, { seq: 2, kind: "weather", side: null, playerRosterId: null, payload: { value: "sun", roll: 4 } }),
  ev(0, {
    seq: 3,
    kind: "fan_factor",
    side: null,
    playerRosterId: null,
    turn: 1,
    payload: { home: { base: 4, dice: 3, total: 7 }, away: { base: 3, dice: 2, total: 5 } },
  }),
  ev(2, {
    seq: 4,
    kind: "turnStart",
    side: "home",
    playerRosterId: null,
    turn: 1,
    payload: { reason: "voluntary" },
  }),
  ev(6, { seq: 5, kind: "completion", side: "home", playerRosterId: "k2", turn: 1, payload: {} }),
  ev(9, {
    seq: 6,
    kind: "turnStart",
    side: "away",
    playerRosterId: null,
    turn: 1,
    payload: { reason: "turnover" },
  }),
  ev(14, {
    seq: 7,
    kind: "casualty",
    side: "away",
    playerRosterId: "k5",
    turn: 1,
    payload: { victimRosterId: "k5", causerRosterId: "o1", cause: "block", roll16: 13, roll6: 3 },
  }),
  ev(18, {
    seq: 8,
    kind: "turnStart",
    side: "home",
    playerRosterId: null,
    turn: 2,
    payload: { reason: "voluntary" },
  }),
  ev(23, { seq: 9, kind: "td", side: "home", playerRosterId: "k3", turn: 2, payload: {} }),
  ev(31, { seq: 10, kind: "td", side: "away", playerRosterId: "o1", turn: 2, payload: {} }),
  ev(38, {
    seq: 11,
    kind: "turnStart",
    side: "home",
    playerRosterId: null,
    half: 2,
    turn: 1,
    payload: { reason: "voluntary" },
  }),
  ev(47, {
    seq: 12,
    kind: "foul",
    side: "home",
    playerRosterId: "k1",
    half: 2,
    turn: 2,
    payload: { victimRosterId: "o2" },
  }),
  ev(52, {
    seq: 13,
    kind: "casualty",
    side: "home",
    playerRosterId: "o2",
    half: 2,
    turn: 2,
    payload: { victimRosterId: "o2", causerRosterId: "k1", cause: "foul", roll16: 6 },
  }),
  ev(56, {
    seq: 14,
    kind: "turnStart",
    side: "away",
    playerRosterId: null,
    half: 2,
    turn: 3,
    payload: { reason: "injury" },
  }),
];

/** The fixture shell every story renders against (scheduled, owners resolved). */
export function matchDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    fixture: {
      id: "fx-story-1",
      leagueId: "lg-story",
      round: 3,
      homeTeamId: homeTeam.id,
      awayTeamId: awayTeam.id,
      createdAt: new Date(BASE - 72 * MIN).toISOString(),
      scheduledAt: new Date(BASE).toISOString(),
      winnerId: null,
      status: "scheduled",
      homeOwner: { id: "u1", name: "Entrenadora Susana" },
      awayOwner: { id: "u2", name: "Entrenador Iván" },
      proposals: [],
    },
    result: null,
    homeTeam,
    awayTeam,
    live: { ...liveState(), events: narrativeEvents },
    liveWinnings: null,
    ...overrides,
  };
}

/** A persisted result snapshot for the "already reported" closure variant. */
export function resultSnapshot(): MatchDetail["result"] {
  return {
    id: "res-story-1",
    fixtureId: "fx-story-1",
    weather: "sun",
    pettyCash: 0,
    loadedBy: "u1",
    createdAt: new Date(BASE + 95 * MIN).toISOString(),
    scores: {
      home: { score: 2, casualties: [], pe: [] },
      away: { score: 1, casualties: [], pe: [] },
      winnerId: homeTeam.id,
    },
  };
}

export const league: LeagueAccess = {
  name: "Liga de Ejemplo",
  ownerId: "u1",
  teamRerolls: { [homeTeam.id]: 3, [awayTeam.id]: 2 },
};

/** Session snapshot matching `homeOwner` — the closure guard's participant. */
export const viewer: ActaClosureViewer = { id: "u1", role: "member" };
