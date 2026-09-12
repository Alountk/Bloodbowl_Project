import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { I18nProvider } from "@/lib/i18n";
import { MatchView } from "./MatchView";
import type {
  LeagueDetail,
  LiveMatchEventDto,
  LiveMatchView,
  MatchDetail,
  MatchTeamDetail,
} from "./api";

/**
 * Live-match view stories. `MatchView` renders the v4 "Acta" production feed and
 * reads `useSession`, `useI18n`, the fixture GET and the league GET — so every
 * story mounts the same provider stack with a FAKE session, and stubs `fetch` +
 * `EventSource` so the page renders its snapshot without a server or SSE stream.
 *
 * The fetch stub is installed DURING the first render (before MatchView's mount
 * effect fires) and restored on unmount: the hook's first `getMatchDetail` /
 * `getLeagueDetail` call must already see it. The no-op `EventSource` keeps
 * `useLiveMatch` from opening a stream that does not exist in Storybook (no
 * network noise, no bogus error state) — the story renders the mocked snapshot.
 *
 * The mock `MatchDetail` / `LiveMatchView` / team shapes mirror
 * `designLock.test.tsx`.
 */

// --- fetch + EventSource stubs (captured once so restore is idempotent) ------

const realFetch = typeof window !== "undefined" ? window.fetch : undefined;
const RealEventSource = typeof window !== "undefined" ? window.EventSource : undefined;

/** A minimal `Response`-shaped object carrying a JSON body (readJson contract). */
function jsonResponse(body: unknown): Promise<Response> {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve(body),
  } as Response);
}

/** A no-op `EventSource`: it opens nothing and never dispatches a frame. */
class NoopEventSource {
  onopen: (() => void) | null = null;
  onerror: ((event: unknown) => void) | null = null;
  addEventListener(): void {}
  removeEventListener(): void {}
  close(): void {}
}

/** Routes the fixture GET and the league GET to the mocked detail objects. */
function installStubs(detail: MatchDetail, league: LeagueDetail): void {
  if (typeof window === "undefined") return;
  window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
    const url =
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (url.includes("/fixtures/")) return jsonResponse(detail);
    if (url.includes("/api/leagues/")) return jsonResponse(league);
    return realFetch ? realFetch(input, init) : jsonResponse({});
  };
  (window as unknown as { EventSource: unknown }).EventSource = NoopEventSource;
}

function restoreStubs(): void {
  if (typeof window === "undefined") return;
  if (realFetch) window.fetch = realFetch;
  if (RealEventSource) (window as unknown as { EventSource: unknown }).EventSource = RealEventSource;
}

// --- mock data --------------------------------------------------------------

const SESSION: Session = {
  user: { id: "u1", name: "Coach A", email: "coach.a@example.com", role: "user" },
  expires: "2099-01-01T00:00:00.000Z",
};

function player(id: string, name: string, positionalKey = "blitzer") {
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
  };
}

const homeTeam: MatchTeamDetail = {
  id: "t1",
  name: "Reavers",
  raceId: "human",
  user: { id: "u1", name: "Coach A", email: null },
  players: [player("p1", "Blitzer A"), player("p4", "Arnau", "thrower")],
};

const awayTeam: MatchTeamDetail = {
  id: "t2",
  name: "Dwarves",
  raceId: "dwarf",
  user: { id: "u2", name: "Coach B", email: null },
  players: [player("p2", "Blitzer B"), player("p8", "Trash", "blocker")],
};

/** The minimal league detail `useLeague` reads (name + owner + status). */
const league: LeagueDetail = {
  id: "l1",
  name: "Liga de Prueba",
  description: null,
  ownerId: "u1",
  createdAt: "2026-02-01",
  status: "started",
  seasonLength: 1,
  startedAt: "2026-02-01",
  championTeamId: null,
  ownerName: "Coach A",
  memberCount: 2,
  isMember: true,
  turnClockEnabled: false,
  turnClockSeconds: 120,
  rulesetId: null,
  rulesetName: null,
  teams: [],
  fixtures: [],
  rounds: [],
};

function ev(
  seq: number,
  kind: string,
  side: "home" | "away" | null,
  payload: Record<string, unknown> = {},
  playerRosterId: string | null = null,
  turnNumber = 1,
  at = 1000,
): LiveMatchEventDto {
  return { seq, kind, side, playerRosterId, half: 1, turnNumber, payload, at };
}

/** The per-side resolution wizard cursor shared by the mock live views. */
function resolutionState(): LiveMatchView["resolutionState"] {
  const side = {
    step: "winnings" as const,
    fansDone: false,
    fans: null,
    mvpConfirmed: false,
    mvpRolled: false,
    casualtiesDone: false,
    journeymenDone: false,
  };
  return { home: { ...side }, away: { ...side } };
}

