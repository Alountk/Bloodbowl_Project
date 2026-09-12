"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { PE_MVP } from "@/lib/rules";
import {
  cartCost,
  effectiveCost,
  getInducement,
  isEligible,
  listInducements,
  maxAllowed,
  type InducementBudget,
  type InducementCartItem,
  type PersistedInducements,
} from "@/lib/rules";
import { deriveTeamStats, type TeamStats } from "@/lib/liveFeed";
import { can } from "@/lib/permissions";
import { createShareLink, getMatchDetail, resetLiveMatch, type LiveMatchView, type LiveMatchViewState, type LiveCommand, type MatchDetail, type MatchTeamDetail } from "./api";
import { buildMatchSummary, buildSummaryFeedRows, type MatchSummarySection, type SummaryFeedRow } from "./matchSummary";
import { LiveEventCards } from "./liveEventCards";
import { MatchTimelineBar } from "./matchTimelineBar";
import { Icon } from "./icons";
import { LiveActionDock } from "./liveActionDock";
import { HeaderEmblem } from "./headerEmblem";
import { useLiveMatch } from "./useLiveMatch";
import { useLiveClock, type DisplayClock } from "./useLiveClock";
import { useLeague } from "./useLeagueName";
import { MatchResolveModal } from "./MatchResolveModal";
import { ResetLiveMatchModal } from "./ResetLiveMatchModal";

/**
 * Copies `text` to the clipboard (MSL-7). Prefers the async Clipboard API and
 * falls back to a hidden textarea + `execCommand` for contexts where
 * `navigator.clipboard` is unavailable (non-secure origin, older webview). The
 * promise rejects when neither path can copy, so the caller can surface an
 * error state.
 */
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
  // Monotonic request seq: a STALE refresh response (an older request landing
  // after a newer one — the wizard fires refreshes concurrently with the
  // modal's poll/actions) must never regress the detail (which would remount
  // the wizard steps mid-flow).
  const seqRef = useRef(0);

  const refresh = useCallback(async () => {
    const seq = ++seqRef.current;
    try {
      const match = await getMatchDetail(leagueId, fixtureId);
      if (seq !== seqRef.current) return;
      setDetail(match);
      setError(null);
      setNotFound(false);
    } catch (e) {
      if (seq !== seqRef.current) return;
      const status = (e as { status?: number }).status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setError(e instanceof Error ? e.message : t("match.loadError"));
      }
    } finally {
      if (seq === seqRef.current) setLoading(false);
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
 * Live match UI (MV-5): the UNIFORM sticky rulebook header (top bar + hero +
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
    mvpNominations: { home: null, away: null },
    resolutionState: { home: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false }, away: { step: "winnings", fansDone: false, fans: null, mvpConfirmed: false, mvpRolled: false, casualtiesDone: false, journeymenDone: false } },
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
 * RAU-43: the shared explanatory modal for INCOMING two-phase events — the
 * rival's concede proposal, or a casualty proposal the rival inflicted. A
 * centered white card over a semi-transparent backdrop (`fixed inset-0 z-50`,
 * above the sticky z-40 header) keeps the match visible behind it. Dismissible
 * ONLY via the action buttons — there is deliberately no backdrop/close click
 * (the two-phase contract: the responder decides, never the backdrop).
 */
function IncomingEventModal({
  ariaLabel,
  title,
  body,
  actions,
}: {
  ariaLabel: string;
  title: string;
  body: React.ReactNode;
  actions: React.ReactNode;
}) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
    >
      <div className="w-full max-w-md border border-border bg-panel shadow-xl">
        <header className="flex items-center justify-between bg-navy px-4 py-3 text-white">
          <h3 className="text-sm font-bold">{title}</h3>
        </header>
        <div className="px-4 py-3">
          {body}
          <div className="mt-4 flex justify-end gap-2">{actions}</div>
        </div>
      </div>
    </div>
  );
}

/**
 * RAU-38 concession controls in the turn zone (visible to BOTH coaches while
 * live): the "Conceder" outline-red button expands to an inline confirm
 * ("¿Conceder el partido?" → "Sí, conceder" / "Cancelar") before firing the
 * proposal. Once a proposal is pending the PROPOSER sees "Esperando respuesta
 * del rival…" inline, and the rival sees an EXPLANATORY MODAL ("El rival se
 * rinde") with "Aceptar" / "Rechazar" (RAU-43). The server stays authoritative
 * — the POST route enforces live + side + responder roles (a bypass returns
 * 409).
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

  // RAU-43: a PENDING proposal from the rival opens the explanatory modal
  // (the proposer's waiting copy below stays inline, no modal).
  if (proposedBy != null && proposedBy !== viewerSide) {
    return (
      <IncomingEventModal
        ariaLabel={t("match.concede.modalAria")}
        title={t("match.concede.rivalSurrenders")}
        body={<p className="text-sm text-slate-600">{t("match.concede.modalBody")}</p>}
        actions={
          <>
            <button
              type="button"
              onClick={() => onRespond(false)}
              disabled={submitting}
              className="rounded-[4px] border border-red bg-panel px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-red hover:bg-error-fill disabled:opacity-50"
            >
              {t("match.concede.reject")}
            </button>
            <button
              type="button"
              onClick={() => onRespond(true)}
              disabled={submitting}
              className="rounded-[4px] bg-red px-3 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-white hover:bg-red-hover disabled:opacity-50"
            >
              {t("match.concede.accept")}
            </button>
          </>
        }
      />
    );
  }

  if (proposedBy === viewerSide) {
    return (
      <span className="text-[11px] font-bold uppercase tracking-[0.05em] text-[#ffd9e0]">
        {t("match.concede.waiting")}
      </span>
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
          className="rounded-[4px] bg-red px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-white hover:bg-red-hover disabled:opacity-50"
        >
          {t("match.concede.yes")}
        </button>
        <button
          type="button"
          onClick={() => setConfirming(false)}
          disabled={submitting}
          className="rounded-[4px] border border-red bg-panel px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-red hover:bg-error-fill disabled:opacity-50"
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
      className="rounded-[4px] border border-red bg-panel px-2.5 py-1.5 text-[11px] font-black uppercase tracking-[0.05em] text-red hover:bg-error-fill disabled:opacity-50"
    >
      {t("match.concede.action")}
    </button>
  );
}

/**
 * IND-1..3/LM-30/S2: the ready-phase inducement purchase step. Rendered ONLY
 * for the eligible coach (the lower-TV side — `budget.side === viewerSide`)
 * while the match is `ready` and the |ΔTV| budget is positive. Shows the
 * server-derived budget, the race-filtered common catalog (effective cost per
 * the team's race, rule-gated entries excluded), add/remove against
 * `maxPerMatch`, the Σ cost + remaining budget, and a confirm that fires the
 * live `purchaseInducements` command (replace-cart semantics: the command's
 * `{id,count}[]` REPLACES the persisted cart — an existing cart renders first
 * so the coach sees what a replace would overwrite). Pending/error/success
 * feedback is a11y-exposed via the disabled button + a `role=status` line.
 * Rulebook-light tokens only; copy is Spanish (match/league convention).
 */
