"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { can } from "@/lib/permissions";
import { PE_MVP } from "@/lib/rules";
import {
  createShareLink,
  getMatchDetail,
  resetLiveMatch,
  type LiveCommand,
  type LiveMatchViewState,
  type MatchDetail,
} from "./api";
import { useLiveMatch } from "./useLiveMatch";
import { useLiveClock } from "./useLiveClock";
import { useLeague, type LeagueAccess } from "./useLeagueName";
import { ActaSheetHeader, bribesOf, casualtyTurnsOf } from "./actaSheetHeader";
import { LiveEventCardsActa } from "./eventCardActa";
import { LiveActionDock } from "./liveActionDock";
import { MatchResolveModal } from "./MatchResolveModal";
import { ResetLiveMatchModal } from "./ResetLiveMatchModal";
import {
  buildMatchSummary,
  buildSummaryFeedRows,
  type MatchSummarySection,
  type SummaryFeedRow,
} from "./matchSummary";

interface MatchViewV2Props {
  leagueId: string;
  fixtureId: string;
}

/**
 * Live match V2 (ui-refresh seam 6, UIR-2): presentation-only rewrite of the
 * fixture surface. It reuses the legacy surface's OWN machinery —
 * `getMatchDetail` (single `GET /api/leagues/{id}/fixtures/{fid}`),
 * `useLeague`, `useLiveMatch` (SSE + `sendLiveCommand` commands), the Acta en
 * Vivo shell (`ActaSheetHeader`, MVA-1/MVA-2 + MVA-3 stepper half — supersedes
 * the old sticky chrome MVT-2/MVT-3), the shared
 * atoms (`LiveEventCardsActa`, `LiveActionDock`) and the
 * shared modals (`MatchResolveModal`, `ResetLiveMatchModal`) — and mirrors the
 * legacy state dispatch (pending/ready consent → live acta → finished summary,
 * walkover, reported sections) with `ui-v2-match-*` markers. No direct network
 * calls here: the endpoint lives only in `features/leagues/api.ts`, which
 * legacy itself imports (presentation-only).
 */

/** The empty pending live row (data-shape mirror of MatchView's private
 *  default — feeds the shared clock/dock until the first consent). */
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
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null },
    resolutionState: {
      home: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
      away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false },
    },
  };
}

/** ES coins format (mirror of MatchView's formatCoins). */
function formatCoins(value: number): string {
  return value.toLocaleString("es-ES");
}

/** Resolution wizard step → i18n key (mirror of MatchView's helper). */
function resolutionStepKey(step: string): string {
  switch (step) {
    case "winnings":
      return "match.resolve.stepWinnings";
    case "fans":
      return "match.resolve.stepFans";
    case "mvp":
      return "match.resolve.stepMvp";
    case "mvp-done":
      return "match.resolve.stepMvpDone";
    case "casualties":
      return "match.resolve.stepCasualties";
    case "journeymen":
      return "match.resolve.stepJourneymen";
    case "done":
      return "match.resolve.stepDone";
    default:
      return "match.resolve.stepUnknown";
  }
}

/** Clipboard copy (mirror of MatchView's helper): async API with a hidden-
 *  textarea fallback for contexts without `navigator.clipboard`. */
async function copyToClipboard(text: string): Promise<void> {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }
  const el = document.createElement("textarea");
  el.value = text;
  el.setAttribute("readonly", "");
  el.style.position = "fixed";
  el.style.opacity = "0";
  document.body.appendChild(el);
  try {
    el.select();
    const ok = document.execCommand("copy");
    if (!ok) throw new Error("copy command was rejected");
  } finally {
    document.body.removeChild(el);
  }
}

/** The two-team matchup header shown in the consent panel (data parity). */
function MatchupLine({ names }: { names: { home: string; away: string } }) {
  return (
    <p className="text-sm font-black uppercase tracking-wide text-navy">
      {names.home} <span className="text-red">·</span> {names.away}
    </p>
  );
}

/** Two-phase consent / ready / begin panel (data parity with the legacy
 *  LiveConsentPanel; V2-owned markup, commands through `sendLiveCommand`). */