/** A LIVE match carrying one event per family, including a caused casualty. */
function liveMatch(): LiveMatchView {
  return {
    seq: 6,
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    viewerSide: "home",
    startedAt: 1000,
    elapsed: 2100,
    homeTurnMs: 2100,
    awayTurnMs: 0,
    homeScore: 1,
    awayScore: 0,
    paused: false,
    finishedAt: null,
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null },
    resolutionState: resolutionState(),
    events: [
      ev(1, "start", null, {}, null, 1, 1000),
      ev(2, "turnStart", "home", { reason: "voluntary" }, null, 1, 61_000),
      ev(3, "completion", "home", {}, "p4", 1, 121_000),
      ev(4, "td", "home", {}, "p1", 2, 181_000),
      ev(5, "foul", "home", { victimRosterId: "p8" }, "p1", 2, 241_000),
      ev(
        6,
        "casualty",
        "away",
        { victimRosterId: "p2", causerRosterId: "p4", cause: "block", roll16: 9, band: "permanent" },
        "p2",
        3,
        301_000,
      ),
    ],
  };
}

/** A FINISHED match with the final score and the persisted timeline. */
function finishedLive(): LiveMatchView {
  return {
    seq: 12,
    status: "finished",
    half: 2,
    turnNumber: 8,
    activeSide: "away",
    homeConsented: true,
    awayConsented: true,
    viewerSide: null,
    startedAt: 1000,
    elapsed: 3100,
    homeTurnMs: 1500,
    awayTurnMs: 1600,
    homeScore: 2,
    awayScore: 1,
    paused: false,
    finishedAt: 5000,
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null },
    resolutionState: resolutionState(),
    events: [
      ev(1, "start", null, {}, null, 1, 1000),
      ev(5, "td", "home", {}, "p1", 3, 2000),
      ev(9, "casualty", "away", { band: "grave" }, "p2", 6, 3000),
      ev(10, "endMatch", null, {}, null, 8, 4000),
    ],
  };
}

/** Wraps a live view in the fixture/result/roster envelope MatchView expects. */
function fixtureDetail(live: LiveMatchView): MatchDetail {
  return {
    fixture: {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: "2026-02-01",
      scheduledAt: "2026-03-01T20:00:00",
      winnerId: null,
      homeScore: live.status === "finished" ? live.homeScore : null,
      awayScore: live.status === "finished" ? live.awayScore : null,
      status: live.status === "finished" ? "played" : "scheduled",
      homeOwner: { id: "u1", name: "Coach A" },
      awayOwner: { id: "u2", name: "Coach B" },
      proposals: [],
    },
    result: null,
    homeTeam,
    awayTeam,
    live,
    liveWinnings: null,
  };
}

/** A scheduled fixture with NO live row yet (the consent-start state). */
function scheduledDetail(): MatchDetail {
  return { ...fixtureDetail(liveMatch()), live: null, liveWinnings: null, result: null };
}

// --- provider + stub shell --------------------------------------------------

function StoryShell({
  session,
  detail,
  leagueDetail,
  children,
}: {
  session: Session;
  detail: MatchDetail;
  leagueDetail: LeagueDetail;
  children: ReactNode;
}) {
  // Install the stubs during the FIRST render: MatchView's mount effect runs
  // after this component's render, so the first fixture/league fetch already
  // sees the mock. A parent useEffect would be too late (child effects run
  // before the parent's).
  useState(() => {
    installStubs(detail, leagueDetail);
    return null;
  });
  // Restore the real globals when the story unmounts.
  useEffect(() => () => restoreStubs(), []);

  return (
    <SessionProvider session={session}>
      <I18nProvider initialLocale="es">{children}</I18nProvider>
    </SessionProvider>
  );
}

export default {
  title: "Live match/MatchView",
  component: MatchView,
  parameters: {
    docs: {
      description: {
        component:
          "Live-match view rendering the v4 Acta feed. Every story mounts a fake " +
          "session, an ES i18n provider and a fetch/EventSource stub so the page " +
          "renders from a mocked fixture snapshot (no server, no SSE stream).",
      },
    },
  },
};

export const EnVivo = {
  name: "En vivo",
  render: () => (
    <StoryShell session={SESSION} detail={fixtureDetail(liveMatch())} leagueDetail={league}>
      <MatchView leagueId="l1" fixtureId="f1" />
    </StoryShell>
  ),
};

export const Finalizado = {
  name: "Finalizado",
  render: () => (
    <StoryShell session={SESSION} detail={fixtureDetail(finishedLive())} leagueDetail={league}>
      <MatchView leagueId="l1" fixtureId="f1" />
    </StoryShell>
  ),
};

export const Programado = {
  name: "Programado",
  render: () => (
    <StoryShell session={SESSION} detail={scheduledDetail()} leagueDetail={league}>
      <MatchView leagueId="l1" fixtureId="f1" />
    </StoryShell>
  ),
};