function InducementPurchasePanel({
  budget,
  raceId,
  persisted,
  submitting,
  error,
  onPurchase,
}: {
  /** The server-derived eligible side + |ΔTV| budget (IND-2, fixture GET). */
  budget: Extract<InducementBudget, { side: "home" | "away" }>;
  /** The eligible team's race — effective costs + eligibility resolve on it. */
  raceId: string;
  /** The persisted cart of the eligible side ([] = nothing bought yet). */
  persisted: readonly InducementCartItem[];
  submitting: boolean;
  error: string | null;
  /** Fires the replace-cart purchase command for the eligible side. */
  onPurchase: (items: InducementCartItem[]) => void;
}) {
  const { t } = useI18n();
  // The coach's UNSAVED selection. Starts empty each time the step renders
  // (the persisted cart stays visible below until a confirm replaces it).
  const [draft, setDraft] = useState<InducementCartItem[]>([]);
  const [localError, setLocalError] = useState<string | null>(null);

  const offered = listInducements().filter((e) => isEligible(e, raceId));
  const cost = cartCost(draft, raceId);
  const overBudget = cost > budget.budget;
  const canSubmit = !submitting && draft.length > 0 && !overBudget;

  const add = (id: string) => {
    setLocalError(null);
    setDraft((current) => {
      const entry = getInducement(id);
      const line = current.find((c) => c.id === id);
      const now = line?.count ?? 0;
      if (entry == null) return current;
      if (now >= maxAllowed(entry, raceId)) {
        setLocalError(t("match.inducements.maxReached", { name: entry.displayName }));
        return current;
      }
      if (line) return current.map((c) => (c.id === id ? { ...c, count: c.count + 1 } : c));
      return [...current, { id, count: 1 }];
    });
  };
  const remove = (id: string) => {
    setLocalError(null);
    setDraft((current) =>
      current
        .map((c) => (c.id === id ? { ...c, count: c.count - 1 } : c))
        .filter((c) => c.count > 0),
    );
  };

  const shownError = error ?? localError;

  return (
    <div data-testid="inducement-purchase" className="border-t border-red bg-background px-4 py-4">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <h3 className="text-sm font-black uppercase tracking-wide text-navy">
          {t("match.inducements.title")}
        </h3>
        <p className="text-xs font-bold text-slate-600 tabular-nums">
          {t("match.inducements.budget", { budget: budget.budget.toLocaleString("es-ES") })}
        </p>
      </div>

      {offered.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{t("match.inducements.noneForRace")}</p>
      ) : (
        <ul className="mt-2 flex flex-col gap-1">
          {offered.map((entry) => {
            const line = draft.find((c) => c.id === entry.id);
            const count = line?.count ?? 0;
            const atMax = count >= maxAllowed(entry, raceId);
            return (
              <li key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                <span className="min-w-0 flex-1">
                  <span className="font-semibold text-slate-800">{entry.displayName}</span>
                  <span className="ml-2 text-xs text-slate-500 tabular-nums">
                    {effectiveCost(entry, raceId).toLocaleString("es-ES")} M.O.
                  </span>
                  {count > 0 ? (
                    <span className="ml-2 text-xs font-bold text-red tabular-nums">
                      {t("match.inducements.quantity", { count, name: entry.displayName })}
                    </span>
                  ) : null}
                </span>
                <span className="flex items-center gap-1">
                  <button
                    type="button"
                    aria-label={t("match.inducements.remove", { name: entry.displayName })}
                    onClick={() => remove(entry.id)}
                    disabled={count === 0 || submitting}
                    className="flex h-6 w-6 items-center justify-center rounded border border-navy text-navy hover:bg-background disabled:opacity-30"
                  >
                    −
                  </button>
                  <button
                    type="button"
                    aria-label={t("match.inducements.add", { name: entry.displayName })}
                    onClick={() => add(entry.id)}
                    disabled={atMax || submitting}
                    className="flex h-6 w-6 items-center justify-center rounded border border-navy bg-navy text-white hover:bg-navy-hover disabled:opacity-30"
                  >
                    +
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {persisted.length > 0 ? (
        <p className="mt-2 border-t border-border pt-2 text-xs font-semibold text-slate-600">
          {t("match.inducements.cart")}:{" "}
          {persisted
            .map((line) => {
              const entry = getInducement(line.id);
              return entry
                ? t("match.inducements.quantity", { count: line.count, name: entry.displayName })
                : line.id;
            })
            .join(" · ")}
        </p>
      ) : null}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-2">
        <div className="text-xs text-slate-600">
          {draft.length === 0 ? (
            <p>{t("match.inducements.empty")}</p>
          ) : (
            <p className="tabular-nums">
              {t("match.inducements.spent", { budget: cost.toLocaleString("es-ES") })} ·{" "}
              {overBudget ? (
                <span role="alert" className="font-bold text-red">
                  {t("match.inducements.overBudget")}
                </span>
              ) : (
                t("match.inducements.remaining", {
                  budget: (budget.budget - cost).toLocaleString("es-ES"),
                })
              )}
            </p>
          )}
        </div>
        <button
          type="button"
          onClick={() => onPurchase(draft)}
          disabled={!canSubmit}
          aria-disabled={submitting ? true : undefined}
          className="rounded-md bg-navy px-4 py-2 text-sm font-black uppercase tracking-wide text-white hover:bg-navy-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          {submitting
            ? t("match.inducements.purchasing")
            : persisted.length > 0
              ? t("match.inducements.replace")
              : t("match.inducements.confirm")}
        </button>
      </div>

      {submitting ? (
        <p role="status" className="mt-2 text-xs font-semibold text-slate-600">
          {t("match.inducements.purchasing")}
        </p>
      ) : null}
      {shownError ? (
        <p role="alert" className="mt-2 text-xs font-semibold text-red">
          {shownError}
        </p>
      ) : null}
    </div>
  );
}

/** The two-team matchup header shown in the centered consent panel. */function MatchupLine({ names }: { names: { home: string; away: string } }) {
  return (
    <p className="text-sm font-black uppercase tracking-wide text-navy">
      {names.home} <span className="text-red">·</span> {names.away}
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
      <div className="border border-border bg-panel px-4 py-6 text-center">
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

/**
 * The Concept B compact rulebook navy header rows (MVT-3): the uniform sticky
 * header now renders
 *  row 1 (top-row): back arrow (32px) + league·jornada label + count-up;
 *  row 2 (main row): home [acronym emblem + per-side score] · center [the
 *    "Mitad H · Turno N" chip, ONE shared 8-cell turn track, and — while live
 *    for the ACTIVE coach only — the plain "Tu turno · clock" accent] · away
 *    [acronym emblem + per-side score];
 *  row 3 (relojes compacta): per-coach H:MM:SS clocks + the 1ª/2ª half badge
 *    (+ the RAU-38 "Conceder" in the header turn area while live for a side).
 * Removed: the gradient hero (54px emblems, full names, subtitles, mini pills,
 * composed center scoreboard) and the "En juego · Tiempo" mini-line (the row-1
 * count-up covers elapsed time). Full team names live ONLY in the emblem aria +
 * desktop tooltip (MVT-8/9); scores are per-side (MVT-3).
 * The rows render UNIFORMLY in every fixture state; LIVE-specific pieces are
 * gated: the shared track has one `aria-current` highlight only while live, the
 * clocks show H:MM:SS while live/finished (else "–"), and the coach accent only
 * for `live && viewerSide === activeSide`. MVT-3/MVT-7: the header NEVER renders
 * a pass-turn control and NEVER uses `role=status`; concede stays in the turn
 * zone (RAU-38). Strings stay byte-identical where the suites assert them.
 */
function LiveTopBar({
  state,
  clock,
  label,
  names,
  homeTeamId,
  awayTeamId,
  leagueId,
  concedeControls,
}: {
  state: LiveMatchViewState;
  clock: DisplayClock;
  label: string;
  names: { home: string; away: string };
  homeTeamId: string;
  awayTeamId: string;
  leagueId: string;
  /** RAU-38: the turn-zone concede controls (null when the viewer has no side
   * or the match is not live — the FinishedLiveView passes nothing). */
  concedeControls?: React.ReactNode;
}) {
  const { t } = useI18n();
  const live = state.status === "live";
  // The single shared track runs the GLOBAL 1-8 / 9-16 sequence (D5).
  const globalTurn = state.half === 2 ? state.turnNumber + 8 : state.turnNumber;
  const first = globalTurn > 8 ? 9 : 1;
  const played = live || state.status === "finished";
  // Inert pre-kickoff clocks render "–"; once a value exists (live or finished)
  // the H:MM:SS (base or ticking) renders.
  const clockValue = (ms: number) => (live || ms > 0 ? <FormatHms ms={ms} /> : "–");
  // MVT-3: the coach-only accent shows for the ACTIVE coach while live — a
  // plain <p>, never role=status/button (D7) — with the active side's clock.
  const showAccent =
    live && state.viewerSide != null && state.viewerSide === state.activeSide;
  const activeClockMs = state.activeSide === "away" ? clock.awayTurnMs : clock.homeTurnMs;
  // MVT-3: a score is a real value once played (live) or finished, else "-".
  const scoreOf = (side: "home" | "away") =>
    played ? (side === "home" ? state.homeScore : state.awayScore) : "-";
  // Per-side score column (D6): acronym emblem + per-side score under it.
  const scoreCol = (team: string, teamId: string, side: "home" | "away") => (
    <div className="flex min-w-0 flex-col items-center gap-1">
      <HeaderEmblem teamId={teamId} name={team} side={side} />
      <span
        data-testid={`score-${side}`}
        aria-label={t("match.sideScore", { team, score: scoreOf(side) })}
        className="font-display text-2xl font-semibold leading-none text-white tabular-nums"
      >
        {scoreOf(side)}
      </span>
    </div>
  );
  // The ONE shared central turn track cells (MVT-3/D5): global 1-8 / 9-16,
  // current `aria-current` only while live.
  const turnCells = Array.from({ length: 8 }, (_, i) => first + i).map((n) => {
    const active = live && n === globalTurn;
    return (
      <span
        key={n}
        aria-label={t("match.turnOfNumber", { n })}
        aria-current={active ? "true" : undefined}
        className={`flex h-[21px] w-[21px] items-center justify-center rounded-[3px] text-[10px] font-bold ${
          active ? "bg-red text-white" : "bg-navy-tint text-[#9fb3d8]"
        }`}
      >
        {n}
      </span>
    );
  });
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
        <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.04em] text-border-subtle">
          {label}
        </p>
        <span className="ml-auto flex items-center gap-1 text-xs font-extrabold tabular-nums text-white">
          <Icon name="timer" className="h-3.5 w-3.5 text-border-subtle" />
          {clockValue(clock.elapsed)}
        </span>
      </div>
      {/* Row 2 — main row: home [emblem · score] · center [chip · ONE track ·
          coach accent] · away [emblem · score]. MVT-3: NO "Dar el turno" nor
          consent here — pass lives in the bottom dock (MVT-7); concede is in
          the row-3 turn zone (RAU-38). */}
      <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-start gap-x-3 px-3 pt-3 pb-2 sm:px-5">
        {scoreCol(names.home, homeTeamId, "home")}
        <div className="flex flex-col items-center gap-1.5">
          {/* The chip's ONLY text is the byte "Mitad H · Turno N" line. */}
          <span className="text-[11px] font-semibold tracking-[0.02em] text-border-subtle">
            {t("match.halfTurn", { half: state.half, turn: state.turnNumber })}
          </span>
          <span className="flex items-center gap-1">{turnCells}</span>
          {/* MVT-3 coach accent — plain <p>, never role=status/button. */}
          {showAccent ? (
            <p className="text-[10px] font-bold uppercase tracking-[0.05em] text-[#a7f3d0]">
              {t("match.yourTurn")} · <FormatHms ms={activeClockMs} />
            </p>
          ) : null}
        </div>
        {scoreCol(names.away, awayTeamId, "away")}
      </div>
      {/* Row 3 — relojes compacta: per-coach clocks + the 1ª/2ª badge (+ the
          turn-zone concede while live for a sided coach). The outer row WRAPS on
          narrow viewports so the expanded 1ª/2ª + Conceder cluster never pushes
          past the ~430px compact-header width — the away clock folds onto its
          own line instead of overflowing the viewport (design polish, open Q2). */}
      <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1.5 border-t border-white/10 px-3 py-2 text-[11px] font-bold tabular-nums">
        <span className="flex min-w-0 flex-1 items-center gap-1 text-white">
          <Icon name="timer" className="h-[13px] w-[13px] shrink-0 text-border-subtle" />
          {clockValue(clock.homeTurnMs)}
        </span>
        <span className="flex max-w-full flex-wrap items-center justify-center gap-2">
          <span className="whitespace-nowrap rounded-[3px] border border-[rgba(209,25,56,0.45)] bg-[rgba(209,25,56,0.25)] px-2 py-[1px] text-[10px] font-black uppercase tracking-[0.05em] text-white">
            {state.half === 2 ? t("match.halfTwo") : t("match.halfOne")}
          </span>
          {concedeControls}
        </span>
        <span className="flex min-w-0 flex-1 items-center justify-end gap-1 text-white">
          <Icon name="timer" className="h-[13px] w-[13px] shrink-0 text-border-subtle" />
          {clockValue(clock.awayTurnMs)}
        </span>
      </div>
    </>
  );
}

/** One side's mini-stat pill row (MVT-10 feed strip): ⚽ TD / 🤝 completions /
 * ⚰️ casualties / ★ SPP. The light pill (`D9`: white/light border/slate text)
 * reads on the light feed background now that the pills left the navy hero.
 * A pill renders only when the STAT has data on EITHER side (symmetric). */
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
    <span className="flex flex-wrap justify-center gap-[5px]">
      {pills.map((pill) => (
        <span
          key={pill.key}
          data-testid={`mini-${pill.key}-${side}`}
          className="flex items-center gap-[3px] rounded-[3px] border border-border bg-panel px-1.5 py-[1px] text-[10px] text-slate-600"
        >
          <span aria-hidden="true">{pill.icon}</span>
          <b className="tabular-nums">{pill.value}</b>
        </span>
      ))}
    </span>
  );
}

/**
 * The header C compact per-team mini-stat pills moved to the scrolling feed
 * (MVT-10/D9): a light strip rendering ABOVE the event rows for a live/finished
 * match that has display-worthy events — never inside the sticky header. Null
 * when no pill is visible (e.g. pre-kickoff/pending, or a bare start-only feed).
 * Preserves the `mini-{key}-{side}` testids; `deriveTeamStats` unchanged.
 */
function MiniStatsFeedStrip({
  events,
}: {
  events: LiveMatchView["events"];
}) {
  const stats = deriveTeamStats(events);
  const visible = {
    td: stats.home.tds + stats.away.tds > 0,
    comp: stats.home.completions + stats.away.completions > 0,
    cas: stats.home.casualties + stats.away.casualties > 0,
    spp: stats.home.spp + stats.away.spp > 0,
  };
  if (!visible.td && !visible.comp && !visible.cas && !visible.spp) return null;
  // Mirror zero for a side whose stat has no data so the pills stay symmetric.
  const sideStats = (side: "home" | "away"): TeamStats => ({
    tds: visible.td ? stats[side].tds : 0,
    completions: visible.comp ? stats[side].completions : 0,
    casualties: visible.cas ? stats[side].casualties : 0,
    fouls: 0,
    spp: visible.spp ? stats[side].spp : 0,
  });
  return (
    <div
      data-testid="mini-strip"
      className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 border-b border-border bg-background px-3 py-1.5"
    >
      <MiniStats stats={sideStats("home")} side="home" visible={visible} />
      <MiniStats stats={sideStats("away")} side="away" visible={visible} />
    </div>
  );
}

/** The weather/stadium row (v7): weather is omit/neutral when a live match has
 * none yet; the stadium has no data source → the rulebook-neutral
 * "Reglamentario" always renders. Inline SVG icons flank the two meta labels. */
function LiveMetaRow() {
  const { t } = useI18n();
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 border-b border-border bg-background px-3.5 py-1.5 text-[11px] text-slate-500">
      <span className="flex items-center gap-1.5">
        <Icon name="weather" className="h-[15px] w-[15px] text-navy" />
        {t("match.clima")}
      </span>
      <span className="flex items-center gap-1.5">
        {t("match.estadio")}
        <Icon name="helmet" className="h-[15px] w-[15px] text-navy" />
      </span>
    </div>
  );
}

/**
 * The uniform sticky match header (Concept B: 3-row top bar with compact main
 * row + meta row + timeline bar): rendered for EVERY fixture state
 * (pending/scheduled/live/finished) so turns, clocks and per-side scores stay
 * visible while the body scrolls (`sticky top-0 z-40` navy + drop shadow). No
 * hero banner — acronym emblems + score sit in the top bar main row (MVT-3/8/9),
 * the mini pills live in the feed (MVT-10), and the LIVE-specific pieces are
 * gated (see LiveTopBar): the accent for the active coach, per-side scores for
 * live/finished, the aria-current cell only while live.
 */
function RulebookHeader({
  state,
  clock,
  label,
  names,
  homeTeamId,
  awayTeamId,
  leagueId,
  events,
  homeTeam,
  awayTeam,
  concedeControls,
}: {
  state: LiveMatchViewState;
  clock: DisplayClock;
  label: string;
  names: { home: string; away: string };
  homeTeamId: string;
  awayTeamId: string;
  leagueId: string;
  events: LiveMatchView["events"];
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
  /** RAU-38: the turn-zone concede controls. MVT-3: NO pass-turn control lives
   * here — it is gated to the bottom dock (MVT-7). */
  concedeControls?: React.ReactNode;
}) {
  return (
    <div
      data-testid="rulebook-header"
      className="sticky top-0 z-40 border-b border-navy-tint bg-navy shadow-[0_6px_16px_rgba(15,23,42,0.18)]"
    >
      <LiveTopBar
        state={state}
        clock={clock}
        label={label}
        names={names}
        homeTeamId={homeTeamId}
        awayTeamId={awayTeamId}
        leagueId={leagueId}
        concedeControls={concedeControls}
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

/** RAU-13: the per-side notice shown while a match is being set up / played
 * when a team fields Journeymen: "Faltan X jugadores — se añaden X novatos".
 * Rendered once per affected side, directly under the match header. */
function JourneymenNotice({
  homeTeam,
  awayTeam,
}: {
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
}) {
  const { t } = useI18n();
  const homeCount = homeTeam.players.filter((p) => p.journeyman).length;
  const awayCount = awayTeam.players.filter((p) => p.journeyman).length;
  if (homeCount === 0 && awayCount === 0) return null;
  return (
    <div
      data-testid="journeymen-notice"
      className="border-b border-red bg-background px-4 py-2 text-center text-sm font-bold text-red"
    >
      {homeCount > 0 ? <p>{t("match.journeymenNotice", { count: homeCount })}</p> : null}
      {awayCount > 0 ? <p>{t("match.journeymenNotice", { count: awayCount })}</p> : null}
    </div>
  );
}

/** The i18n key for a resolution wizard step label (the resume card copy). */
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

/** The live-session control: consent → ready → begin → live clock + controls. */
function LiveActiveMatch({
  live,
  leagueId,
  fixtureId,
  names,
  viewerSide,
  scheduled,
  leagueLabel,
  homeTeam,
  awayTeam,
  onFinished,
}: {
  live: LiveMatchView | null;
  leagueId: string;
  fixtureId: string;
  names: { home: string; away: string };
  viewerSide: "home" | "away" | null;
  scheduled: boolean;
  leagueLabel: string;
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
  /** RAU-44: fired ONCE when the live SSE state reaches "finished", so the page
   * refetches the match detail (fixture GET) and shows the persisted finish-time
   * winnings WITHOUT a manual refresh. */
  onFinished?: () => void;
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

  // RAU-44: one-shot refetch trigger when the match finishes (the SSE state
  // sees "finished" before the page-level detail does; without this the
  // finished winnings only appear after a manual refresh).
  const finishedNotified = useRef(false);
  useEffect(() => {
    if (state.status === "finished" && !finishedNotified.current) {
      finishedNotified.current = true;
      onFinished?.();
    }
  }, [state.status, onFinished]);

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

  // LM-29: the feed-top reason chip shows ONLY when the live feed cannot already
  // show the reason on its newest turnStart row (steady-live has the row; a
  // reload / reconnect shape does not). Steady-live never duplicates it.
  const newestTurnStart = [...events]
    .filter((e) => e.kind === "turnStart")
    .sort((a, b) => b.seq - a.seq)[0];
  const feedAlreadyCarriesReason =
    newestTurnStart != null &&
    newestTurnStart.side === state.activeSide &&
    newestTurnStart.payload.reason === state.lastTurnReason;
  const showTurnReasonChip =
    state.status === "live" &&
    state.lastTurnReason != null &&
    !feedAlreadyCarriesReason;
  /** LM-28 visible label for the feed-top chip / card tag. */
  const turnReasonLabel = (r: string) =>
    r === "voluntary"
      ? t("match.turnReason.voluntary")
      : r === "turnover"
        ? t("match.turnReason.turnover")
        : r === "injury"
          ? t("match.turnReason.injury")
          : "";

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

  // LM-30/S2: the ready-phase purchase step. The ELIGIBLE side + budget are
  // FIXTURE-GET data (`live.inducementBudget` — the fixture GET derives it
  // server-side over the persisted team rows, IND-2). The fixture GET is the
  // stable source (the SSE `state` merge carries only live-transition frames,
  // which omit the budget); the CURRENT persisted cart is read from the
  // SSE-fresh state when present (`state.inducements` rides the purchase POST
  // view + snapshot), falling back to the fixture GET's cart. The step renders
  // for the lower-TV coach ONLY while `ready`; equal TVs →
  // `{side:null,budget:0}` → no step. The server command re-derives and
  // enforces this budget, so the UI gate is display-only (never a forgery
  // surface).
  const inducementBudget =
    live != null && "inducementBudget" in live ? live.inducementBudget ?? null : null;
  const purchaseStepEligible =
    state.status === "ready" &&
    state.viewerSide != null &&
    inducementBudget != null &&
    inducementBudget.side === state.viewerSide &&
    inducementBudget.budget > 0;
  const eligibleRaceId =
    inducementBudget?.side === "away"
      ? awayTeam.raceId
      : inducementBudget?.side === "home"
        ? homeTeam.raceId
        : null;
  const currentCart: PersistedInducements | null =
    state.inducements ??
    (live != null && "inducements" in live ? live.inducements ?? null : null) ??
    null;
  const eligibleSidePersisted: InducementCartItem[] =
    currentCart != null && inducementBudget != null && inducementBudget.side != null
      ? currentCart[inducementBudget.side] ?? []
      : [];

  return (
    <div className="bg-panel border border-border">
      {/* Uniform sticky match header: renders in EVERY fixture state. */}
      <RulebookHeader
        state={state}
        clock={clock}
        label={leagueLabel}
        names={names}
        homeTeamId={homeTeam.id}
        awayTeamId={awayTeam.id}
        leagueId={leagueId}
        events={events}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        concedeControls={concedeControls}
      />

      {/* RAU-13: the Journeymen (Novatos) notice — per affected side, whenever
          the lineup is being completed with match-only players. */}
      <JourneymenNotice homeTeam={homeTeam} awayTeam={awayTeam} />

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
          {purchaseStepEligible && inducementBudget?.side != null && eligibleRaceId != null ? (
            <InducementPurchasePanel
              budget={inducementBudget as Extract<InducementBudget, { side: "home" | "away" }>}
              raceId={eligibleRaceId}
              persisted={eligibleSidePersisted}
              submitting={submitting}
              error={error}
              onPurchase={(items) =>
                void act({
                  type: "purchaseInducements",
                  side: inducementBudget.side as "home" | "away",
                  items,
                })
              }
            />
          ) : null}
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
              className="border-b border-red bg-background px-4 py-2 text-center text-sm font-bold text-red"
            >
              {t("match.rivalRequestsTurn")}
            </p>
          ) : null}
          {/* LM-29: the current turn's reason at the top of the feed — only when
              the reload/reconnect shape has no live turnStart row carrying it
              (steady-live renders it ON that row via LiveEventCards). The reason
              is STATE, never a feed row (LM-16). */}
          {showTurnReasonChip ? (
            <p
              data-testid="turn-reason-chip"
              data-reason={state.lastTurnReason}
              className="border-b border-border bg-background px-4 py-1.5 text-center text-xs font-semibold text-navy"
            >
              {state.lastTurnReason != null ? turnReasonLabel(state.lastTurnReason) : ""}
            </p>
          ) : null}
          {/* MVT-10: the per-team mini-stat strip sits in the FEED above the
              event rows (never the sticky header). Null when no pill is shown. */}
          <MiniStatsFeedStrip events={events} />
          <LiveEventCards
            events={events}
            startedAt={state.startedAt}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            viewerSide={state.viewerSide}
            now={state.startedAt != null ? state.startedAt + clock.elapsed : 0}
            onAck={(eventSeq, status) => void act({ type: "acknowledgeEvent", eventSeq, status })}
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
                  className="rounded-md border border-navy px-4 py-2 text-sm font-semibold text-navy hover:bg-background"
                >
                  {t("match.requestTurn")}
                </button>
              ) : null}
            </div>
          </div>
          {/* Design-A (d): the contextual action dock — a FIXED bar over the
              viewport bottom showing the actions legal RIGHT NOW per role
              (TD/Pase/Baja/Falta when ACTIVE; only casualty records when the
              turn is the rival's). Tapping opens a player-chip sheet. Same gate
              as the removed strip: a live match with a viewer side only — a
              spectator/admin or a non-live match never sees it. */}
          <LiveActionDock
            viewerSide={state.viewerSide}
            activeSide={state.activeSide}
            status={state.status}
            roster={state.viewerSide === "away" ? awayTeam.players : homeTeam.players}
            opponentRoster={state.viewerSide === "away" ? homeTeam.players : awayTeam.players}
            rosterRaceId={state.viewerSide === "away" ? awayTeam.raceId : homeTeam.raceId}
            opponentRaceId={state.viewerSide === "away" ? homeTeam.raceId : awayTeam.raceId}
            onSubmit={act}
          />
          {/* Spacer so the fixed dock never covers the tail of the live feed. */}
          <div aria-hidden className="h-20" />
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
    <div className="bg-panel border border-border">
      {/* MVT-10: the finished feed's per-team mini-strip sits above the rows. */}
      <MiniStatsFeedStrip events={live.events} />
      <LiveEventCards
        events={live.events}
        startedAt={live.startedAt}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
        viewerSide={null}
        now={live.startedAt != null ? live.startedAt + live.elapsed : 0}
        onAck={() => undefined}
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
function SummaryFeedRowView({ row, names }: { row: SummaryFeedRow; names: { home: string; away: string } }) {
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
          className="flex items-center gap-3 bg-panel px-3 py-1.5 text-[12px]"
        >
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
        <li
          data-testid="summary-row"
          className="flex items-center gap-3 bg-gradient-to-r from-navy/[0.12] via-navy/[0.06] to-white px-3 py-1.5 text-[12px]"
        >
          <span aria-hidden="true" className="shrink-0 text-center">💰</span>
          <span className="flex-1">
            <span className="block font-bold uppercase tracking-wide text-slate-500">{t("match.incentives")}</span>
            {/* LM-30/S4: one row per side that carried a snapshot — the team's
                name labels its own budget; chips are its cards (IND-4). The
                legacy fallback row (single home pettyCash) has cards: [] → no
                chips, exactly like the pre-S4 rendering. */}
            <span className="block text-[11px] font-semibold text-slate-600 tabular-nums">
              {names[row.team]}: {formatCoins(row.budget)}
            </span>
          </span>
          {row.cards.length > 0 ? (
            <span className="flex flex-wrap items-center justify-end gap-1">
              {row.cards.map((card) => (
                <span
                  key={card.name}
                  className="rounded-full border border-border bg-panel px-2 py-0.5 text-[10px] font-bold text-navy"
                >
                  {t("match.inducements.quantity", { count: card.count, name: card.name })}
                </span>
              ))}
            </span>
          ) : null}
        </li>
      );
  }
}

