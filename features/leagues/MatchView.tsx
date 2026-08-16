"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { PE_MVP } from "@/lib/rules";
import { resolveInjury } from "@/lib/rules/injuries";
import { getRaceById } from "@/features/teams/data/races";
import { deriveTeamStats, type TeamStats } from "@/lib/liveFeed";
import { getMatchDetail, type LiveMatchView, type LiveMatchViewState, type LiveCommand, type MatchDetail, type MatchTeamDetail } from "./api";
import { buildMatchSummary, buildSummaryFeedRows, casualtyKindLabel, type MatchSummarySection, type SummaryFeedRow } from "./matchSummary";
import { LiveEventCards } from "./liveEventCards";
import { causeLabel } from "./liveEventLabels";
import { MatchTimelineBar } from "./matchTimelineBar";
import { Icon } from "./icons";
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
  const { t } = useI18n();

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
        setError(e instanceof Error ? e.message : t("match.loadError"));
      }
    } finally {
      setLoading(false);
    }
  }, [leagueId, fixtureId, t]);

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

/** Formats a millisecond value as H:MM:SS (clocks, count-up, v7 format). */
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
    concedeProposedBy: null,
    pendingCasualty: null,
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

/**
 * RAU-38 concession controls in the turn zone (visible to BOTH coaches while
 * live): the "Conceder" outline-red button expands to an inline confirm
 * ("¿Conceder el partido?" → "Sí, conceder" / "Cancelar") before firing the
 * proposal. Once a proposal is pending the PROPOSER sees "Esperando respuesta
 * del rival…" and the rival sees "El rival se rinde" with "Aceptar" /
 * "Rechazar". The server stays authoritative — the POST route enforces live +
 * side + responder roles (a bypass returns 409).
 */
function ConcedeControls({
  viewerSide,
  proposedBy,
  submitting,
  onPropose,
  onRespond,
}: {
  viewerSide: "home" | "away";
  proposedBy: "home" | "away" | null;
  submitting: boolean;
  onPropose: () => void;
  onRespond: (accept: boolean) => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const { t } = useI18n();

  if (proposedBy != null) {
    if (proposedBy === viewerSide) {
      return (
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#ffd9e0]">
          {t("match.concede.waiting")}
        </span>
      );
    }
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#ffd9e0]">
          {t("match.concede.rivalSurrenders")}
        </span>
        <button
          type="button"
          onClick={() => onRespond(true)}
          disabled={submitting}
          className="rounded-[4px] bg-[#d11938] px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-white hover:bg-[#b0142f] disabled:opacity-50"
        >
          {t("match.concede.accept")}
        </button>
        <button
          type="button"
          onClick={() => onRespond(false)}
          disabled={submitting}
          className="rounded-[4px] border border-[#d11938] bg-white px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-[#d11938] hover:bg-[#fdeef0] disabled:opacity-50"
        >
          {t("match.concede.reject")}
        </button>
      </div>
    );
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#ffd9e0]">
          {t("match.concede.confirm")}
        </span>
        <button
          type="button"
          onClick={() => {
            setConfirming(false);
            onPropose();
          }}
          disabled={submitting}
          className="rounded-[4px] bg-[#d11938] px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-white hover:bg-[#b0142f] disabled:opacity-50"
        >
          {t("match.concede.yes")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={submitting}
          className="rounded-[4px] border border-[#d11938] bg-white px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-[#d11938] hover:bg-[#fdeef0] disabled:opacity-50"
        >
          {t("common.cancel")}
        </button>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setConfirming(true)}
      disabled={submitting}
      className="rounded-[4px] border border-[#d11938] bg-white px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-[#d11938] hover:bg-[#fdeef0] disabled:opacity-50"
    >
      {t("match.concede.action")}
    </button>
  );
}

/**
 * RAU-39 casualty confirm panel in the turn zone: while a casualty proposal is
 * pending, the PROPOSER (the attacker) sees "Esperando confirmación del
 * rival…"; the defender (perjudicado) sees "El rival registra una baja" with the
 * derived details (víctima, causa, tirada 1D16, banda derivada — the band is
 * DERIVED client-side for display ONLY, the server is authoritative) and a
 * "Confirmar" button that fires `{ type: "confirmCasualty" }`. There is NO
 * reject — the defender can only confirm. The server stays authoritative — a
 * bypass POST by the proposer returns 409.
 */
