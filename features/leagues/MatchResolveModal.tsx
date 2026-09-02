"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { PE_MVP } from "@/lib/rules";
import { casualtyVictimsFromEvents } from "@/lib/liveResolve";
import { positionName } from "./playerActionStrip";
import { casualtyKindLabel } from "./matchSummary";
import { JourneymenHireStep } from "./JourneymenHire";
import {
  nominateMvp,
  resolutionAdvance,
  resolutionCasualtiesDone,
  resolutionFanRoll,
  resolutionJourneymenDone,
  resolutionMvpConfirm,
  resolutionMvpReveal,
  resolutionWinningsSeen,
  resolveLiveMatch,
  type MatchDetail,
  type ResolutionSideState,
} from "./api";

/** A roster player reference (id + name), shared with the result modal. The
 * optional dorsal/positionalKey power the "Name (Position · #N)" MJP picker
 * labels (RAU-13); `journeyman` swaps the role slot for the "Novato" marker. */
export interface RosterPlayerRef {
  id: string;
  name: string;
  dorsal?: number;
  positionalKey?: string;
  /** RAU-13: a match-only Journeyman (Novato) — MVP-eligible, labeled "Novato". */
  journeyman?: boolean;
}

/** The rulebook MVP nomination cap per team (BB2025: 6). NOTE: a custom
 * ruleset could supply its own max — the UI and the server both hard-code 6
 * today (the `validateSingleMvpNomination` six-length check mirrors it); a
 * ruleset hook is the flagged future extension point. */
export const MVP_NOMINATION_MAX = 6;

