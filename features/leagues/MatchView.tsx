"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { PE_MVP } from "@/lib/rules";
import { getRaceById } from "@/features/teams/data/races";
import { deriveMinute, turnTag, deriveTeamStats, playerRef, type TeamStats } from "@/lib/liveFeed";
import { getMatchDetail, type LiveMatchView, type LiveMatchViewState, type LiveCommand, type MatchDetail, type MatchTeamDetail } from "./api";
import { buildMatchSummary, type MatchSummarySection } from "./matchSummary";
import { liveEventLabel, eventSpp } from "./liveEventLabels";
import { EventControls } from "./liveControls";
import { TeamEmblem } from "./TeamEmblem";
import { useLiveMatch } from "./useLiveMatch";
import { useLiveClock, type DisplayClock } from "./useLiveClock";
import { useLeagueName } from "./useLeagueName";

/**
 * Internal single-match fetch hook mirroring `useLeagueDetail`: loads the match
 * detail and flags `notFound` on a 404 so the view collapses to the not-found
 * panel (D2, matches LeagueDetail). Cancelled-flag guards late setState.
 */
function useMatchDetail(leagueId: string, fixtureId: string) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const match = await getMatchDetail(leagueId, fixtureId);
      setDetail(match);
      setError(null);
      setNotFound(false);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setError(e instanceof Error ? e.message : "No se pudo cargar el partido.");
      }
    } finally {
      setLoading(false);
    }
  }, [leagueId, fixtureId]);

  useEffect(() => {
    let cancelled = false;
    getMatchDetail(leagueId, fixtureId)
      .then((match) => {
        if (!cancelled) setDetail(match);
      })
      .catch((e) => {
        if (cancelled) return;
        const status = (e as { status?: number }).status;
        if (status === 404) {
          setNotFound(true);
        } else {
          setError(e instanceof Error ? e.message : "No se pudo cargar el partido.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, fixtureId]);

  return { detail, loading, error, notFound, refresh };
}

/**
 * Live match UI (MV-5): the UNIFORM sticky Tourplay header (top bar + hero +
 * meta row) renders for the pending/scheduled/live/finished fixture states —
 * turns, clocks and score stay visible while the body scrolls, with the
 * LIVE-specific elements gated by `status === "live"` + the viewer's side. A
 * running match (`status: "live"`) is fed by the `useLiveMatch` SSE hook
 * (controls call `sendCommand`); a finished live match renders the header with
 * the final score above the chronological timeline from persisted events.
 * Static played/walkover fixtures (no `LiveMatch`) keep their own summary/
 * walkover bodies with no turn/clock/event chrome (MV-5/AC-5).
 */

/** Formats a millisecond value as M:SS (informational unified clock). */
function FormatMs({ ms }: { ms: number }) {
  const totalSeconds = Math.floor(ms / 1000);
  const m = Math.floor(totalSeconds / 60);
  const s = totalSeconds % 60;
  return (
    <span>
      {m}
      <span aria-hidden="true">:</span>
      {String(s).padStart(2, "0")}
    </span>
  );
}

/** Formats a millisecond value as H:MM:SS (per-coach clocks, mockup format). */
function FormatHms({ ms }: { ms: number }) {
  const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return (
    <span>
      {h}
      <span aria-hidden="true">:</span>
      {String(m).padStart(2, "0")}
      <span aria-hidden="true">:</span>
      {String(s).padStart(2, "0")}
    </span>
  );
}

/** An empty pending live-state shell used before the first consent (D16). */
function emptyPendingView(): LiveMatchViewState {
  return {
    seq: 0,
    status: "pending",
    half: 1,
    turnNumber: 1,
    activeSide: "home",
    homeConsented: false,
    awayConsented: false,
    viewerSide: null,
    startedAt: null,
    elapsed: 0,
    homeTurnMs: 0,
    awayTurnMs: 0,
    paused: false,
    homeScore: 0,
    awayScore: 0,
    finishedAt: null,
  };
}

/**
 * LM-13: true when the ACTIVE coach's page must show the "Tu rival pide el
 * turno" nudge — the viewer is active AND the opponent sent a requestTurn that
 * no later turn flip (turnStart/turn/endHalf/endMatch) has superseded. Deriving
 * from the timeline makes the banner survive a reload (the snapshot carries the
 * persisted nudge) and self-clear on the next turn flip.
 */
function rivalRequestsTurn(
  events: LiveMatchView["events"],
  viewerSide: "home" | "away" | null,
  activeSide: "home" | "away",
): boolean {
  if (viewerSide == null || viewerSide !== activeSide) return false;
  let lastNudgeSeq = -1;
  let lastTurnFlipSeq = -1;
  for (const event of events) {
    if (event.kind === "requestTurn") {
      lastNudgeSeq = event.seq;
    } else if (
      event.kind === "turnStart" ||
      event.kind === "turn" ||
      event.kind === "endHalf" ||
      event.kind === "endMatch"
    ) {
      lastTurnFlipSeq = event.seq;
    }
  }
  if (lastNudgeSeq < 0 || lastNudgeSeq <= lastTurnFlipSeq) return false;
  const nudge = events.find((e) => e.seq === lastNudgeSeq);
  return nudge?.side != null && nudge.side !== viewerSide;
}

/** The two-team matchup header shown in the centered consent panel. */
function MatchupLine({ names }: { names: { home: string; away: string } }) {
  return (
    <p className="text-sm font-black uppercase tracking-wide text-[#12225a]">
      {names.home} <span className="text-[#d11938]">·</span> {names.away}
    </p>
  );
}

/**
 * Two-phase consent / ready / begin panel (LM-11/LM-3/D19). Rendered when a
 * scheduled fixture has no live row yet (`live: null` → "Iniciar partido") or a
 * `pending`/`ready` row (retract / "Empezar partido"). The viewer's side comes
 * from the DTO's `viewerSide` (D19); the panel only shows the controls for the
 * current viewer's side.
 */
function LiveConsentPanel({
  state,
  names,
  onConsent,
  onRetract,
  onBegin,
  submitting,
}: {
  state: LiveMatchViewState | null;
  names: { home: string; away: string };
  onConsent: (side: "home" | "away") => void;
  onRetract: (side: "home" | "away") => void;
  onBegin: () => void;
  submitting: boolean;
}) {
  const side = state?.viewerSide ?? null;
  const pending = state == null || state.status === "pending";
  const ready = state?.status === "ready";

  if (pending && side === null) {
    return (
      <div className="border border-[#e2e8f0] bg-white px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-sm font-semibold text-slate-600">
          Esperando a los entrenadores para iniciar el partido.
        </p>
      </div>
    );
  }

  if (pending && side !== null) {
    const meConsented = side === "home" ? state?.homeConsented : state?.awayConsented;
    return (
      <div className="border border-[#e2e8f0] bg-white px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#12225a]">
          Partido programado
        </p>
        <p className="mt-2 text-sm text-slate-700">
          {names[side]} quiere empezar. {side === "home" ? names.away : names.home} aún no ha confirmado.
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {meConsented ? (
            <button
              type="button"
              onClick={() => onRetract(side)}
              disabled={submitting}
              className="rounded-md border border-[#12225a] px-4 py-2 text-sm font-semibold text-[#12225a] hover:bg-[#f8fafc]"
            >
              Retirar consentimiento
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConsent(side)}
              disabled={submitting}
              className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48]"
            >
              Iniciar partido
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {meConsented ? "Listo, esperando al rival." : "El partido comenzará cuando ambos entrenadores confirmen."}
        </p>
      </div>
    );
  }

  if (ready && side !== null) {
    return (
      <div className="border border-[#e2e8f0] bg-white px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#12225a]">Listo para empezar</p>
        <p className="mt-2 text-sm text-slate-700">Ambos entrenadores han confirmado.</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onBegin}
            disabled={submitting}
            className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48]"
          >
            Empezar partido
          </button>
          <button
            type="button"
            onClick={() => onRetract(side)}
            disabled={submitting}
            className="rounded-md border border-[#12225a] px-4 py-2 text-sm font-semibold text-[#12225a] hover:bg-[#f8fafc]"
          >
            Retirar consentimiento
          </button>
        </div>
      </div>
    );
  }

  if (ready && side === null) {
    return (
      <div className="border border-[#e2e8f0] bg-white px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-sm font-bold text-[#12225a]">Listos para empezar</p>
        <p className="mt-2 text-xs text-slate-500">Ambos entrenadores han confirmado.</p>
      </div>
    );
  }

  return null;
}

/**
 * One team's turn track (Tourplay): BOTH tracks always show the SAME GLOBAL
 * sequence — 1-8 during half 1, 9-16 during half 2 (current global =
 * `half === 2 ? turnNumber + 8 : turnNumber`). Only the ACTIVE side's current
 * turn is highlighted (this supersedes the per-team isolated counters from #79).
 */
function TurnTrack({
  sideName,
  current,
  isActive,
}: {
  sideName: string;
  /** The GLOBAL current turn: 1-8 in half 1, 9-16 in half 2. */
  current: number;
  isActive: boolean;
}) {
  const first = current > 8 ? 9 : 1;
  return (
    <div aria-label={`Turnos de ${sideName}`} className="flex items-center gap-1">
      {Array.from({ length: 8 }, (_, i) => first + i).map((n) => {
        const active = isActive && n === current;
        return (
          <span
            key={n}
            aria-label={`Turno ${n}`}
            aria-current={active ? "true" : undefined}
            className={`flex h-5 w-5 items-center justify-center rounded-sm text-[10px] font-bold ${
              active ? "bg-[#d11938] text-white" : "bg-[#1f3a7a] text-[#9fb3d8]"
            }`}
          >
            {n}
          </span>
        );
      })}
    </div>
  );
}

/**
 * The mockup top bar (Tourplay): a COMPACT SINGLE-ROW navy bar (flex-wrap on
 * small screens) —
 * `[label "{league} · Jornada {round}"] [home track] [home clock H:MM:SS]
 *  [2ª PARTE badge] [away clock H:MM:SS] [TURNO button] [away track]`.
 * The layout renders UNIFORMLY in every fixture state (pending/scheduled/live/
 * finished); only the LIVE-specific elements are gated: both turn tracks show
 * the SAME global numbers with the ACTIVE side's current turn highlighted ONLY
 * while live (inert otherwise — no `aria-current`), the clocks show H:MM:SS
 * while live (or the frozen base value once it carries real time) and "–"
 * before kickoff, and the ACTIVE coach's "Tu turno" STATUS + the red TURNO
 * ("Dar el turno") button render ONLY when `status === "live"` AND the viewer
 * is the active participant (spectator/admin → hidden). The "Mitad H · Turno N"
 * line stays always-visible (all strings stay byte-identical — e2e/unit suites
 * assert them). The unified "Tiempo" clock lives in the hero scoreboard.
 */
function LiveTopBar({
  state,
  clock,
  label,
  names,
  turnControls,
}: {
  state: LiveMatchViewState;
  clock: DisplayClock;
  label: string;
  names: { home: string; away: string };
  turnControls: { isActive: boolean; submitting: boolean; onEndTurn: () => void };
}) {
  const live = state.status === "live";
  const globalTurn = state.half === 2 ? state.turnNumber + 8 : state.turnNumber;
  // Inert pre-kickoff clocks render "–"; once a value exists (live or finished)
  // the H:MM:SS (base or ticking) renders.
  const clockValue = (ms: number) => (live || ms > 0 ? <FormatHms ms={ms} /> : "–");
  const showTurnControls = live && turnControls.isActive;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-[#1f3a7a] bg-[#12225a] px-4 py-2 text-white">
      <p className="text-[11px] font-bold uppercase tracking-wide text-[#cbd5e1]">{label}</p>
      <TurnTrack
        sideName={names.home}
        current={globalTurn}
        isActive={live && state.activeSide === "home"}
      />
      <span className="text-[11px] font-bold tabular-nums text-white">
        {clockValue(clock.homeTurnMs)}
      </span>
      <span className="rounded-sm bg-[#d11938] px-1.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-white">
        {state.half === 2 ? "2ª PARTE" : "1ª PARTE"}
      </span>
      <span className="text-[11px] font-bold tabular-nums text-white">
        {clockValue(clock.awayTurnMs)}
      </span>
      <span className="flex items-center gap-2">
        <p className="text-[11px] font-semibold text-[#cbd5e1]">
          Mitad {state.half} · Turno {state.turnNumber}
        </p>
        {showTurnControls ? (
          <>
            <p role="status" className="text-[11px] font-bold uppercase tracking-wide text-[#d11938]">
              Tu turno
            </p>
            <button
              type="button"
              onClick={turnControls.onEndTurn}
              disabled={turnControls.submitting}
              className="rounded-sm bg-[#d11938] px-3 py-1 text-[11px] font-extrabold uppercase tracking-wider text-white hover:bg-[#b0142f] disabled:opacity-50"
            >
              Dar el turno
            </button>
          </>
        ) : null}
      </span>
      <TurnTrack
        sideName={names.away}
        current={globalTurn}
        isActive={live && state.activeSide === "away"}
      />
    </div>
  );
}

/** One team's mini-stat pill row (casi Tourplay): ⚽ TD / 🤝 completions /
 * ⚰️ casualties / ★ SPP derived from the event feed via `deriveTeamStats`.
 * A pill renders when the STAT has data on EITHER side (visible), so the two
 * teams' pills sit side-by-side (a 0 shows next to the opponent's 1, Design 10). */
function MiniStats({
  stats,
  side,
  visible,
}: {
  stats: TeamStats;
  side: "home" | "away";
  visible: { td: boolean; comp: boolean; cas: boolean; spp: boolean };
}) {
  const pills = [
    { key: "td", icon: "⚽", value: stats.tds, show: visible.td },
    { key: "comp", icon: "🤝", value: stats.completions, show: visible.comp },
    { key: "cas", icon: "⚰️", value: stats.casualties, show: visible.cas },
    { key: "spp", icon: "★", value: stats.spp, show: visible.spp },
  ].filter((pill) => pill.show);
  if (pills.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap justify-center gap-1.5">
      {pills.map((pill) => (
        <span
          key={pill.key}
          data-testid={`mini-${pill.key}-${side}`}
          className="flex items-center gap-1 rounded-sm bg-white/15 px-1.5 py-0.5 text-[10px] text-white"
        >
          <span aria-hidden="true">{pill.icon}</span>
          <b className="tabular-nums">{pill.value}</b>
        </span>
      ))}
    </div>
  );
}

/** One team column of the hero banner (emblem + name + race · coach + pills). */
function LiveTeamBlock({
  name,
  subtitle,
  teamId,
  stats,
  side,
  visible,
}: {
  name: string;
  subtitle: string;
  teamId: string;
  stats: TeamStats;
  side: "home" | "away";
  visible: { td: boolean; comp: boolean; cas: boolean; spp: boolean };
}) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <TeamEmblem teamId={teamId} name={name} size="lg" className="border-2 border-white/25" />
      <p className="mt-1 max-w-full truncate text-lg font-black uppercase tracking-wide text-white">
        {name}
      </p>
      <p className="max-w-full truncate text-[11px] text-[#cbd5e1]">{subtitle}</p>
      <MiniStats stats={stats} side={side} visible={visible} />
    </div>
  );
}

/**
 * The center scoreboard: BIG "home : away" digits (white on the navy hero, red
 * separator, mockup letter-spaced digits). The score is "- : -" before the
 * fixture is played (pending/scheduled), the live score while live, and the
 * final score once finished. The unified "Tiempo" match clock renders ONLY
 * while live (it ticks client-side; a frozen elapsed would be inert noise on a
 * pre-live or finished page).
 */
function LiveScoreboard({ state }: { state: LiveMatchViewState }) {
  const played = state.status === "live" || state.status === "finished";
  return (
    <div className="px-2 text-center">
      <p
        data-testid="live-score"
        aria-label="Marcador"
        className="text-5xl font-black leading-none tracking-[0.08em] text-white tabular-nums"
      >
        {played ? state.homeScore : "-"}
        <span className="mx-2 text-[#d11938]">:</span>
        {played ? state.awayScore : "-"}
      </p>
      {state.status === "live" ? (
        <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-[#cbd5e1]">
          Tiempo <FormatMs ms={state.elapsed} />
        </p>
      ) : null}
    </div>
  );
}

/**
 * Hero banner (casi Tourplay, Design 10): `1fr auto 1fr` — teams mirrored
 * around the center score, each with its emblem, name, race · coach line and
 * the per-team mini-stat pills, on the navy→dark-red gradient. The whole view
 * derives the stats once from the event feed via `deriveTeamStats`.
 */
function LiveHero({
  state,
  names,
  homeSubtitle,
  awaySubtitle,
  homeTeamId,
  awayTeamId,
  events,
}: {
  state: LiveMatchViewState;
  names: { home: string; away: string };
  homeSubtitle: string;
  awaySubtitle: string;
  homeTeamId: string;
  awayTeamId: string;
  events: LiveMatchView["events"];
}) {
  const stats = deriveTeamStats(events);
  // A stat pill renders only when EITHER side has data (per-stat, symmetric).
  const visible = {
    td: stats.home.tds + stats.away.tds > 0,
    comp: stats.home.completions + stats.away.completions > 0,
    cas: stats.home.casualties + stats.away.casualties > 0,
    spp: stats.home.spp + stats.away.spp > 0,
  };
  const sideStats = (side: "home" | "away"): TeamStats => ({
    tds: visible.td ? stats[side].tds : 0,
    completions: visible.comp ? stats[side].completions : 0,
    casualties: visible.cas ? stats[side].casualties : 0,
    fouls: 0,
    spp: visible.spp ? stats[side].spp : 0,
  });
  return (
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3 bg-gradient-to-br from-[#1b2f6e] via-[#12225a] to-[#5c1020] px-4 py-6">
      <LiveTeamBlock
        name={names.home}
        subtitle={homeSubtitle}
        teamId={homeTeamId}
        stats={sideStats("home")}
        side="home"
        visible={visible}
      />
      <LiveScoreboard state={state} />
      <LiveTeamBlock
        name={names.away}
        subtitle={awaySubtitle}
        teamId={awayTeamId}
        stats={sideStats("away")}
        side="away"
        visible={visible}
      />
    </div>
  );
}

/** The weather/stadium row (Design 10): weather is omit/neutral when a live
 * match has none yet; the stadium has no data source → the rulebook-neutral
 * "Reglamentario" always renders. */
function LiveMetaRow() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#e2e8f0] bg-[#f8fafc] px-4 py-1.5 text-[11px] text-slate-500">
      <span>Clima · Estándar</span>
      <span>Estadio · Reglamentario</span>
    </div>
  );
}

/**
 * The uniform sticky match header (top bar + hero + meta row): rendered for
 * EVERY fixture state (pending/scheduled/live/finished) so the turns, clocks
 * and score stay visible while the body scrolls (`sticky top-0 z-40` on a solid
 * navy background). Only the LIVE-specific elements inside are gated by
 * `state.status === "live"` (see LiveTopBar/LiveScoreboard).
 */
function TourplayHeader({
  state,
  clock,
  label,
  names,
  homeSubtitle,
  awaySubtitle,
  homeTeamId,
  awayTeamId,
  events,
  turnControls,
}: {
  state: LiveMatchViewState;
  clock: DisplayClock;
  label: string;
  names: { home: string; away: string };
  homeSubtitle: string;
  awaySubtitle: string;
  homeTeamId: string;
  awayTeamId: string;
  events: LiveMatchView["events"];
  turnControls: { isActive: boolean; submitting: boolean; onEndTurn: () => void };
}) {
  return (
    <div
      data-testid="tourplay-header"
      className="sticky top-0 z-40 border-b border-[#1f3a7a] bg-[#12225a]"
    >
      <LiveTopBar
        state={state}
        clock={clock}
        label={label}
        names={names}
        turnControls={turnControls}
      />
      <LiveHero
        state={state}
        names={names}
        homeSubtitle={homeSubtitle}
        awaySubtitle={awaySubtitle}
        homeTeamId={homeTeamId}
        awayTeamId={awayTeamId}
        events={events}
      />
      <LiveMetaRow />
    </div>
  );
}

/** The live-session control: consent → ready → begin → live clock + controls. */
function LiveActiveMatch({
  live,
  leagueId,
  fixtureId,
  names,
  viewerSide,
  leagueLabel,
  homeSubtitle,
  awaySubtitle,
  homeTeam,
  awayTeam,
}: {
  live: LiveMatchView | null;
  leagueId: string;
  fixtureId: string;
  names: { home: string; away: string };
  viewerSide: "home" | "away" | null;
  leagueLabel: string;
  homeSubtitle: string;
  awaySubtitle: string;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
}) {
  const { live: hookLive, sendCommand } = useLiveMatch({ leagueId, fixtureId });
  // Start from the persisted snapshot (or an empty pending shell when no row
  // exists yet, D16), then adopt the real-time SSE overrides. `viewerSide` is
  // per-viewer (D19): hub fan-out frames carry null, so ALWAYS merge the
  // session-derived side over whatever the SSE pushed — the server stays the
  // authority for everything else (LM-8/D19). Memoized so the ticking clock
  // re-renders don't churn the SSE frame reference.
  const state = useMemo<LiveMatchViewState>(
    () => ({
      ...(hookLive != null && "activeSide" in hookLive
        ? hookLive
        : live ?? { ...emptyPendingView(), viewerSide }),
      viewerSide,
    }),
    [hookLive, live, viewerSide],
  );
  const clock = useLiveClock(state);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Synchronous in-flight lock: a second invocation while a command is pending
  // (e.g. the second click of a double-click) is dropped — the `submitting`
  // state alone re-renders too late to guard it, and the stale closure would
  // otherwise send `endTurn` with the already-flipped side (double turn jump).
  const busyRef = useRef(false);

  const act = async (cmd: LiveCommand) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      await sendCommand(cmd);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo ejecutar.");
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  // The event timeline comes from the SSE hook's accumulated frames once it has
  // converged (the snapshot carries the persisted timeline); until then the
  // fixture detail's persisted events stand in. This keeps the timeline, the
  // hero stats and the nudge banner LIVE without a reload.
  const events = hookLive != null && hookLive.events.length > 0 ? hookLive.events : live?.events ?? [];
  const showNudgeBanner = rivalRequestsTurn(events, state.viewerSide, state.activeSide);

  return (
    <div className="bg-white border border-[#e2e8f0]">
      {/* Uniform sticky match header: renders in EVERY fixture state. */}
      <TourplayHeader
        state={state}
        clock={clock}
        label={leagueLabel}
        names={names}
        homeSubtitle={homeSubtitle}
        awaySubtitle={awaySubtitle}
        homeTeamId={homeTeam.id}
        awayTeamId={awayTeam.id}
        events={events}
        turnControls={{
          isActive: state.viewerSide === state.activeSide,
          submitting,
          onEndTurn: () => void act({ type: "endTurn", side: state.activeSide }),
        }}
      />

      {state.status === "pending" || state.status === "ready" ? (
        <>
          <LiveConsentPanel
            state={state}
            names={names}
            onConsent={(side) => void act({ type: "consent", side })}
            onRetract={(side) => void act({ type: "retractConsent", side })}
            onBegin={() => void act({ type: "begin" })}
            submitting={submitting}
          />
          {error ? (
            <p role="alert" className="px-4 pb-3 text-sm text-red-600">
              {error}
            </p>
          ) : null}
        </>
      ) : (
        <>
          {showNudgeBanner ? (
            <p
              role="status"
              className="border-b border-[#d11938] bg-[#f8fafc] px-4 py-2 text-center text-sm font-bold text-[#d11938]"
            >
              Tu rival pide el turno
            </p>
          ) : null}
          <LiveEventsList
            events={events}
            startedAt={state.startedAt}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
          />

          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="min-w-0">
              {error ? (
                <p role="alert" className="mt-1 text-sm text-red-600">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {/* A non-active coach (with a side) may request the turn (LM-13/D14);
                  the ACTIVE coach's pass control lives CENTERED in the top bar. */}
              {state.viewerSide !== null && state.viewerSide !== state.activeSide ? (
                <button
                  type="button"
                  onClick={() => void act({ type: "requestTurn" })}
                  disabled={state.status !== "live" || submitting}
                  className="rounded-md border border-[#12225a] px-4 py-2 text-sm font-semibold text-[#12225a] hover:bg-[#f8fafc]"
                >
                  Pedir turno
                </button>
              ) : null}
            </div>
          </div>
          {/* D26: event recording controls — FAB + role-aware menu; renders only for a
              live match with a viewer side (null → spectator/admin hidden). The
              roster is the viewer's OWN side (alive players) for the mini-form. */}
          <EventControls
            viewerSide={state.viewerSide}
            activeSide={state.activeSide}
            status={state.status}
            roster={state.viewerSide === "away" ? awayTeam.players : homeTeam.players}
            onSubmit={act}
          />
        </>
      )}
    </div>
  );
}

/** The persisted Design-A timeline for a finished live match (LM-10, live + played). */
function FinishedLiveTimeline({
  live,
  homeTeam,
  awayTeam,
}: {
  live: LiveMatchView;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
}) {
  return (
    <div className="bg-white border border-[#e2e8f0]">
      <div className="px-4 py-4 text-center">
        <p className="text-3xl font-black text-[#12225a]">
          {live.homeScore} <span className="text-[#d11938]">–</span> {live.awayScore}
        </p>
      </div>
      <LiveEventsList
        events={live.events}
        startedAt={live.startedAt}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
    </div>
  );
}

/**
 * A finished live match (status "finished"): the UNIFORM sticky Tourplay header
 * renders the final score + frozen per-team clocks + inert tracks above the
 * persisted Design-A timeline. `useLiveClock` re-derives nothing while not
 * live — it just serves the persisted clock base values.
 */
function FinishedLiveView({
  live,
  leagueLabel,
  names,
  homeSubtitle,
  awaySubtitle,
  homeTeam,
  awayTeam,
}: {
  live: LiveMatchView;
  leagueLabel: string;
  names: { home: string; away: string };
  homeSubtitle: string;
  awaySubtitle: string;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
}) {
  const clock = useLiveClock(live);
  return (
    <div className="bg-white border border-[#e2e8f0]">
      <TourplayHeader
        state={live}
        clock={clock}
        label={leagueLabel}
        names={names}
        homeSubtitle={homeSubtitle}
        awaySubtitle={awaySubtitle}
        homeTeamId={homeTeam.id}
        awayTeamId={awayTeam.id}
        events={live.events}
        turnControls={{ isActive: false, submitting: false, onEndTurn: () => {} }}
      />
      <FinishedLiveTimeline live={live} homeTeam={homeTeam} awayTeam={awayTeam} />
    </div>
  );
}

/**
 * A pending fixture (no scheduled date): the UNIFORM sticky Tourplay header
 * renders the inert pre-kickoff state ("–" clocks, "- : -" score, no turn
 * controls) above the pending notice. The header runs on the empty pending
 * shell (D16) so pending and scheduled share the exact same chrome.
 */
function PendingFixtureView({
  leagueLabel,
  names,
  homeSubtitle,
  awaySubtitle,
  homeTeam,
  awayTeam,
}: {
  leagueLabel: string;
  names: { home: string; away: string };
  homeSubtitle: string;
  awaySubtitle: string;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
}) {
  const state = useMemo(() => emptyPendingView(), []);
  const clock = useLiveClock(state);
  return (
    <div className="bg-white border border-[#e2e8f0]">
      <TourplayHeader
        state={state}
        clock={clock}
        label={leagueLabel}
        names={names}
        homeSubtitle={homeSubtitle}
        awaySubtitle={awaySubtitle}
        homeTeamId={homeTeam.id}
        awayTeamId={awayTeam.id}
        events={[]}
        turnControls={{ isActive: false, submitting: false, onEndTurn: () => {} }}
      />
      <div className="bg-white px-4 py-6 text-center">
        <p className="text-sm font-semibold text-slate-600">Sin jornada programada todavía.</p>
      </div>
    </div>
  );
}

/**
 * Design-A per-kind glyph (rulebook-light — inline text glyphs, no icon
 * library). The casing/nursing sub-buckets reuse the band: a lasting casualty
 * (Baja) gets the skull, a bruise (Herida) the cross. Boundary/no-player rows
 * get neutral glyphs.
 */
const EVENT_GLYPH: Record<string, string> = {
  start: "🌤️",
  td: "⚽",
  completion: "🤝",
  foul: "👟",
  mvp: "⭐",
  endHalf: "⏱️",
  endMatch: "🏁",
};

/** The Design-A chronology: one row per display-worthy event (LM-17). */
function LiveEventsList({
  events,
  startedAt,
  homeTeam,
  awayTeam,
}: {
  events: LiveMatchView["events"];
  startedAt: number | null;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
}) {
  if (events.length === 0) return null;
  // D21: dorsal = roster index + 1 via the served players array.
  const homeRef = playerRef(homeTeam.players);
  const awayRef = playerRef(awayTeam.players);
  const positionOf = (team: MatchTeamDetail, key: string | undefined): string =>
    team.raceId && key
      ? getRaceById(team.raceId)?.positionals.find((p) => p.key === key)?.name ?? key
      : key ?? "—";
  const playerOf = (team: MatchTeamDetail, rosterPlayerId: string | null) =>
    rosterPlayerId ? team.players.find((p) => p.rosterPlayerId === rosterPlayerId) : undefined;
  // Mockup chronology (Design A): NEWEST FIRST — the mockup lists 196' at the
  // top and 0' (Inicio) at the bottom, so sort by descending seq.
  const ordered = [...events].sort((a, b) => b.seq - a.seq);

  return (
    <ol aria-label="Cronología del partido" className="border-t border-[#e2e8f0]">
      {ordered.map((event) => {
        const ref = event.side === "away" ? awayRef : event.side === "home" ? homeRef : null;
        const team = event.side === "away" ? awayTeam : event.side === "home" ? homeTeam : null;
        const player = team ? playerOf(team, event.playerRosterId) : undefined;
        const dorsal = player ? ref?.get(player.rosterPlayerId) : undefined;
        const spp = eventSpp(event);
        const glyph =
          event.kind === "casualty"
            ? (typeof event.payload.band === "string" && event.payload.band === "bruise" ? "🏥" : "⚰️")
            : EVENT_GLYPH[event.kind] ?? "•";
        // Rulebook-light side gradient (navy home / red visitor) like the mockup.
        const sideCls =
          event.side === "away"
            ? "bg-gradient-to-l from-[#d11938]/10 to-transparent"
            : event.side === "home"
              ? "bg-gradient-to-r from-[#12225a]/10 to-transparent"
              : "";
        // Tourplay `match-event--reverse`: the VISITOR rows are mirrored (detail
        // on the left → player/dorsal/time on the right) so each team reads its
        // chronology from its own side; the local rows keep the normal order.
        const isVisitor = event.side === "away";
        return (
          <li
            key={event.seq}
            className={`flex items-center gap-3 px-4 py-2 text-sm ${sideCls} ${
              isVisitor ? "flex-row-reverse" : ""
            }`}
            data-testid="live-event-row"
          >
            <span className="w-10 shrink-0 text-xs tabular-nums text-slate-500">
              {deriveMinute(event.at, startedAt ?? 0)}
            </span>
            <span
              className={`whitespace-nowrap rounded px-1.5 py-0.5 text-[10px] font-bold text-white ${
                event.side === "away" ? "bg-[#d11938]" : "bg-[#12225a]"
              }`}
            >
              {turnTag(event.half, event.turnNumber)}
            </span>
            <span className="w-6 shrink-0 text-center text-sm font-black text-slate-500">
              {dorsal != null ? `#${dorsal}` : ""}
            </span>
            <div className="min-w-0 flex-1">
              {player ? (
                <>
                  <p className="truncate font-bold text-[#0f172a]">{player.name}</p>
                  <p className="truncate text-[11px] text-slate-500">
                    {positionOf(team!, player.positionalKey)}
                  </p>
                </>
              ) : (
                <p className="truncate font-semibold text-[#0f172a]">{liveEventLabel(event)}</p>
              )}
            </div>
            {player ? (
              <div
                className={`flex shrink-0 flex-col ${
                  isVisitor ? "items-start text-left" : "items-end text-right"
                }`}
              >
                <p className="text-sm font-bold text-[#0f172a]">
                  <span aria-hidden="true" className="mr-1">{glyph}</span>
                  {liveEventLabel(event)}
                </p>
                {spp > 0 ? (
                  <p className="text-[11px] font-semibold text-[#b8860b]" aria-label="SPP">
                    ★{spp}
                  </p>
                ) : null}
              </div>
            ) : null}
          </li>
        );
      })}
    </ol>
  );
}

function Coins({ value }: { value: number | null | undefined }) {
  return <>{value?.toLocaleString("es-ES") ?? ""}</>;
}

function SectionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-[#e2e8f0] py-2 px-3 last:border-b-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right text-sm text-slate-800">{children}</span>
    </li>
  );
}

function PlayedSections({ sections }: { sections: MatchSummarySection[] }) {
  const score = sections.find((s): s is Extract<MatchSummarySection, { type: "score" }> => s.type === "score");
  const teams = sections.find((s): s is Extract<MatchSummarySection, { type: "teams" }> => s.type === "teams");
  const fans = sections.find((s): s is Extract<MatchSummarySection, { type: "fans" }> => s.type === "fans");
  const winnings = sections.find((s): s is Extract<MatchSummarySection, { type: "winnings" }> => s.type === "winnings");
  const casualties = sections.find((s): s is Extract<MatchSummarySection, { type: "casualties" }> => s.type === "casualties");
  const weather = sections.find((s): s is Extract<MatchSummarySection, { type: "weather" }> => s.type === "weather");
  const pe = sections.find((s): s is Extract<MatchSummarySection, { type: "pe" }> => s.type === "pe");
  const mvp = sections.find((s): s is Extract<MatchSummarySection, { type: "mvp" }> => s.type === "mvp");

  return (
    <div className="bg-white border border-[#e2e8f0]">
      {/* Scoreboard */}
      {score ? (
        <div className="px-4 py-4 text-center">
          <p className="text-3xl font-black text-[#12225a]">
            {score.home} <span className="text-[#d11938]">–</span> {score.away}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#d11938]">{score.winnerName}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 px-4 pb-4 sm:flex-nowrap">
        {teams ? (
          <>
            <div className="flex-1 border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <p className="text-sm font-bold text-[#12225a]">{teams.home.name}</p>
              <p className="text-xs text-slate-500">
                {teams.home.raceName ?? "—"} · {teams.home.coachName ?? "—"}
              </p>
            </div>
            <div className="flex-1 border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <p className="text-sm font-bold text-[#12225a]">{teams.away.name}</p>
              <p className="text-xs text-slate-500">
                {teams.away.raceName ?? "—"} · {teams.away.coachName ?? "—"}
              </p>
            </div>
          </>
        ) : null}
      </div>

      <ul className="px-4 pb-4">
        {fans ? (
          <SectionRow label="Afición">
            {fans.home} · {fans.away}
          </SectionRow>
        ) : null}
        {winnings ? (
          <SectionRow label="Ganancias">
            <Coins value={winnings.home} /> · <Coins value={winnings.away} />
          </SectionRow>
        ) : null}
        {weather ? <SectionRow label="Clima">{weather.label}</SectionRow> : null}
        {casualties ? (
          <SectionRow label="Heridas">
            {casualties.items.map((c) => (
              <span key={`${c.label}:${c.playerName}`} className="block">
                {c.playerName} · {c.label}
              </span>
            ))}
          </SectionRow>
        ) : null}
      </ul>

      {pe && pe.home.concat(pe.away).length > 0 ? (
        <div className="border-t border-[#e2e8f0] px-4 py-3">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">PE</h3>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
            {pe.home.map((row, i) => (
              <li key={`home:${row.playerName}:${i}`} className="flex justify-between text-sm">
                <span>{row.playerName}</span>
                <span className="text-slate-600">{row.pe} PE</span>
              </li>
            ))}
            {pe.away.map((row, i) => (
              <li key={`away:${row.playerName}:${i}`} className="flex justify-between text-sm">
                <span>{row.playerName}</span>
                <span className="text-slate-600">{row.pe} PE</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mvp ? (
        <div className="border-t-2 border-[#d11938] bg-[#12225a] px-4 py-3 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#cbd5e1]">Jugador del partido</p>
          <div className="mt-1 flex flex-wrap justify-between gap-2">
            <p className="text-sm font-bold">
              {mvp.home ? `${mvp.home.playerName} · +${PE_MVP} PE` : "—"}
            </p>
            <p className="text-sm font-bold">
              {mvp.away ? `${mvp.away.playerName} · +${PE_MVP} PE` : "—"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The match view page (client, D2): fetches the match detail and renders the
 * three lifecycle states plus the walkover notice and inert live shells.
 * League-section copy is Spanish; only rulebook-light tokens are used (MV-7).
 */
export function MatchView({ leagueId, fixtureId }: { leagueId: string; fixtureId: string }) {
  const { detail, loading, error, notFound } = useMatchDetail(leagueId, fixtureId);
  const leagueName = useLeagueName(leagueId);
  // D19: when no LiveMatch row exists yet, the per-viewer side is deduced from
  // the session user against the two team owners (the DTO carries it otherwise).
  const { data: session } = useSession();
  const viewerSide: "home" | "away" | null =
    session?.user?.id == null
      ? null
      : detail?.homeTeam?.user?.id === session.user.id
        ? "home"
        : detail?.awayTeam?.user?.id === session.user.id
          ? "away"
          : null;

  if (notFound) {
    return (
      <div className="border border-[#e2e8f0] bg-white p-8 text-center">
        <p className="text-sm text-slate-600">Partido no encontrado.</p>
        <Link
          href="/leagues"
          className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
        >
          Volver a mis ligas
        </Link>
      </div>
    );
  }

  if (!loading && !detail) {
    return (
      <div className="border border-[#e2e8f0] bg-white p-8 text-center">
        <p className="text-sm text-slate-600">{error ?? "No se pudo cargar el partido."}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[200px] items-center justify-center bg-white p-8">
        <p className="text-sm text-slate-500" role="status">
          Cargando partido…
        </p>
      </div>
    );
  }

  const summary = buildMatchSummary(detail);
  const names = { home: detail.homeTeam.name, away: detail.awayTeam.name };
  // Mockup top-bar label: "{league} · Jornada {round}" (league name resolved
  // client-side; falls back to "Jornada {round}" when unavailable).
  const leagueLabel = `${leagueName ? `${leagueName} · ` : ""}Jornada ${detail.fixture.round}`;
  // Hero team subtitles: race name · coach name (matchSummary's teams-line).
  const homeSubtitle = `${getRaceById(detail.homeTeam.raceId)?.name ?? "—"} · ${detail.homeTeam.user?.name ?? "—"}`;
  const awaySubtitle = `${getRaceById(detail.awayTeam.raceId)?.name ?? "—"} · ${detail.awayTeam.user?.name ?? "—"}`;

  let body: React.ReactNode;
  if (detail.live) {
    // A LiveMatch exists for this fixture (MV-5): the uniform header renders
    // for the consent/ready/live states (LiveActiveMatch) and for the finished
    // live timeline (FinishedLiveView); the body below holds the per-state panel.
    body =
      detail.live.status === "finished" ? (
        <FinishedLiveView
          live={detail.live}
          leagueLabel={leagueLabel}
          names={names}
          homeSubtitle={homeSubtitle}
          awaySubtitle={awaySubtitle}
          homeTeam={detail.homeTeam}
          awayTeam={detail.awayTeam}
        />
      ) : (
        <LiveActiveMatch
          live={detail.live}
          leagueId={leagueId}
          fixtureId={fixtureId}
          names={names}
          viewerSide={viewerSide}
          leagueLabel={leagueLabel}
          homeSubtitle={homeSubtitle}
          awaySubtitle={awaySubtitle}
          homeTeam={detail.homeTeam}
          awayTeam={detail.awayTeam}
        />
      );
  } else if (summary.walkover) {
    // A walkover keeps its own panel (no uniform Tourplay header — the fixture
    // was never played live; the e2e asserts zero turn/clock chrome here).
    body = (
      <div className="border border-[#e2e8f0] bg-white px-4 py-4 text-center">
        <p className="text-3xl font-black text-[#12225a]">
          {detail.fixture.homeScore} <span className="text-[#d11938]">–</span> {detail.fixture.awayScore}
        </p>
        <p className="mt-2 text-sm font-semibold text-[#d11938]">Victoria por incomparecencia.</p>
      </div>
    );
  } else if (detail.fixture.status === "scheduled") {
    // A scheduled fixture with no LiveMatch yet (MV-5/D16): the uniform header
    // + the two-phase consent start panel ("Iniciar partido" per coach).
    body = (
      <LiveActiveMatch
        live={null}
        leagueId={leagueId}
        fixtureId={fixtureId}
        names={names}
        viewerSide={viewerSide}
        leagueLabel={leagueLabel}
        homeSubtitle={homeSubtitle}
        awaySubtitle={awaySubtitle}
        homeTeam={detail.homeTeam}
        awayTeam={detail.awayTeam}
      />
    );
  } else if (detail.fixture.status === "pending") {
    // A pending fixture (no date agreed): the uniform header renders the inert
    // pre-kickoff chrome above the pending notice.
    body = (
      <PendingFixtureView
        leagueLabel={leagueLabel}
        names={names}
        homeSubtitle={homeSubtitle}
        awaySubtitle={awaySubtitle}
        homeTeam={detail.homeTeam}
        awayTeam={detail.awayTeam}
      />
    );
  } else {
    body = <PlayedSections sections={summary.sections} />;
  }

  return (
    <section aria-label={`Partido ${detail.fixture.round}`}>
      <header className="mb-5 bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="border-b-[3px] border-[#d11938] pb-1 text-2xl font-black tracking-[0.02em] md:text-[24px]">
              Partido {detail.fixture.round}
            </h1>
            <p className="mt-1 text-[13px] text-[#cbd5e1]">
              {detail.homeTeam.name} vs {detail.awayTeam.name}
            </p>
          </div>
          <Link
            href={`/leagues/${leagueId}`}
            className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:border-white"
          >
            Volver
          </Link>
        </div>
      </header>

      {body}
    </section>
  );
}