function CasualtyConfirmControls({
  viewerSide,
  pending,
  submitting,
  onConfirm,
  homeTeam,
  awayTeam,
}: {
  viewerSide: "home" | "away";
  pending: LiveMatchViewState["pendingCasualty"];
  submitting: boolean;
  onConfirm: () => void;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
}) {
  const { t } = useI18n();
  if (pending == null) return null;
  // The victim is on the side OPPOSITE the proposer (LM-12 invariant).
  const victimTeam = pending.proposerSide === "home" ? awayTeam : homeTeam;
  const victim = victimTeam.players.find((p) => p.rosterPlayerId === pending.victimRosterId);
  const band = resolveInjury(pending.roll16);
  const attribute = pending.roll6 != null
    ? band.kind === "permanent"
      ? pending.roll6 <= 2
        ? "AR"
        : pending.roll6 === 3
          ? "MV"
          : pending.roll6 === 4
            ? "PS"
            : pending.roll6 === 5
              ? "AG"
              : "ST"
      : null
    : null;
  const bandText = casualtyKindLabel(band.kind, t);
  const bandLabel = attribute ? `${bandText} (−${attribute})` : bandText;

  if (pending.proposerSide === viewerSide) {
    return (
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#ffd9e0]">
        {t("match.casualty.waiting")}
      </span>
    );
  }

  return (
    <div className="flex flex-col items-end gap-1">
      <span className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#ffd9e0]">
        {t("match.casualty.rivalRegisters")}
      </span>
      <span className="max-w-[220px] text-right text-[10px] font-semibold text-white">
        {t("match.casualty.details", {
          victim: victim?.name ?? "?",
          cause: causeLabel(pending.cause, t),
          roll: pending.roll16,
          band: bandLabel,
        })}
      </span>
      <button
        type="button"
        onClick={onConfirm}
        disabled={submitting}
        className="rounded-[4px] bg-[#d11938] px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-white hover:bg-[#b0142f] disabled:opacity-50"
      >
        {t("match.casualty.confirm")}
      </button>
    </div>
  );
}

/** The two-team matchup header shown in the centered consent panel. */function MatchupLine({ names }: { names: { home: string; away: string } }) {
  return (
    <p className="text-sm font-black uppercase tracking-wide text-[#12225a]">
      {names.home} <span className="text-[#d11938]">·</span> {names.away}
    </p>
  );
}

/**
 * Two-phase consent / ready / begin panel (LM-11/LM-3/D19). Rendered when a
 * startable fixture has no live row yet (`live: null` → "Iniciar partido") or a
 * `pending`/`ready` row (retract / "Empezar partido"). The viewer's side comes
 * from the DTO's `viewerSide` (D19); the panel only shows the controls for the
 * current viewer's side. The header distinguishes an agreed date ("Partido
 * programado") from an unscheduled fixture ("Partido sin programar") — the
 * negotiation is an optional reminder, never a gate on starting.
 */