/** A side that has not started the wizard (defensive default for the DTO). */
function emptySide(): ResolutionSideState {
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

/** True when a team has exactly `MVP_NOMINATION_MAX` DISTINCT nominations
 * selected (checkbox toggling guarantees distinctness — a re-checked player is
 * un-toggled). */
function nominationsReady(nominations: readonly string[]): boolean {
  return (
    nominations.length === MVP_NOMINATION_MAX &&
    new Set(nominations.filter(Boolean)).size === MVP_NOMINATION_MAX
  );
}

/**
 * RAU-52 resolution modal — the PER-SIDE, RESUMABLE end-of-match WIZARD for a
 * FINISHED live match. Each coach advances their OWN side independently through
 * the persisted step cursor (`live.resolutionState[side].step`):
 *
 *  1. Ganancias + mantenimiento (display-only; maintenance = 0, not implemented)
 *  2. Tirada de fans — the SERVER-OWNED 1D6 roll applied to `coaching.
 *     dedicatedFans` (rulebook p.103)
 *  3. MVP — checkboxes (max 6) + "Enviar" (nominateMvp, replaceable) + the
 *     FINAL confirm ("¿estás seguro?") — no going back after it
 *  4. MVP reveal + bajas — waits for BOTH sides' confirms (reveal), then shows
 *     the grantees + the casualty outcomes VISIBLY (Player rows updated)
 *  5. Novatos — the ≥11-healthy check + the fielded journeyman hire/let-go
 *
 * Every action persists the side's progress server-side, so a close/refresh
 * resumes the modal AT THE CURRENT STEP. The match closes when BOTH sides reach
 * "done".
 */
export function MatchResolveModal({
  open,
  detail,
  onClose,
  onNominated,
}: {
  open: boolean;
  detail: MatchDetail;
  onClose: () => void;
  /** After any wizard action, refresh the match detail so the persisted step
   * (and the rival's progress) re-renders without closing. */
  onNominated: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  const viewerSide = detail.live?.viewerSide ?? null;
  const resolution = detail.live?.resolutionState ?? { home: emptySide(), away: emptySide() };
  const ownSide = viewerSide;
  const rivalSide = ownSide === "home" ? "away" : ownSide === "away" ? "home" : null;
  const own = ownSide ? resolution[ownSide] : null;
  const ownStep = own?.step ?? "winnings";
  const matchResolved = detail.result != null;
  const winnings = detail.liveWinnings ?? { home: 0, away: 0 };
  const mvpGrantees = detail.live?.mvpGrantees ?? { home: null, away: null };
  const nominations = detail.live?.mvpNominations ?? { home: null, away: null };
  const ownNomination = ownSide ? nominations[ownSide] : null;
  const bothConfirmed = resolution.home.mvpConfirmed && resolution.away.mvpConfirmed;
  const revealed = resolution.home.mvpRolled && resolution.away.mvpRolled;

  // The draft is the coach's OWN selected ids (checkbox toggles), seeded ONCE
  // from the PERSISTED per-side nomination on mount — the modal remounts per
  // open, so a reload resumes with the saved picks and in-session toggles own
  // the working copy (a re-save replaces the persisted picks).
  const [draft, setDraft] = useState<string[]>(() =>
    ownSide && ownNomination ? ownNomination.slice(0, MVP_NOMINATION_MAX) : [],
  );

  // Poll the persisted detail while the wizard waits on the RIVAL (up to the
  // reveal — the only joint step — and at the final "done" wait). During the
  // per-side steps every action refreshes, so no polling (it would churn the
  // journeymen step's local state for no reason).
  useEffect(() => {
    if (!open || matchResolved) return;
    if (revealed && ownStep !== "done") return;
    const id = setInterval(() => {
      void onNominated();
    }, 4000);
    return () => clearInterval(id);
  }, [open, matchResolved, revealed, ownStep, onNominated]);

  // The MVP reveal is the ONLY joint step: when BOTH sides confirmed, the modal
  // auto-triggers the server-owned reveal (idempotent — both clients may fire
  // it; the loser gets the winner's persisted grantees). An in-flight ref
  // guards the double-fire without a synchronous setState.
  const revealingRef = useRef(false);
  useEffect(() => {
    if (!open || matchResolved || revealingRef.current) return;
    if (bothConfirmed && !revealed) {
      revealingRef.current = true;
      void (async () => {
        try {
          await resolutionMvpReveal(detail.fixture.leagueId, detail.fixture.id, ownSide ?? "home");
          await onNominated();
        } catch {
          // A concurrent reveal from the rival's page may have won (seq guard);
          // refresh and let the persisted grantees advance both sides.
          await onNominated();
        } finally {
          revealingRef.current = false;
        }
      })();
    }
  }, [open, matchResolved, bothConfirmed, revealed, ownSide, detail.fixture.leagueId, detail.fixture.id, onNominated]);

  // Once the match closed (BOTH sides done), the resolution is complete — the
  // hire already happened at step 5, so the modal closes itself.
  useEffect(() => {
    if (open && matchResolved) onClose();
  }, [open, matchResolved, onClose]);

  // BOTH-SIDES CLOSE safety net: the store auto-closes when the LAST side
  // completes, but two concurrent completions can overlap (each reads the other
  // side as not-done-yet). Whenever THIS modal observes BOTH sides done with no
  // result, it fires the idempotent explicit close (refresh re-derives).
  const finalizingRef = useRef(false);
  useEffect(() => {
    if (!open || matchResolved || finalizingRef.current) return;
    const bothDone = resolution.home.step === "done" && resolution.away.step === "done";
    if (bothDone) {
      finalizingRef.current = true;
      void (async () => {
        try {
          await resolveLiveMatch(detail.fixture.leagueId, detail.fixture.id);
          await onNominated();
        } catch {
          // The store's auto-close (or the rival's) may have won — refresh.
          await onNominated();
        } finally {
          finalizingRef.current = false;
        }
      })();
    }
  }, [open, matchResolved, resolution.home.step, resolution.away.step, detail.fixture.leagueId, detail.fixture.id, onNominated]);

  const run = async (fn: () => Promise<unknown>) => {
    setError(null);
    setBusy(true);
    try {
      // The two coaches' pages act CONCURRENTLY — a rival action can bump the
      // row seq between this command's read and write (optimistic guard → 409
      // "seq conflict"). Retry with a fresh read: the commands are idempotent
      // and the refresh re-derives the step (the rival's write may have already
      // advanced it).
      for (let attempt = 0; ; attempt++) {
        try {
          await fn();
          break;
        } catch (e) {
          const message = e instanceof Error ? e.message : "";
          if (message !== "seq conflict" || attempt >= 2) throw e;
          await onNominated();
        }
      }
      await onNominated();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("match.resolve.saveError"));
    } finally {
      setBusy(false);
    }
  };

  // RAU-51: the pickers are fed ONLY the viewer's own team's alive+available
  // roster (RAU-12: exclude missNextMatch). RAU-13: Journeymen are INCLUDED —
  // they play for the team that match (labeled "Novato").
  const ownRoster = useMemo<RosterPlayerRef[]>(() => {
    const players = ownSide === "home" ? detail.homeTeam.players : detail.awayTeam.players;
    return players
      .filter((p) => p.alive && !p.missNextMatch)
      .map((p) => ({
        id: p.rosterPlayerId,
        name: p.name,
        dorsal: players.indexOf(p) + 1,
        positionalKey: p.positionalKey,
        journeyman: p.journeyman,
      }));
  }, [ownSide, detail.homeTeam.players, detail.awayTeam.players]);
  // The rival's roster only needs id + name (the casualties step names the
  // rival's MVP grantee).
  const rivalRoster = useMemo<RosterPlayerRef[]>(() => {
    const players = rivalSide === "home" ? detail.homeTeam.players : detail.awayTeam.players;
    return players.map((p) => ({ id: p.rosterPlayerId, name: p.name }));
  }, [rivalSide, detail.homeTeam.players, detail.awayTeam.players]);

  // The side's casualty victims (derived from the persisted events — the band
  // was server-derived at confirm time, never re-rolled).
  const casualties = useMemo(() => {
    const events = detail.live?.events ?? [];
    return casualtyVictimsFromEvents(events).filter((c) => c.team === ownSide);
  }, [detail.live?.events, ownSide]);

  if (!open) return null;

  const homeName = detail.homeTeam.name;
  const awayName = detail.awayTeam.name;
  const ownName = ownSide === "home" ? homeName : ownSide === "away" ? awayName : null;
  const rivalName =
    rivalSide === "home" ? homeName : rivalSide === "away" ? awayName : null;

  // The ≥11-healthy own players (alive && !missNextMatch among the ROSTER,
  // EXCLUDING journeymen) — the step-5 check.
  const ownPlayers = ownSide === "home" ? detail.homeTeam.players : detail.awayTeam.players;
  const healthyCount = ownPlayers.filter((p) => !p.journeyman && p.alive && !p.missNextMatch).length;
  const ownJourneymen = ownSide ? (detail.live?.journeymen?.[ownSide] ?? []) : [];
  const nameOf = (roster: RosterPlayerRef[], id: string | null | undefined) =>
    roster.find((p) => p.id === id)?.name ?? id ?? "—";

  const doSendNominations = async () => {
    if (!ownSide || !nominationsReady(draft)) return;
    await run(async () => {
      await nominateMvp(detail.fixture.leagueId, detail.fixture.id, ownSide, draft);
    });
  };

  const doConfirmMvp = async () => {
    if (!ownSide) return;
    await run(async () => {
      await resolutionMvpConfirm(detail.fixture.leagueId, detail.fixture.id, ownSide);
    });
    setConfirming(false);
  };

  const doFinalize = async () => {
    await run(async () => {
      await resolveLiveMatch(detail.fixture.leagueId, detail.fixture.id);
    });
  };

  const stepLabel = t(stepKey(ownStep));

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("match.resolve.aria")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="max-h-[90vh] w-full max-w-3xl overflow-y-auto border border-[#e2e8f0] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between bg-[#12225a] px-4 py-3 text-white">
          <h3 className="text-sm font-bold">
            {t("match.resolve.title", { home: homeName, away: awayName })}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("match.resolve.close")}
            className="text-xs font-semibold text-white/80 hover:text-white"
          >
            ✕ {t("match.resolve.close")}
          </button>
        </header>

        <div className="space-y-4 px-4 py-3">
          {error ? (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          ) : null}

          {ownSide && own ? (
            <>
              <p className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("match.resolve.stepLabel", { step: stepLabel })}
              </p>
              {ownStep === "winnings" ? (
                <WinningsStep
                  key="winnings"
                  winnings={winnings[ownSide]}
                  onContinue={() =>
                    void run(() => resolutionWinningsSeen(detail.fixture.leagueId, detail.fixture.id, ownSide))
                  }
                  busy={busy}
                  t={t}
                />
              ) : null}
              {ownStep === "fans" ? (
                <FansStep
                  key="fans"
                  fans={own.fans}
                  fansDone={own.fansDone}
                  onRoll={() =>
                    void run(() => resolutionFanRoll(detail.fixture.leagueId, detail.fixture.id, ownSide))
                  }
                  onContinue={() =>
                    void run(() => resolutionAdvance(detail.fixture.leagueId, detail.fixture.id, ownSide, "mvp"))
                  }
                  busy={busy}
                  t={t}
                />
              ) : null}
              {ownStep === "mvp" ? (
                <MvpStep
                  key="mvp"
                  name={ownName ?? "—"}
                  raceId={ownSide === "home" ? detail.homeTeam.raceId : detail.awayTeam.raceId}
                  roster={ownRoster}
                  selected={draft}
                  saved={ownNomination != null}
                  confirming={confirming}
                  busy={busy}
                  onToggle={(id) => {
                    setDraft((prev) => {
                      if (prev.includes(id)) return prev.filter((x) => x !== id);
                      if (prev.length >= MVP_NOMINATION_MAX) return prev;
                      return [...prev, id];
                    });
                  }}
                  onSave={() => void doSendNominations()}
                  onConfirm={() => setConfirming(true)}
                  onCancelConfirm={() => setConfirming(false)}
                  onConfirmYes={() => void doConfirmMvp()}
                  rivalConfirmed={rivalSide ? resolution[rivalSide].mvpConfirmed : false}
                  rivalNominated={rivalSide ? nominations[rivalSide] != null : false}
                  t={t}
                />
              ) : null}
              {ownStep === "mvp-done" ? (
                <MvpDoneStep
                  key="mvp-done"
                  confirmed={own.mvpConfirmed}
                  rivalConfirmed={rivalSide ? resolution[rivalSide].mvpConfirmed : false}
                  t={t}
                />
              ) : null}
              {ownStep === "casualties" ? (
                <CasualtiesStep
                  key="casualties"
                  name={ownName ?? "—"}
                  rivalName={rivalName ?? "—"}
                  roster={ownRoster}
                  rivalRoster={rivalRoster}
                  mvp={mvpGrantees[ownSide]}
                  rivalMvp={rivalSide ? mvpGrantees[rivalSide] : null}
                  casualties={casualties}
                  nameOf={nameOf}
                  onContinue={() =>
                    void run(() => resolutionCasualtiesDone(detail.fixture.leagueId, detail.fixture.id, ownSide))
                  }
                  busy={busy}
                  t={t}
                />
              ) : null}
              {ownStep === "journeymen" ? (
                <JourneymenStep
                  key="journeymen"
                  name={ownName ?? "—"}
                  healthyCount={healthyCount}
                  remaining={ownJourneymen.length}
                  leagueId={detail.fixture.leagueId}
                  fixtureId={detail.fixture.id}
                  side={ownSide}
                  team={{
                    name: ownName ?? "—",
                    raceId: ownSide === "home" ? detail.homeTeam.raceId : detail.awayTeam.raceId,
                  }}
                  journeymen={ownJourneymen}
                  onUpdated={onNominated}
                  onContinue={() =>
                    void run(() => resolutionJourneymenDone(detail.fixture.leagueId, detail.fixture.id, ownSide))
                  }
                  busy={busy}
                  t={t}
                />
              ) : null}
              {ownStep === "done" ? (
                <DoneStep
                  key="done"
                  rivalDone={rivalSide ? resolution[rivalSide].journeymenDone : false}
                  rivalStep={rivalSide ? resolution[rivalSide].step : "winnings"}
                  matchResolved={matchResolved}
                  onFinalize={() => void doFinalize()}
                  onClose={onClose}
                  busy={busy}
                  t={t}
                />
              ) : null}
            </>
          ) : (
            // An admin/bye viewer (no side) sees both sides' steps read-only.
            <div className="space-y-3">
              <SideStatusSection
                name={homeName}
                status={t("match.resolve.stepLabel", { step: t(stepKey(resolution.home.step)) })}
              />
              <SideStatusSection
                name={awayName}
                status={t("match.resolve.stepLabel", { step: t(stepKey(resolution.away.step)) })}
              />
              <div className="flex justify-end border-t border-[#e2e8f0] pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
                >
                  {t("match.resolve.close")}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

/** The i18n key for a wizard step label. */
function stepKey(step: string): string {
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

/** Step 1: the finish-time winnings (already computed at live finish) + the
 * maintenance-cost row placeholder (NOT implemented — shown as 0 with a note). */
function WinningsStep({
  winnings,
  onContinue,
  busy,
  t,
}: {
  winnings: number;
  onContinue: () => void;
  busy: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section aria-label={t("match.resolve.stepWinnings")} className="border border-[#e2e8f0] p-3">
      <ul className="space-y-1 text-sm text-slate-700">
        <li className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500">{t("match.resolve.winnings")}</span>
          <span className="tabular-nums">{winnings.toLocaleString("es-ES")} gp.</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500">{t("match.resolve.upkeep")}</span>
          <span className="tabular-nums">{t("match.resolve.upkeepValue")}</span>
        </li>
      </ul>
      <p className="mt-2 text-[11px] text-slate-500">{t("match.resolve.upkeepNote")}</p>
      <div className="mt-2 flex justify-end border-t border-[#e2e8f0] pt-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className="rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("match.resolve.continue")}
        </button>
      </div>
    </section>
  );
}

/** Step 2: the SERVER-OWNED dedicated-fans roll (rulebook p.103). The button
 * fires `resolutionFanRoll` (the server rolls + applies + persists); once
 * `fansDone` the persisted roll is shown and "Continuar" advances to the MVP. */
function FansStep({
  fans,
  fansDone,
  onRoll,
  onContinue,
  busy,
  t,
}: {
  fans: ResolutionSideState["fans"];
  fansDone: boolean;
  onRoll: () => void;
  onContinue: () => void;
  busy: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  if (!fansDone || !fans) {
    return (
      <section aria-label={t("match.resolve.stepFans")} className="border border-[#e2e8f0] p-3">
        <p className="text-sm text-slate-700">{t("match.resolve.fansHint")}</p>
        <div className="mt-2 flex justify-end border-t border-[#e2e8f0] pt-2">
          <button
            type="button"
            onClick={onRoll}
            disabled={busy}
            className="rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy ? t("match.resolve.rolling") : t("match.resolve.fansRollAction")}
          </button>
        </div>
      </section>
    );
  }
  const glyph = fans.direction === "up" ? "↑" : fans.direction === "down" ? "↓" : "=";
  return (
    <section aria-label={t("match.resolve.stepFans")} className="border border-[#e2e8f0] p-3">
      <p className="text-sm text-slate-700">
        {t("match.resolve.fansResult", { before: fans.before, roll: fans.roll, after: fans.after, glyph })}
      </p>
      <div className="mt-2 flex justify-end border-t border-[#e2e8f0] pt-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className="rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("match.resolve.continue")}
        </button>
      </div>
    </section>
  );
}

/** Step 3: the coach's OWN six MVP nominations via CHECKBOXES + the SEND
 * ("Guardar mis nominaciones", replaceable) + the FINAL confirm ("¿Estás
 * seguro?") — after the confirm there is NO going back (step → "mvp-done"). */
function MvpStep({
  name,
  raceId,
  roster,
  selected,
  saved,
  confirming,
  busy,
  onToggle,
  onSave,
  onConfirm,
  onCancelConfirm,
  onConfirmYes,
  rivalConfirmed,
  rivalNominated,
  t,
}: {
  name: string;
  raceId: string;
  roster: RosterPlayerRef[];
  selected: string[];
  saved: boolean;
  confirming: boolean;
  busy: boolean;
  onToggle: (id: string) => void;
  onSave: () => void;
  onConfirm: () => void;
  onCancelConfirm: () => void;
  onConfirmYes: () => void;
  rivalConfirmed: boolean;
  rivalNominated: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const ready = nominationsReady(selected);
  const journeymanLabel = t("match.journeyman");
  const atMax = selected.length >= MVP_NOMINATION_MAX;
  return (
    <section aria-label={t("match.resolve.ownNomination")} className="border border-[#e2e8f0] p-3">
      <h5 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#12225a]">{name}</h5>
      <p className="mb-2 text-xs font-semibold text-slate-500">
        {t("match.resolve.counter", { count: selected.length, max: MVP_NOMINATION_MAX })}
      </p>
      <div className="flex max-h-48 flex-col gap-1 overflow-y-auto">
        {roster.map((player) => {
          const checked = selected.includes(player.id);
          const label = t("match.resolve.checkLabel", {
            name: player.name,
            role: player.journeyman
              ? journeymanLabel
              : positionName(raceId, player.positionalKey ?? "lineman"),
            dorsal: player.dorsal ?? 0,
          });
          const disabled = !checked && atMax;
          return (
            <label
              key={player.id}
              className={`flex items-center gap-2 rounded-sm border border-[#e2e8f0] px-2 py-1 text-xs text-slate-700 ${
                checked ? "bg-[#12225a]/[0.06]" : ""
              }`}
            >
              <input
                type="checkbox"
                aria-label={label}
                checked={checked}
                disabled={disabled}
                onChange={() => onToggle(player.id)}
                className="accent-[#12225a]"
              />
              <span className="truncate">{label}</span>
            </label>
          );
        })}
      </div>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600">
          {saved ? t("match.resolve.nominated") : t("match.resolve.nominationPending")}
        </p>
        <button
          type="button"
          onClick={onSave}
          disabled={!ready || busy}
          className="rounded-sm bg-[#12225a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {busy ? t("match.resolve.nominating") : t("match.resolve.nominate")}
        </button>
      </div>

      <div className="mt-2 border-t border-[#e2e8f0] pt-2">
        <p className="text-xs font-semibold text-slate-500">
          {rivalConfirmed
            ? t("match.resolve.rivalConfirmed")
            : rivalNominated
              ? t("match.resolve.rivalDone")
              : t("match.resolve.rivalPending")}
        </p>
        {saved && !confirming ? (
          <div className="mt-2 flex justify-end">
            <button
              type="button"
              onClick={onConfirm}
              disabled={busy}
              className="rounded-sm bg-[#12225a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("match.resolve.confirm")}
            </button>
          </div>
        ) : null}
        {saved && confirming ? (
          // The FINAL confirm — after "Sí, confirmar" there is NO going back.
          <div className="mt-2 flex flex-wrap items-center justify-end gap-2">
            <span className="text-xs font-bold text-[#d11938]">{t("match.resolve.confirmTitle")}</span>
            <button
              type="button"
              onClick={onConfirmYes}
              disabled={busy}
              className="rounded-sm bg-[#d11938] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#b0142f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {t("match.resolve.confirmYes")}
            </button>
            <button
              type="button"
              onClick={onCancelConfirm}
              disabled={busy}
              className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400"
            >
              {t("match.resolve.confirmCancel")}
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}

/** Step "mvp-done": the coach's picks are locked; the reveal waits for the
 * rival's confirm (the modal auto-fires it once BOTH confirmed). */
function MvpDoneStep({
  confirmed,
  rivalConfirmed,
  t,
}: {
  confirmed: boolean;
  rivalConfirmed: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section aria-label={t("match.resolve.stepMvpDone")} className="border border-[#e2e8f0] p-3">
      <p className="text-sm text-slate-700">
        {confirmed ? t("match.resolve.ownConfirmed") : t("match.resolve.ownConfirmPending")}
      </p>
      <p className="mt-1 text-sm text-slate-600">
        {rivalConfirmed
          ? t("match.resolve.revealReady")
          : t("match.resolve.waitingRivalConfirm")}
      </p>
    </section>
  );
}

/** Step 4: the MVP REVEAL (both sides' confirms) + the casualty outcomes —
 * each injured player's outcome (recovers / Miss Next Game / permanent / dead)
 * shown VISIBLY (the Player rows were updated by `resolutionCasualtiesDone`). */
function CasualtiesStep({
  name,
  rivalName,
  roster,
  rivalRoster,
  mvp,
  rivalMvp,
  casualties,
  nameOf,
  onContinue,
  busy,
  t,
}: {
  name: string;
  rivalName: string;
  roster: RosterPlayerRef[];
  rivalRoster: RosterPlayerRef[];
  mvp: string | null;
  rivalMvp: string | null;
  casualties: { team: "home" | "away"; rosterPlayerId: string; band: string }[];
  nameOf: (roster: RosterPlayerRef[], id: string | null | undefined) => string;
  onContinue: () => void;
  busy: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section aria-label={t("match.resolve.stepCasualties")} className="border border-[#e2e8f0] p-3">
      <h5 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#12225a]">{t("match.resolve.mvpTitle")}</h5>
      <ul className="space-y-1 text-sm text-slate-700">
        <li className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500">{name}</span>
          <span className="text-[#12225a]">{t("match.resolve.mvpLine", { player: nameOf(roster, mvp), pe: PE_MVP })}</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500">{rivalName}</span>
          <span className="text-[#12225a]">{t("match.resolve.mvpLine", { player: nameOf(rivalRoster, rivalMvp), pe: PE_MVP })}</span>
        </li>
      </ul>
      <h5 className="mt-3 mb-2 text-sm font-bold uppercase tracking-wide text-[#12225a]">{t("match.resolve.casualtiesTitle")}</h5>
      {casualties.length === 0 ? (
        <p className="text-sm text-slate-600">{t("match.resolve.noCasualties")}</p>
      ) : (
        <ul className="space-y-1 text-sm text-slate-700">
          {casualties.map((c) => (
            <li key={c.rosterPlayerId} className="flex justify-between gap-3">
              <span className="font-semibold">{nameOf(roster, c.rosterPlayerId)}</span>
              <span className="tabular-nums">{casualtyKindLabel(c.band, t)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-2 flex justify-end border-t border-[#e2e8f0] pt-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={busy}
          className="rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("match.resolve.continue")}
        </button>
      </div>
    </section>
  );
}

/** Step 5 (LAST): the ≥11-healthy own players check + the fielded journeyman
 * hire/let-go step. "Continuar" completes the side (enabled once every fielded
 * Novato was decided). */
function JourneymenStep({
  name,
  healthyCount,
  remaining,
  leagueId,
  fixtureId,
  side,
  team,
  journeymen,
  onUpdated,
  onContinue,
  busy,
  t,
}: {
  name: string;
  healthyCount: number;
  remaining: number;
  leagueId: string;
  fixtureId: string;
  side: "home" | "away";
  team: { name: string; raceId: string };
  journeymen: { id: string; name: string }[];
  onUpdated: () => Promise<void>;
  onContinue: () => void;
  busy: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section aria-label={t("match.resolve.stepJourneymen")} className="border border-[#e2e8f0] p-3">
      <h5 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#12225a]">{name}</h5>
      <p className="mb-2 text-xs font-semibold text-slate-500">
        {t("match.resolve.healthyCount", { count: healthyCount })}
      </p>
      {healthyCount < 11 ? (
        <p className="mb-2 text-xs text-slate-600">{t("match.resolve.journeymenNeed")}</p>
      ) : (
        <p className="mb-2 text-xs text-slate-600">{t("match.resolve.journeymenEnough")}</p>
      )}
      <JourneymenHireStep
        leagueId={leagueId}
        fixtureId={fixtureId}
        side={side}
        team={team}
        journeymen={journeymen}
        onUpdated={onUpdated}
      />
      <div className="mt-2 flex justify-end border-t border-[#e2e8f0] pt-2">
        <button
          type="button"
          onClick={onContinue}
          disabled={busy || remaining > 0}
          className="rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("match.resolve.continue")}
        </button>
      </div>
    </section>
  );
}

/** Step "done": the side completed — wait for the rival, or close the match
 * (both done → the final resolveMatch). */
function DoneStep({
  rivalDone,
  rivalStep,
  matchResolved,
  onFinalize,
  onClose,
  busy,
  t,
}: {
  rivalDone: boolean;
  rivalStep: string;
  matchResolved: boolean;
  onFinalize: () => void;
  onClose: () => void;
  busy: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section aria-label={t("match.resolve.stepDone")} className="border border-[#e2e8f0] p-3">
      {matchResolved ? (
        <p className="text-sm font-bold text-green-700">{t("match.resolve.reported")}</p>
      ) : rivalDone ? (
        <>
          <p className="text-sm text-slate-700">{t("match.resolve.bothDone")}</p>
          <div className="mt-2 flex justify-end border-t border-[#e2e8f0] pt-2">
            <button
              type="button"
              onClick={onFinalize}
              disabled={busy}
              className="rounded-sm bg-[#d11938] px-4 py-2 text-sm font-bold text-white hover:bg-[#b0142f] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? t("match.resolve.saving") : t("match.resolve.finalize")}
            </button>
          </div>
        </>
      ) : (
        <>
          <p className="text-sm text-slate-700">
            {t("match.resolve.waitingRival", { step: t(stepKey(rivalStep)) })}
          </p>
          <div className="mt-2 flex justify-end border-t border-[#e2e8f0] pt-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
            >
              {t("match.resolve.close")}
            </button>
          </div>
        </>
      )}
    </section>
  );
}

/** A READ-ONLY per-side status (the no-side viewer's read-out). */
function SideStatusSection({ name, status }: { name: string; status: string }) {
  return (
    <section aria-label={name} className="border border-[#e2e8f0] p-3">
      <h5 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#12225a]">{name}</h5>
      <p className="text-sm text-slate-600">{status}</p>
    </section>
  );
}