/** The snapshot-driven summary block above the finished-feed cards (MVT-4). */
function SummaryFeedRows({ detail, names }: { detail: MatchDetail; names: { home: string; away: string } }) {
  const rows = buildSummaryFeedRows(detail);
  if (rows.length === 0) return null;
  // MVT-4/LM-30 (S4): `incentives` now emits ONE row per side (up to two rows
  // sharing `type: "incentives"`), so the key must be type + side — `row.type`
  // alone would collide and duplicate-key-warn.
  const rowKey = (row: SummaryFeedRow): string =>
    row.type === "incentives" ? `incentives-${row.team}` : row.type;
  return (
    <ol className="flex flex-col gap-2 bg-[#eef1f6] p-1.5">
      {rows.map((row) => (
        <SummaryFeedRowView key={rowKey(row)} row={row} names={names} />
      ))}
    </ol>
  );
}

/**
 * A finished live match (status "finished"): the UNIFORM sticky rulebook header
 * renders the final score + frozen per-team clocks + inert tracks above the
 * persisted Design-A timeline. `useLiveClock` re-derives nothing while not
 * live — it just serves the persisted clock base values.
 */
function FinishedLiveView({
  live,
  detail,
  leagueLabel,
  names,
  homeTeam,
  awayTeam,
  leagueId,
  onResolve,
}: {
  live: LiveMatchView;
  detail: MatchDetail;
  leagueLabel: string;
  names: { home: string; away: string };
  homeTeam: MatchTeamDetail;
  awayTeam: MatchTeamDetail;
  leagueId: string;
  /** When set, the finished live match is NOT resolved yet — the persistent
   * "Informar del fin del partido" card renders above the feed showing the
   * current wizard step with a Reanudar button (resume-at-step, never stuck
   * behind a dismissed modal). */
  onResolve?: () => void;
}) {
  const clock = useLiveClock(live);
  const { t } = useI18n();
  // The resume card surfaces the VIEWER's OWN side's wizard step (the fixture
  // GET carries the per-viewer side); a no-side viewer sees the home side's.
  const viewerSide = live.viewerSide ?? null;
  const ownStep = viewerSide
    ? (live.resolutionState?.[viewerSide]?.step ?? "winnings")
    : (live.resolutionState?.home?.step ?? "winnings");
  const stepLabel = t(resolutionStepKey(ownStep));
  return (
    <div className="bg-panel border border-border">
      <RulebookHeader
        state={live}
        clock={clock}
        label={leagueLabel}
        names={names}
        homeTeamId={homeTeam.id}
        awayTeamId={awayTeam.id}
        leagueId={leagueId}
        events={live.events}
        homeTeam={homeTeam}
        awayTeam={awayTeam}
      />
      {onResolve ? (
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-red bg-background px-3.5 py-2">
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
      {/* MVT-4: snapshot summary rows ABOVE the event timeline. */}
      <SummaryFeedRows detail={detail} names={names} />
      <FinishedLiveTimeline live={live} homeTeam={homeTeam} awayTeam={awayTeam} />
    </div>
  );
}

function Coins({ value }: { value: number | null | undefined }) {
  return <>{value?.toLocaleString("es-ES") ?? ""}</>;
}

function SectionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-border py-2 px-3 last:border-b-0">
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
    <div className="bg-panel border border-border">
      {/* Scoreboard */}
      {score ? (
        <div className="px-4 py-4 text-center">
          <p className="font-display text-3xl font-semibold leading-none text-navy">
            {score.home} <span className="text-endzone">–</span> {score.away}
          </p>
          <p className="mt-1 text-sm font-semibold text-red">{score.winnerName}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 px-4 pb-4 sm:flex-nowrap">
        {teams ? (
          <>
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
 * The match view page (client, D2): fetches the match detail and renders the
 * three lifecycle states plus the walkover notice and inert live shells.
 * League-section copy is Spanish; only rulebook-light tokens are used (MV-7).
 */
export function MatchView({ leagueId, fixtureId }: { leagueId: string; fixtureId: string }) {
  const { detail, loading, error, notFound, refresh } = useMatchDetail(leagueId, fixtureId);
  const league = useLeague(leagueId);
  const leagueName = league.name;
  const { t } = useI18n();
  // RAU-49: the end-of-match resolution modal — open when the finished live
  // match is NOT resolved yet. Auto-opened ONCE when the match transitions to
  // finished via the SSE-triggered refresh; the persistent "Resolver partido"
  // banner keeps it reachable after a dismiss.
  const [resolveOpen, setResolveOpen] = useState(false);
  // LMR-7: the manual reset confirmation modal.
  const [resetOpen, setResetOpen] = useState(false);
  // MSL-7: the share-link affordance state — "copying" disables the button,
  // "copied" flips its label, "error" surfaces an alert.
  const [shareState, setShareState] = useState<"idle" | "copying" | "copied" | "error">("idle");
  const prevLiveStatusRef = useRef<string | null>(null);
  useEffect(() => {
    const liveStatus = detail?.live?.status ?? null;
    const prev = prevLiveStatusRef.current;
    prevLiveStatusRef.current = liveStatus;
    if (liveStatus === "finished" && prev != null && prev !== "finished") {
      setResolveOpen(true);
    }
  }, [detail?.live?.status]);
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
      <div className="border border-border bg-panel p-8 text-center">
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
      <div className="border border-border bg-panel p-8 text-center">
        <p className="text-sm text-slate-600">{error ?? t("match.loadError")}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[200px] items-center justify-center bg-panel p-8">
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

  // LMR-7: the manual reset is offered ONLY to the league owner or a
  // developer/admin (`live.manage`), and only while a resettable LiveMatch
  // (pending/ready/live) exists on a league that is not finished.
  const canResetLive =
    session?.user?.id != null &&
    detail.live != null &&
    detail.live.status !== "finished" &&
    league.status !== "finished" &&
    (league.ownerId === session.user.id || can(session.user.role, "live.manage"));

  // MSL-7/MV-8: the share link is offered to a match participant (home/away
  // owner), the league owner, or a developer/admin (`live.manage`) — never to a
  // spectator member. The POST route re-enforces this server-side.
  const canShare =
    session?.user?.id != null &&
    (viewerSide != null ||
      league.ownerId === session.user.id ||
      can(session.user.role, "live.manage"));

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

  let body: React.ReactNode;
  if (detail.live) {
    // A LiveMatch exists for this fixture (MV-5): the uniform header renders
    // for the consent/ready/live states (LiveActiveMatch) and for the finished
    // live timeline (FinishedLiveView); the body below holds the per-state panel.
    // RAU-49: a FINISHED live match with no result shows the resolution flow —
    // the persistent "Resolver partido" banner + the two-step modal — instead
    // of the manual result form; once resolved the plain finished feed renders.
    if (detail.live.status === "finished") {
      const unresolved = detail.result == null;
      body = (
        <>
          <FinishedLiveView
            live={detail.live}
            detail={detail}
            leagueLabel={leagueLabel}
            names={names}
            homeTeam={detail.homeTeam}
            awayTeam={detail.awayTeam}
            leagueId={leagueId}
            onResolve={unresolved ? () => setResolveOpen(true) : undefined}
          />
          {resolveOpen ? (
            <MatchResolveModal
              open={resolveOpen}
              detail={detail}
              onClose={() => setResolveOpen(false)}
              // RAU-52 rework: every wizard action refreshes the detail (the
              // persisted step + the rival's progress); once the match closes
              // (BOTH sides done) the modal closes itself via the result.
              onNominated={refresh}
            />
          ) : null}
        </>
      );
    } else {
      body = (
        <LiveActiveMatch
          live={detail.live}
          leagueId={leagueId}
          fixtureId={fixtureId}
          names={names}
          viewerSide={viewerSide}
          scheduled={detail.fixture.status === "scheduled"}
          leagueLabel={leagueLabel}
          homeTeam={detail.homeTeam}
          awayTeam={detail.awayTeam}
          onFinished={refresh}
        />
      );
    }
  } else if (summary.walkover) {
    // A walkover keeps its own panel (no uniform rulebook header — the fixture
    // was never played live; the e2e asserts zero turn/clock chrome here).
    body = (
      <div className="border border-border bg-panel px-4 py-4 text-center">
        <p className="font-display text-3xl font-semibold leading-none text-navy">
          {detail.fixture.homeScore} <span className="text-endzone">–</span> {detail.fixture.awayScore}
        </p>
        <p className="mt-2 text-sm font-semibold text-red">{t("match.walkover")}</p>
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
        homeTeam={detail.homeTeam}
        awayTeam={detail.awayTeam}
      />
    );
  } else {
    body = <PlayedSections sections={summary.sections} />;
  }

  return (
    // v7: the duplicated "Partido {round}" + Volver page header is GONE — the
    // back navigation lives in the sticky rulebook header's back arrow (only
    // the notFound/error/loading panels keep their own chrome).
    <section aria-label={t("match.pageAria", { round: detail.fixture.round })}>
      {canResetLive || canShare ? (
        <div className="flex items-center justify-end gap-2 border-b border-border bg-panel px-3 py-1.5">
          {shareState === "error" ? (
            <p role="alert" className="mr-auto text-[11px] font-semibold text-red">
              {t("match.shareError")}
            </p>
          ) : null}
          {canShare ? (
            <button
              type="button"
              data-testid="share-link"
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