function LiveConsentPanel({
  state,
  names,
  scheduled,
  onConsent,
  onRetract,
  onBegin,
  submitting,
}: {
  state: LiveMatchViewState | null;
  names: { home: string; away: string };
  scheduled: boolean;
  onConsent: (side: "home" | "away") => void;
  onRetract: (side: "home" | "away") => void;
  onBegin: () => void;
  submitting: boolean;
}) {
  const { t } = useI18n();
  const side = state?.viewerSide ?? null;
  const pending = state == null || state.status === "pending";
  const ready = state?.status === "ready";

  if (pending && side === null) {
    return (
      <div className="border border-[#e2e8f0] bg-white px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-sm font-semibold text-slate-600">
          {t("match.consent.waiting")}
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
              className="rounded-md border border-[#12225a] px-4 py-2 text-sm font-semibold text-[#12225a] hover:bg-[#f8fafc]"
            >
              {t("match.consent.retract")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => onConsent(side)}
              disabled={submitting}
              className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48]"
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
      <div className="border border-[#e2e8f0] bg-white px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#12225a]">{t("match.consent.readyToStart")}</p>
        <p className="mt-2 text-sm text-slate-700">{t("match.consent.bothConfirmed")}</p>
        <div className="mt-4 flex flex-wrap justify-center gap-3">
          <button
            type="button"
            onClick={onBegin}
            disabled={submitting}
            className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48]"
          >
            {t("match.consent.begin")}
          </button>
          <button
            type="button"
            onClick={() => onRetract(side)}
            disabled={submitting}
            className="rounded-md border border-[#12225a] px-4 py-2 text-sm font-semibold text-[#12225a] hover:bg-[#f8fafc]"
          >
            {t("match.consent.retract")}
          </button>
        </div>
      </div>
    );
  }

  if (ready && side === null) {
    return (
      <div className="border border-[#e2e8f0] bg-white px-4 py-6 text-center">
        <MatchupLine names={names} />
        <p className="mt-3 text-sm font-bold text-[#12225a]">{t("match.consent.readyToStartBoth")}</p>
        <p className="mt-2 text-xs text-slate-500">{t("match.consent.bothConfirmed")}</p>
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
  const { t } = useI18n();
  const first = current > 8 ? 9 : 1;
  return (
    <div aria-label={t("match.turnsOf", { team: sideName })} className="flex items-center gap-1">
      {Array.from({ length: 8 }, (_, i) => first + i).map((n) => {
        const active = isActive && n === current;
        return (
          <span
            key={n}
            aria-label={t("match.turnOfNumber", { n })}
            aria-current={active ? "true" : undefined}
            className={`flex h-[21px] w-[21px] items-center justify-center rounded-[3px] text-[10px] font-bold ${
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
 * The v7 Tourplay navy header, three stacked rows:
 *  row 1 (top-row): back arrow (32px circle) + league·jornada label + the
 *    count-up (timer SVG + total elapsed H:MM:SS, right-aligned);
 *  row 2 (turn-row): home turn track · the red TURNO button ("Dar el turno"
 *    with the "Turno {team}" small line) · away turn track;
 *  row 3 (clock-row): per-coach H:MM:SS clocks + the translucent half badge
 *    ("1ª Parte"/"2ª Parte") + the always-visible "Mitad H · Turno N" note.
 * The rows render UNIFORMLY in every fixture state (pending/scheduled/live/
 * finished); only the LIVE-specific elements are gated: both turn tracks show
 * the SAME global numbers with the ACTIVE side's current turn highlighted ONLY
 * while live (inert otherwise — no `aria-current`), the clocks/count-up show
 * H:MM:SS while live (or the frozen base value once it carries real time) and
 * "–" before kickoff, and the red TURNO button (with its "Turno {team}"
 * status line) renders ONLY when `status === "live"` AND the viewer is the
 * active participant (spectator/admin → hidden). All strings stay byte-identical
 * where the e2e/unit suites assert them. The unified "Tiempo" clock lives in
 * the hero scoreboard.
 */
function LiveTopBar({
  state,
  clock,
  label,
  names,
  leagueId,
  turnControls,
  concedeControls,
  casualtyControls,
}: {
  state: LiveMatchViewState;
  clock: DisplayClock;
  label: string;
  names: { home: string; away: string };
  leagueId: string;
  turnControls: { isActive: boolean; submitting: boolean; onEndTurn: () => void };
  /** RAU-38: the turn-zone concede controls (null when the viewer has no side
   * or the match is not live — the FinishedLiveView passes nothing). */
  concedeControls?: React.ReactNode;
  /** RAU-39: the turn-zone casualty confirm panel (same gating as concede). */
  casualtyControls?: React.ReactNode;
}) {
  const { t } = useI18n();
  const live = state.status === "live";
  const globalTurn = state.half === 2 ? state.turnNumber + 8 : state.turnNumber;
  // Inert pre-kickoff clocks render "–"; once a value exists (live or finished)
  // the H:MM:SS (base or ticking) renders.
  const clockValue = (ms: number) => (live || ms > 0 ? <FormatHms ms={ms} /> : "–");
  const showTurnControls = live && turnControls.isActive;
  return (
    <>
      {/* Row 1 — back + label + count-up. */}
      <div className="flex items-center gap-2.5 border-b border-white/10 px-3 py-2">
        {/* MVT-3 back arrow to the jornada (UI-only, existing DTO). */}
        <Link
          href={`/leagues/${leagueId}`}
          aria-label={t("match.backToJornada")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-white/30 bg-white/[0.08] text-white hover:border-white"
        >
          <Icon name="back" className="h-[18px] w-[18px]" />
        </Link>
        <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.04em] text-[#cbd5e1]">
          {label}
        </p>
        <span className="ml-auto flex items-center gap-1 text-xs font-extrabold tabular-nums text-white">
          <Icon name="timer" className="h-3.5 w-3.5 text-[#cbd5e1]" />
          {clockValue(clock.elapsed)}
        </span>
      </div>
      {/* Row 2 — home track · TURNO button · away track. */}
      <div className="flex flex-wrap items-center justify-center gap-2.5 px-3 pt-[7px] pb-0.5">
        <TurnTrack
          sideName={names.home}
          current={globalTurn}
          isActive={live && state.activeSide === "home"}
        />
        {showTurnControls ? (
          <button
            type="button"
            onClick={turnControls.onEndTurn}
            disabled={turnControls.submitting}
            className="flex items-center gap-1.5 rounded-[4px] bg-[#d11938] px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-white hover:bg-[#b0142f] disabled:opacity-50"
          >
            <small
              role="status"
              className="text-[9px] font-bold uppercase tracking-[0.03em] text-[#ffd9e0]"
            >
              {t("match.turnOfTeam", { team: names[state.activeSide] })}
            </small>
            {t("match.endTurn")}
          </button>
        ) : null}
        {/* RAU-38: the concede controls sit in the turn zone next to the turn
            button — both coaches see them while live (submitting disabled). */}
        {concedeControls}
        {/* RAU-39: the casualty confirm panel sits in the same turn zone. */}
        {casualtyControls}
        <TurnTrack
          sideName={names.away}
          current={globalTurn}
          isActive={live && state.activeSide === "away"}
        />
      </div>
      {/* Row 3 — per-coach clocks + half indicator. */}
      <div className="flex items-center justify-between gap-2 px-4 pt-0.5 pb-[7px] text-[11px] font-bold tabular-nums">
        <span className="flex items-center gap-1 text-white">
          <Icon name="timer" className="h-[13px] w-[13px] text-[#cbd5e1]" />
          {clockValue(clock.homeTurnMs)}
        </span>
        <span className="flex items-center gap-2">
          <span className="rounded-[3px] border border-[rgba(209,25,56,0.45)] bg-[rgba(209,25,56,0.25)] px-2 py-[1px] text-[10px] font-black uppercase tracking-[0.05em] text-white">
            {state.half === 2 ? t("match.halfTwo") : t("match.halfOne")}
          </span>
          <span className="text-[11px] font-semibold text-[#cbd5e1]">
            {t("match.halfTurn", { half: state.half, turn: state.turnNumber })}
          </span>
        </span>
        <span className="flex items-center gap-1 text-white">
          <Icon name="timer" className="h-[13px] w-[13px] text-[#cbd5e1]" />
          {clockValue(clock.awayTurnMs)}
        </span>
      </div>
    </>
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
    <div className="mt-[3px] flex flex-wrap justify-center gap-[5px]">
      {pills.map((pill) => (
        <span
          key={pill.key}
          data-testid={`mini-${pill.key}-${side}`}
          className="flex items-center gap-[3px] rounded-[3px] bg-white/15 px-1.5 py-[1px] text-[10px] text-white"
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
    <div className="flex min-w-0 flex-col items-center gap-[3px]">
      <TeamEmblem teamId={teamId} name={name} size="xl" className="border-2 border-white/[0.28]" />
      <p className="max-w-full truncate text-base font-black uppercase tracking-[0.02em] text-white">
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
 * final score once finished. The v7 "En juego · Tiempo H:MM:SS" mini-line
 * renders ONLY while live (it ticks client-side; a frozen elapsed would be
 * inert noise on a pre-live or finished page).
 */
function LiveScoreboard({ state, clock }: { state: LiveMatchViewState; clock: DisplayClock }) {
  const { t } = useI18n();
  const played = state.status === "live" || state.status === "finished";
  return (
    <div className="px-1.5 text-center">
      <p
        data-testid="live-score"
        aria-label={t("match.scoreboard")}
        className="text-[46px] font-black leading-none tracking-[0.05em] text-white tabular-nums"
      >
        {played ? state.homeScore : "-"}
        <span className="mx-1.5 text-[#d11938]">:</span>
        {played ? state.awayScore : "-"}
      </p>
      {state.status === "live" ? (
        <p className="mt-[7px] text-[10px] font-bold uppercase tracking-[0.04em] text-[#cbd5e1]">
          {t("match.inPlay")} <FormatHms ms={clock.elapsed} />
        </p>
      ) : null}
    </div>
  );
}

/**
 * Hero banner (v7): `1fr auto 1fr` — teams mirrored around the center score,
 * each with its 54px emblem, name, race · coach line and the per-team mini-stat
 * pills, on the navy→dark-red 135deg gradient. The whole view derives the
 * stats once from the event feed via `deriveTeamStats`.
 */
function LiveHero({
  state,
  clock,
  names,
  homeSubtitle,
  awaySubtitle,
  homeTeamId,
  awayTeamId,
  events,
}: {
  state: LiveMatchViewState;
  clock: DisplayClock;
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
    <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2.5 bg-[linear-gradient(135deg,#1b2f6e,#12225a_55%,#5c1020)] px-4 pt-3 pb-2.5">
      <LiveTeamBlock
        name={names.home}
        subtitle={homeSubtitle}
        teamId={homeTeamId}
        stats={sideStats("home")}
        side="home"
        visible={visible}
      />
      <LiveScoreboard state={state} clock={clock} />
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

/** The weather/stadium row (v7): weather is omit/neutral when a live match has
 * none yet; the stadium has no data source → the rulebook-neutral
 * "Reglamentario" always renders. Inline SVG icons flank the two meta labels. */
function LiveMetaRow() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-[#e2e8f0] bg-[#f8fafc] px-3.5 py-1.5 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5">
        <Icon name="weather" className="h-[15px] w-[15px] text-[#12225a]" />
        {t("match.clima")}
      </span>
      <span className="flex items-center gap-1.5">
        {t("match.estadio")}
        <Icon name="helmet" className="h-[15px] w-[15px] text-[#12225a]" />
      </span>
    </div>
  );
}

/**
 * The uniform sticky match header (v7: 3-row top bar + hero + meta row + the
 * timeline bar): rendered for EVERY fixture state (pending/scheduled/live/
 * finished) so the turns, clocks and score stay visible while the body scrolls
 * (`sticky top-0 z-40` on a solid navy background with the v7 drop shadow).
 * Only the LIVE-specific elements inside are gated by `state.status === "live"`
 * (see LiveTopBar/LiveScoreboard).
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
  leagueId,
  events,
  homeTeam,
  awayTeam,
  turnControls,
  concedeControls,
  casualtyControls,
}: {
  state: LiveMatchViewState;
  clock: DisplayClock;
  label: string;
  names: { home: string; away: string };
  homeSubtitle: string;
  awaySubtitle: string;
  homeTeamId: string;
  awayTeamId: string;
  leagueId: string;
  events: LiveMatchView["events"];
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
  turnControls: { isActive: boolean; submitting: boolean; onEndTurn: () => void };
  concedeControls?: React.ReactNode;
  casualtyControls?: React.ReactNode;
}) {
  return (
    <div
      data-testid="tourplay-header"
      className="sticky top-0 z-40 border-b border-[#1f3a7a] bg-[#12225a] shadow-[0_6px_16px_rgba(15,23,42,0.18)]"
    >
      <LiveTopBar
        state={state}
        clock={clock}
        label={label}
        names={names}
        leagueId={leagueId}
        turnControls={turnControls}
        concedeControls={concedeControls}
        casualtyControls={casualtyControls}
      />
      <LiveHero
        state={state}
        clock={clock}
        names={names}
        homeSubtitle={homeSubtitle}
        awaySubtitle={awaySubtitle}
        homeTeamId={homeTeamId}
        awayTeamId={awayTeamId}
        events={events}
      />
      <LiveMetaRow />
      <MatchTimelineBar
        events={events}
        startedAt={state.startedAt}
        finishedAt={state.finishedAt}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
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
  scheduled,
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
  scheduled: boolean;
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
  const { t } = useI18n();

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
      setError(e instanceof Error ? e.message : t("match.executeError"));
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

  // RAU-38: the concede controls render only while the match is LIVE and the
  // viewer has a side (a spectator/admin or a finished match never sees them).
  const concedeControls =
    state.status === "live" && state.viewerSide != null ? (
      <ConcedeControls
        viewerSide={state.viewerSide}
        proposedBy={state.concedeProposedBy}
        submitting={submitting}
        onPropose={() => void act({ type: "concede" })}
        onRespond={(accept) => void act({ type: "concedeRespond", accept })}
      />
    ) : null;

  // RAU-39: the casualty confirm panel (same gating). The defender confirms the
  // ACTIVE coach's proposal; the proposer sees the waiting copy. Null when the
  // view still lacks a `pendingCasualty` (older persisted rows / no proposal).
  const casualtyControls =
    state.status === "live" && state.viewerSide != null && state.pendingCasualty != null ? (
      <CasualtyConfirmControls
        viewerSide={state.viewerSide}
        pending={state.pendingCasualty}
        submitting={submitting}
        onConfirm={() => void act({ type: "confirmCasualty" })}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
    ) : null;

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
        leagueId={leagueId}
        events={events}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        turnControls={{
          isActive: state.viewerSide === state.activeSide,
          submitting,
          onEndTurn: () => void act({ type: "endTurn", side: state.activeSide }),
        }}
        concedeControls={concedeControls}
        casualtyControls={casualtyControls}
      />

      {state.status === "pending" || state.status === "ready" ? (
        <>
          <LiveConsentPanel
            state={state}
            names={names}
            scheduled={scheduled}
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
              {t("match.rivalRequestsTurn")}
            </p>
          ) : null}
          <LiveEventCards
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
                  {t("match.requestTurn")}
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
            opponentRoster={state.viewerSide === "away" ? homeTeam.players : awayTeam.players}
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
      <LiveEventCards
        events={live.events}
        startedAt={live.startedAt}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
    </div>
  );
}

/** Format a coin amount as "+45.000 gp." (Spanish thousands separator). */
function formatCoins(value: number): string {
  return `+${value.toLocaleString("es-ES")} gp.`;
}

/** One row of the finished-feed snapshot summary (MVT-4): rendered ABOVE the
 * event cards. Derived from the `MatchResult` snapshot — never a new event kind
 * (MV-6/LM-16) and never duplicating the event-derived MVP rows. */
function SummaryFeedRowView({ row }: { row: SummaryFeedRow }) {
  const { t } = useI18n();
  switch (row.type) {
    case "reported":
      return (
        <li
          data-testid="summary-row-reported"
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
        <li
          data-testid="summary-row"
          className="flex items-center gap-3 bg-white px-3 py-1.5 text-[12px]"
        >
          <span aria-hidden="true" className="shrink-0 text-center">
            {row.type === "winnings" ? "💰" : "👥"}
          </span>
          <span className="flex-1 font-bold uppercase tracking-wide text-slate-500">
            {row.type === "winnings" ? t("match.winnings") : t("match.fans")}
          </span>
          <span className="flex flex-col items-end gap-0.5 text-right tabular-nums">
            <span className="leading-tight">{row.type === "winnings" ? formatCoins(row.home) : `+${row.home}`}</span>
            <span className="leading-tight">{row.type === "winnings" ? formatCoins(row.away) : `+${row.away}`}</span>
          </span>
        </li>
      );
    case "incentives":
      return (
        <li
          data-testid="summary-row"
          className="flex items-center gap-3 bg-gradient-to-r from-[#12225a]/[0.12] via-[#12225a]/[0.06] to-white px-3 py-1.5 text-[12px]"
        >
          <span aria-hidden="true" className="shrink-0 text-center">💰</span>
          <span className="flex-1">
            <span className="block font-bold uppercase tracking-wide text-slate-500">{t("match.incentives")}</span>
            {/* The snapshot stores a single pettyCash — the inducement chips are
                deferred (MVT-4 open question). */}
            <span className="block text-[11px] font-semibold text-slate-600">{formatCoins(row.value)}</span>
          </span>
        </li>
      );
  }
}

/** The snapshot-driven summary block above the finished-feed cards (MVT-4). */
function SummaryFeedRows({ detail }: { detail: MatchDetail }) {
  const rows = buildSummaryFeedRows(detail);
  if (rows.length === 0) return null;
  return (
    <ol className="flex flex-col gap-2 bg-[#eef1f6] p-1.5">
      {rows.map((row) => (
        <SummaryFeedRowView key={row.type} row={row} />
      ))}
    </ol>
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
  detail,
  leagueLabel,
  names,
  homeSubtitle,
  awaySubtitle,
  homeTeam,
  awayTeam,
  leagueId,
}: {
  live: LiveMatchView;
  detail: MatchDetail;
  leagueLabel: string;
  names: { home: string; away: string };
  homeSubtitle: string;
  awaySubtitle: string;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
  leagueId: string;
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
        leagueId={leagueId}
        events={live.events}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        turnControls={{ isActive: false, submitting: false, onEndTurn: () => {} }}
      />
      {/* MVT-4: snapshot summary rows ABOVE the event timeline. */}
      <SummaryFeedRows detail={detail} />
      <FinishedLiveTimeline live={live} homeTeam={homeTeam} awayTeam={awayTeam} />
    </div>
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
          <SectionRow label={t("match.fansSection")}>
            {fans.home} · {fans.away}
          </SectionRow>
        ) : null}
        {winnings ? (
          <SectionRow label={t("match.winnings")}>
            <Coins value={winnings.home} /> · <Coins value={winnings.away} />
          </SectionRow>
        ) : null}
        {weather ? <SectionRow label={t("match.weatherSection")}>{weather.label}</SectionRow> : null}
        {casualties ? (
          <SectionRow label={t("match.casualtiesSection")}>
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
        <div className="border-t-2 border-[#d11938] bg-[#12225a] px-4 py-3 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#cbd5e1]">{t("match.playerOfMatch")}</p>
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
  const { t } = useI18n();
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
        <p className="text-sm text-slate-600">{t("match.notFound")}</p>
        <Link
          href="/leagues"
          className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
        >
          {t("leagues.backToLeagues")}
        </Link>
      </div>
    );
  }

  if (!loading && !detail) {
    return (
      <div className="border border-[#e2e8f0] bg-white p-8 text-center">
        <p className="text-sm text-slate-600">{error ?? t("match.loadError")}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[200px] items-center justify-center bg-white p-8">
        <p className="text-sm text-slate-500" role="status">
          {t("match.loading")}
        </p>
      </div>
    );
  }

  const summary = buildMatchSummary(detail, t);
  const names = { home: detail.homeTeam.name, away: detail.awayTeam.name };
  // Mockup top-bar label: "{league} · Jornada {round}" (league name resolved
  // client-side; falls back to "Jornada {round}" when unavailable).
  const leagueLabel = `${leagueName ? `${leagueName} · ` : ""}${t("match.jornada", { round: detail.fixture.round })}`;
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
          detail={detail}
          leagueLabel={leagueLabel}
          names={names}
          homeSubtitle={homeSubtitle}
          awaySubtitle={awaySubtitle}
          homeTeam={detail.homeTeam}
          awayTeam={detail.awayTeam}
          leagueId={leagueId}
        />
      ) : (
        <LiveActiveMatch
          live={detail.live}
          leagueId={leagueId}
          fixtureId={fixtureId}
          names={names}
          viewerSide={viewerSide}
          scheduled={detail.fixture.status === "scheduled"}
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
        <p className="mt-2 text-sm font-semibold text-[#d11938]">{t("match.walkover")}</p>
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
        scheduled={true}
        leagueLabel={leagueLabel}
        homeSubtitle={homeSubtitle}
        awaySubtitle={awaySubtitle}
        homeTeam={detail.homeTeam}
        awayTeam={detail.awayTeam}
      />
    );
  } else if (detail.fixture.status === "pending") {
    // A pending fixture (no date agreed yet): the start is ALWAYS available —
    // the same consent panel renders with the "Partido sin programar" header
    // (the date negotiation is just an optional reminder, never a gate).
    body = (
      <LiveActiveMatch
        live={null}
        leagueId={leagueId}
        fixtureId={fixtureId}
        names={names}
        viewerSide={viewerSide}
        scheduled={false}
        leagueLabel={leagueLabel}
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
    // v7: the duplicated "Partido {round}" + Volver page header is GONE — the
    // back navigation lives in the sticky Tourplay header's back arrow (only
    // the notFound/error/loading panels keep their own chrome).
    <section aria-label={t("match.pageAria", { round: detail.fixture.round })}>{body}</section>
  );
}