function ConsentPanel({
  state,
  names,
  scheduled,
  onConsent,
  onRetract,
  onBegin,
  submitting,
}: {
  state: LiveMatchViewState;
  names: { home: string; away: string };
  scheduled: boolean;
  onConsent: (side: "home" | "away") => void;
  onRetract: (side: "home" | "away") => void;
  onBegin: () => void;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const side = state.viewerSide ?? null;
  const pending = state.status === "pending";
  const ready = state.status === "ready";

  if (pending && side === null) {
    return (
      <div className="border border-border bg-panel px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-sm font-semibold text-slate-600">{t("match.consent.waiting")}</p>
      </div>
    );
  }

  if (pending && side !== null) {
    const meConsented = side === "home" ? state.homeConsented : state.awayConsented;
    return (
      <div className="border border-border bg-panel px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-xs font-bold uppercase tracking-wide text-navy">
          {scheduled ? t("match.consent.scheduled") : t("match.consent.unscheduled")}
        </p>
        <p className="mt-2 text-sm text-slate-700">
          {t("match.consent.sideWants", { team: names[side], rival: side === "home" ? names.away : names.home })}
        </p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          {meConsented ? (
            <button
              type="button"
              onClick={() => onRetract(side)}
              disabled={submitting}
              className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-background"
            >
              {t("match.consent.retract")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConsent(side)}
              disabled={submitting}
              className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-hover"
            >
              {t("match.consent.start")}
            </button>
          )}
        </div>
        <p className="mt-3 text-xs text-slate-500">
          {meConsented ? t("match.consent.ready") : t("match.consent.bothConfirm")}
        </p>
      </div>
    );
  }

  if (ready && side !== null) {
    return (
      <div className="border border-border bg-panel px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-xs font-bold uppercase tracking-wide text-navy">{t("match.consent.readyToStart")}</p>
        <p className="mt-2 text-sm text-slate-700">{t("match.consent.bothConfirmed")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onBegin}
            disabled={submitting}
            className="rounded-md bg-navy px-4 py-2 text-sm font-semibold text-white hover:bg-navy-hover"
          >
            {t("match.consent.begin")}
          </button>
          <button
            type="button"
            onClick={() => onRetract(side)}
            disabled={submitting}
            className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-background"
          >
            {t("match.consent.retract")}
          </button>
        </div>
      </div>
    );
  }

  if (ready && side === null) {
    return (
      <div className="border border-border bg-panel px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-sm font-bold text-navy">{t("match.consent.readyToStartBoth")}</p>
        <p className="mt-2 text-xs text-slate-500">{t("match.consent.bothConfirmed")}</p>
      </div>
    );
  }

  return null;
}

/** A single snapshot-derived summary feed row (MVT-4 data, V2 testids). */
function SummaryRowView({ row, names }: { row: SummaryFeedRow; names: { home: string; away: string } }) {
  const { t } = useI18n();
  switch (row.type) {
    case "reported":
      return (
        <li
          data-testid="ui-v2-match-summary-reported"
          className="flex items-center gap-2 bg-green-50 px-3 py-2 text-[12px] font-bold text-green-700"
        >
          <span aria-hidden="true" className="flex h-5 w-5 items-center justify-center rounded-full bg-green-600/15 text-green-700">
            ✓
          </span>
          <span className="flex-1">{t("match.reported")}</span>
          <span className="tabular-nums">{row.date}</span>
        </li>
      );
    case "winnings":
    case "fans":
      return (
        <li data-testid="ui-v2-match-summary-row" className="flex items-center gap-3 bg-panel px-3 py-1.5 text-[12px]">
          <span aria-hidden="true" className="shrink-0 text-center">
            {row.type === "winnings" ? "💰" : "👥"}
          </span>
          <span className="flex-1 font-bold uppercase tracking-wide text-slate-500">
            {row.type === "winnings" ? t("match.winnings") : t("match.fans")}
          </span>
          <span className="flex flex-col items-end gap-0.5 text-right tabular-nums">
            <span className="leading-tight">
              {row.type === "winnings" ? `${names.home}: ${formatCoins(row.home)}` : `+${row.home}`}
            </span>
            <span className="leading-tight">
              {row.type === "winnings" ? `${names.away}: ${formatCoins(row.away)}` : `+${row.away}`}
            </span>
          </span>
        </li>
      );
    case "incentives":
      return (
        <li data-testid="ui-v2-match-summary-row" className="flex items-center gap-3 bg-panel px-3 py-1.5 text-[12px]">
          <span aria-hidden="true" className="shrink-0 text-center">💰</span>
          <span className="flex-1">
            <span className="block font-bold uppercase tracking-wide text-slate-500">{t("match.incentives")}</span>
            <span className="block text-[11px] font-semibold text-slate-600 tabular-nums">
              {names[row.team]}: {formatCoins(row.budget)}
            </span>
          </span>
          {row.cards.length > 0 ? (
            <span className="flex flex-wrap items-center justify-end gap-1">
              {row.cards.map((card) => (
                <span
                  key={card.name}
                  className="rounded-sm border border-navy/30 bg-navy/10 px-1.5 py-px text-[10px] font-bold text-navy"
                >
                  {card.name} ×{card.count}
                </span>
              ))}
            </span>
          ) : null}
        </li>
      );
    default:
      return null;
  }
}

/** The reported-result sections (legacy PlayedSections data, V2 testids). */
function PlayedSections({ sections }: { sections: MatchSummarySection[] }) {
  const { t } = useI18n();
  const score = sections.find((s): s is Extract<MatchSummarySection, { type: "score" }> => s.type === "score");
  const teams = sections.find((s): s is Extract<MatchSummarySection, { type: "teams" }> => s.type === "teams");
  const fans = sections.find((s): s is Extract<MatchSummarySection, { type: "fans" }> => s.type === "fans");
  const winnings = sections.find((s): s is Extract<MatchSummarySection, { type: "winnings" }> => s.type === "winnings");
  const casualties = sections.find((s): s is Extract<MatchSummarySection, { type: "casualties" }> => s.type === "casualties");
  const weather = sections.find((s): s is Extract<MatchSummarySection, { type: "weather" }> => s.type === "weather");
  const pe = sections.find((s): s is Extract<MatchSummarySection, { type: "pe" }> => s.type === "pe");
  const mvp = sections.find((s): s is Extract<MatchSummarySection, { type: "mvp" }> => s.type === "mvp");

  return (
    <div data-testid="ui-v2-match-played" className="bg-panel border border-border">
      {score ? (
        <div className="px-4 py-4 text-center">
          <p className="font-display text-3xl font-semibold leading-none text-navy">
            {score.home} <span className="text-endzone">–</span> {score.away}
          </p>
          <p className="mt-1 text-sm font-semibold text-red">{score.winnerName}</p>
        </div>
      ) : null}

      {teams ? (
        <div className="flex flex-wrap gap-3 px-4 pb-4 sm:flex-nowrap">
          <div className="flex-1 border border-border bg-background p-3">
            <p className="text-sm font-bold text-navy">{teams.home.name}</p>
            <p className="text-xs text-slate-500">
              {teams.home.raceName ?? "—"} · {teams.home.coachName ?? "—"}
            </p>
          </div>
          <div className="flex-1 border border-border bg-background p-3">
            <p className="text-sm font-bold text-navy">{teams.away.name}</p>
            <p className="text-xs text-slate-500">
              {teams.away.raceName ?? "—"} · {teams.away.coachName ?? "—"}
            </p>
          </div>
        </div>
      ) : null}

      <ul className="px-4 pb-4">
        {fans ? (
          <li className="flex items-baseline justify-between gap-3 border-b border-border py-2 px-3 last:border-b-0">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("match.fansSection")}</span>
            <span className="text-right text-sm text-slate-800">{fans.home} · {fans.away}</span>
          </li>
        ) : null}
        {winnings ? (
          <li className="flex items-baseline justify-between gap-3 border-b border-border py-2 px-3 last:border-b-0">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("match.winnings")}</span>
            <span className="text-right text-sm text-slate-800">{winnings.home} · {winnings.away}</span>
          </li>
        ) : null}
        {weather ? (
          <li className="flex items-baseline justify-between gap-3 border-b border-border py-2 px-3 last:border-b-0">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("match.weatherSection")}</span>
            <span className="text-right text-sm text-slate-800">{weather.label}</span>
          </li>
        ) : null}
        {casualties && casualties.items.length > 0 ? (
          <li className="flex items-baseline justify-between gap-3 border-b border-border py-2 px-3 last:border-b-0">
            <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("match.casualtiesSection")}</span>
            <span className="text-right text-sm text-slate-800">
              {casualties.items.map((c) => `${c.playerName ?? "—"}: ${c.label}`).join(" · ")}
            </span>
          </li>
        ) : null}
      </ul>

      {pe && pe.home.concat(pe.away).length > 0 ? (
        <div className="border-t border-border px-4 py-3">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">{t("match.peSection")}</h3>
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
        <div className="border-t-2 border-red bg-navy px-4 py-3 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wide text-border-subtle">{t("match.playerOfMatch")}</p>
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
 * The active (consent/ready/live) state — mirrors the legacy LiveActiveMatch:
 * opens the SSE channel, derives the merged state and renders the consent
 * panel or the live acta chrome. Mounted ONLY for a startable/live fixture so
 * the channel opens exactly when legacy opens it.
 */
function ActiveMatchBody({
  detail,
  leagueId,
  fixtureId,
  viewerSide,
  scheduled,
  league,
  onRefresh,
}: {
  detail: MatchDetail;
  leagueId: string;
  fixtureId: string;
  viewerSide: "home" | "away" | null;
  scheduled: boolean;
  league: LeagueAccess;
  onRefresh: () => Promise<void>;
}) {
  const { t } = useI18n();
  const { live: hookLive, sendCommand } = useLiveMatch({ leagueId, fixtureId });
  const state = useMemo<LiveMatchViewState>(
    () => ({
      ...(hookLive != null && "activeSide" in hookLive ? hookLive : detail.live ?? { ...emptyPendingView(), viewerSide }),
      viewerSide,
    }),
    [hookLive, detail.live, viewerSide],
  );
  const clock = useLiveClock(state);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const busyRef = useRef(false);

  // RAU-44: one-shot refetch when the SSE state reaches finished so the
  // persisted summary takes over (same contract as legacy).
  const finishedNotified = useRef(false);
  useEffect(() => {
    if (state.status === "finished" && !finishedNotified.current) {
      finishedNotified.current = true;
      onRefresh();
    }
  }, [state.status, onRefresh]);

  const act = async (cmd: LiveCommand) => {
    if (busyRef.current) return;
    busyRef.current = true;
    setError(null);
    setSubmitting(true);
    try {
      await sendCommand(cmd);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("match.executeError"));
    } finally {
      busyRef.current = false;
      setSubmitting(false);
    }
  };

  const events = hookLive != null && hookLive.events.length > 0 ? hookLive.events : detail.live?.events ?? [];
  const now = state.startedAt != null ? state.startedAt + clock.elapsed : 0;
  const names = { home: detail.homeTeam.name, away: detail.awayTeam.name };
  const pendingOrReady = state.status === "pending" || state.status === "ready";

  return (
    <>
      {/* MVA-1/MVA-2 + MVA-3 stepper half: the Acta en Vivo shell (artboard 08). */}
      <ActaSheetHeader
        leagueName={league.name}
        round={detail.fixture.round}
        status={state.status}
        half={state.half}
        turnNumber={state.turnNumber}
        home={{
          name: detail.homeTeam.name,
          score: state.homeScore,
          rerolls: league.teamRerolls?.[detail.homeTeam.id] ?? null,
          bribes: bribesOf(detail, "home"),
        }}
        away={{
          name: detail.awayTeam.name,
          score: state.awayScore,
          rerolls: league.teamRerolls?.[detail.awayTeam.id] ?? null,
          bribes: bribesOf(detail, "away"),
        }}
        weather={detail.result?.weather ?? null}
        casualtyTurns={casualtyTurnsOf(events, state.half)}
      />
      {pendingOrReady ? (
        <div data-testid="ui-v2-match-consent">
          <ConsentPanel
            state={state}
            names={names}
            scheduled={scheduled}
            onConsent={(side) => void act({ type: "consent", side })}
            onRetract={(side) => void act({ type: "retractConsent", side })}
            onBegin={() => void act({ type: "begin" })}
            submitting={submitting}
          />
        </div>
      ) : (
        <>
          {events.length > 0 ? (
            <div data-testid="ui-v2-match-acta" className="bg-background">
              <LiveEventCardsActa
                events={events}
                startedAt={state.startedAt}
                homeTeam={detail.homeTeam}
                awayTeam={detail.awayTeam}
                now={now}
              />
            </div>
          ) : null}
          <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-4">
            <div className="min-w-0">
              {error ? (
                <p role="alert" className="mt-1 text-sm text-red-600">
                  {error}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {/* LM-13/D14: the non-active coach may request the turn. */}
              {state.viewerSide !== null && state.viewerSide !== state.activeSide ? (
                <button
                  type="button"
                  onClick={() => void act({ type: "requestTurn" })}
                  disabled={state.status !== "live" || submitting}
                  className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-background"
                >
                  {t("match.requestTurn")}
                </button>
              ) : null}
            </div>
          </div>
          {/* MVT-7: the contextual action dock (fixed bottom bar). */}
          <div data-testid="ui-v2-match-dock">
            <LiveActionDock
              viewerSide={state.viewerSide}
              activeSide={state.activeSide}
              status={state.status}
              roster={state.viewerSide === "away" ? detail.awayTeam.players : detail.homeTeam.players}
              opponentRoster={state.viewerSide === "away" ? detail.homeTeam.players : detail.awayTeam.players}
              rosterRaceId={state.viewerSide === "away" ? detail.awayTeam.raceId : detail.homeTeam.raceId}
              opponentRaceId={state.viewerSide === "away" ? detail.homeTeam.raceId : detail.awayTeam.raceId}
              onSubmit={act}
            />
          </div>
          {/* Spacer so the fixed dock never covers the tail of the feed. */}
          <div aria-hidden className="h-20" />
        </>
      )}
    </>
  );
}

/** The finished state — summary rows + resume banner + shared resolve modal. */
function FinishedMatchBody({
  detail,
  league,
  viewerSide,
  onRefresh,
  resolveOpen,
  onResolve,
  onResolveClose,
}: {
  detail: MatchDetail;
  league: LeagueAccess;
  viewerSide: "home" | "away" | null;
  onRefresh: () => Promise<void>;
  resolveOpen: boolean;
  onResolve: () => void;
  onResolveClose: () => void;
}) {
  const { t } = useI18n();
  const live = detail.live;
  // The parent only mounts this zone with a live row, so the fallback shape
  // never renders (kept as a defensive guard).
  if (live == null) return null;
  const names = { home: detail.homeTeam.name, away: detail.awayTeam.name };
  const rows = buildSummaryFeedRows(detail);
  const ownStep = viewerSide
    ? (live.resolutionState?.[viewerSide]?.step ?? "winnings")
    : (live.resolutionState?.home?.step ?? "winnings");
  const stepLabel = t(resolutionStepKey(ownStep));

  return (
    <>
      {/* MVA-1/MVA-2 + MVA-3 stepper half: the Acta en Vivo shell (artboard 08). */}
      <ActaSheetHeader
        leagueName={league.name}
        round={detail.fixture.round}
        status={live.status}
        half={live.half}
        turnNumber={live.turnNumber}
        home={{
          name: detail.homeTeam.name,
          score: detail.result?.scores.home.score ?? live.homeScore,
          rerolls: league.teamRerolls?.[detail.homeTeam.id] ?? null,
          bribes: bribesOf(detail, "home"),
        }}
        away={{
          name: detail.awayTeam.name,
          score: detail.result?.scores.away.score ?? live.awayScore,
          rerolls: league.teamRerolls?.[detail.awayTeam.id] ?? null,
          bribes: bribesOf(detail, "away"),
        }}
        weather={detail.result?.weather ?? null}
        casualtyTurns={casualtyTurnsOf(live.events, live.half)}
      />
      {detail.result == null ? (
        <div
          data-testid="ui-v2-match-resolve-banner"
          className="flex flex-wrap items-center justify-between gap-3 border-b border-red bg-background px-3.5 py-2"
        >
          <div className="min-w-0">
            <p className="text-sm font-bold text-navy">{t("match.resolve.resumeTitle")}</p>
            <p className="text-xs text-slate-600">{t("match.resolve.resumeHint")}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">
              {t("match.resolve.resumeStep", { step: stepLabel })}
            </p>
          </div>
          <button
            type="button"
            onClick={onResolve}
            className="rounded-sm bg-navy px-3 py-1.5 text-xs font-bold text-white hover:bg-navy-hover"
          >
            {t("match.resolve.resumeAction")}
          </button>
        </div>
      ) : null}
      {rows.length > 0 ? (
        <ul data-testid="ui-v2-match-summary" className="flex flex-col gap-0.5 bg-background py-1">
          {rows.map((row, i) => (
            <SummaryRowView key={`${row.type}-${i}`} row={row} names={names} />
          ))}
        </ul>
      ) : null}
      <div className="bg-background">
        <LiveEventCardsActa
          events={live.events}
          startedAt={live.startedAt}
          homeTeam={detail.homeTeam}
          awayTeam={detail.awayTeam}
          now={live.startedAt != null ? live.startedAt + live.elapsed : 0}
        />
      </div>
      {resolveOpen ? (
        <MatchResolveModal
          open={resolveOpen}
          detail={detail}
          onClose={onResolveClose}
          onNominated={onRefresh}
        />
      ) : null}
    </>
  );
}

/** The root surface: resolves the detail + league access once and passes the
 *  league facts (S5 name → the shell's status line, team rerolls → the
 *  subheader blocks) down to the zones that render the Acta en Vivo shell. */
export function MatchViewV2({ leagueId, fixtureId }: MatchViewV2Props) {
  const { t } = useI18n();
  const { data: session } = useSession();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [shareState, setShareState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const [resetOpen, setResetOpen] = useState(false);
  const [resolveOpen, setResolveOpen] = useState(false);
  const league = useLeague(leagueId);

  const refresh = useCallback(async () => {
    try {
      const match = await getMatchDetail(leagueId, fixtureId);
      setDetail(match);
      setError(null);
      setNotFound(false);
    } catch (e: unknown) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setError(e instanceof Error ? e.message : t("match.loadError"));
      }
    }
  }, [leagueId, fixtureId, t]);

  useEffect(() => {
    // Cancelled-flag guard: a stale response must not regress the state
    // (same contract as the legacy `useMatchDetail`).
    let cancelled = false;
    getMatchDetail(leagueId, fixtureId)
      .then((match) => {
        if (cancelled) return;
        setDetail(match);
        setError(null);
        setNotFound(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const status = (e as { status?: number }).status;
        if (status === 404) {
          setNotFound(true);
        } else {
          setError(e instanceof Error ? e.message : t("match.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, fixtureId, t]);

  // RAU-49: auto-open the resolution flow once when the match TRANSITIONS to
  // finished via refresh (a page load that starts finished shows the banner).
  const prevLiveStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const liveStatus = detail?.live?.status ?? null;
    const prev = prevLiveStatusRef.current;
    prevLiveStatusRef.current = liveStatus;
    if (liveStatus === "finished" && prev != null && prev !== "finished") {
      setResolveOpen(true);
    }
  }, [detail?.live?.status]);

  if (notFound) {
    return (
      <div data-testid="ui-v2-match-not-found" className="border border-border bg-panel p-8 text-center">
        <p className="text-sm text-slate-600">{t("match.notFound")}</p>
        <Link
          href="/leagues"
          className="mt-4 inline-block bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy-hover"
        >
          {t("leagues.backToLeagues")}
        </Link>
      </div>
    );
  }

  if (!loading && !detail) {
    return (
      <div data-testid="ui-v2-match-error" className="border border-border bg-panel p-8 text-center">
        <p className="text-sm text-slate-600">{error ?? t("match.loadError")}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div
        data-testid="ui-v2-match-loading"
        className="flex min-h-[200px] items-center justify-center bg-panel p-8"
      >
        <p className="text-sm text-slate-500" role="status">
          {t("match.loading")}
        </p>
      </div>
    );
  }

  // D19: viewer side from the session against the two team owners (legacy
  // derivation — the DTO carries it otherwise).
  const viewerSide: "home" | "away" | null =
    session?.user?.id == null
      ? null
      : detail.homeTeam.user?.id === session.user.id
        ? "home"
        : detail.awayTeam.user?.id === session.user.id
          ? "away"
          : null;
  const sessionUser = session?.user;
  const canShare =
    sessionUser?.id != null &&
    (viewerSide != null || league.ownerId === sessionUser.id || can(sessionUser.role, "live.manage"));
  const canResetLive =
    sessionUser?.id != null &&
    detail.live != null &&
    detail.live.status !== "finished" &&
    league.status !== "finished" &&
    (league.ownerId === sessionUser.id || can(sessionUser.role, "live.manage"));

  const onShare = async () => {
    setShareState("copying");
    try {
      const { token } = await createShareLink(leagueId, fixtureId);
      await copyToClipboard(`${window.location.origin}/watch/${encodeURIComponent(token)}`);
      setShareState("copied");
    } catch {
      setShareState("error");
    }
  };

  const onReset = async () => {
    await resetLiveMatch(leagueId, fixtureId);
    await refresh();
  };

  const summary = buildMatchSummary(detail, t);

  let body: ReactNode;
  if (detail.live) {
    if (detail.live.status === "finished") {
      body = (
        <FinishedMatchBody
          detail={detail}
          viewerSide={viewerSide}
          league={league}
          onRefresh={refresh}
          resolveOpen={resolveOpen}
          onResolve={() => setResolveOpen(true)}
          onResolveClose={() => setResolveOpen(false)}
        />
      );
    } else {
      body = (
        <ActiveMatchBody
          detail={detail}
          leagueId={leagueId}
          fixtureId={fixtureId}
          viewerSide={viewerSide}
          scheduled={detail.fixture.status === "scheduled"}
          league={league}
          onRefresh={refresh}
        />
      );
    }
  } else if (summary.walkover) {
    body = (
      <div data-testid="ui-v2-match-walkover" className="border border-border bg-panel px-4 py-4 text-center">
        <p className="font-display text-3xl font-semibold leading-none text-navy">
          {detail.fixture.homeScore} <span className="text-endzone">–</span> {detail.fixture.awayScore}
        </p>
        <p className="mt-2 text-sm font-semibold text-red">{t("match.walkover")}</p>
      </div>
    );
  } else if (detail.fixture.status === "scheduled" || detail.fixture.status === "pending") {
    body = (
      <ActiveMatchBody
        detail={detail}
        leagueId={leagueId}
        fixtureId={fixtureId}
        viewerSide={viewerSide}
        scheduled={detail.fixture.status === "scheduled"}
        league={league}
        onRefresh={refresh}
      />
    );
  } else {
    body = <PlayedSections sections={summary.sections} />;
  }

  return (
    <section aria-label={t("match.pageAria", { round: detail.fixture.round })}>
      {canShare || canResetLive ? (
        <div className="flex flex-wrap items-center justify-end gap-2 border-b border-border bg-panel px-3 py-1.5">
          {shareState === "error" ? (
            <p role="alert" className="mr-auto text-[11px] font-semibold text-red">
              {t("match.shareError")}
            </p>
          ) : null}
          {canShare ? (
            <button
              type="button"
              data-testid="ui-v2-match-share"
              onClick={() => void onShare()}
              disabled={shareState === "copying"}
              className="rounded-sm border border-navy px-2.5 py-1 text-[11px] font-semibold text-navy hover:bg-navy hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-navy disabled:cursor-not-allowed disabled:opacity-50"
            >
              {shareState === "copied" ? t("match.shareCopied") : t("match.share")}
            </button>
          ) : null}
          {canResetLive ? (
            <button
              type="button"
              data-testid="ui-v2-match-reset"
              onClick={() => setResetOpen(true)}
              className="rounded-sm border border-red px-2.5 py-1 text-[11px] font-semibold text-red hover:bg-red hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-red"
            >
              {t("reset.action")}
            </button>
          ) : null}
        </div>
      ) : null}
      {body}
      <ResetLiveMatchModal
        open={resetOpen}
        onConfirm={onReset}
        onClose={() => setResetOpen(false)}
      />
    </section>
  );
}
