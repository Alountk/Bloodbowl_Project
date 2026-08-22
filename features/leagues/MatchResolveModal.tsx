"use client";

import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { PE_MVP } from "@/lib/rules";
import { addMvpPe, deriveLivePeAwards } from "@/lib/liveResolve";
import { positionName } from "./liveControls";
import { JourneymenHireStep } from "./JourneymenHire";
import {
  nominateMvp,
  rollLiveMvp,
  resolveLiveMatch,
  type FanFactorRoll,
  type LiveMvpRoll,
  type MatchDetail,
} from "./api";

/** A roster player reference (id + name), shared with the result modal. The
 * optional dorsal/positionalKey power the "Name (Position · #N)" MJP picker
 * labels (RAU-13); `journeyman` swaps the role slot for the "Novato" marker.
 * The summary sections only use id + name. */
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

/** True when a team has exactly `MVP_NOMINATION_MAX` DISTINCT nominations
 * selected (checkbox toggling guarantees distinctness — a re-checked player is
 * un-toggled). */
function nominationsReady(nominations: readonly string[]): boolean {
  return (
    nominations.length === MVP_NOMINATION_MAX &&
    new Set(nominations.filter(Boolean)).size === MVP_NOMINATION_MAX
  );
}

/** The per-team PE the summary reveals: derived from the live events + the
 * rolled MVP grantee (display-only — the resolve command awards it server-side). */
function teamPe(
  detail: MatchDetail,
  side: "home" | "away",
  grantee: string,
): { rosterPlayerId: string; pe: number }[] {
  const events = detail.live?.events ?? [];
  const derived = deriveLivePeAwards(events)[side];
  return addMvpPe(derived, grantee);
}

/**
 * RAU-51 resolution modal — the guided end-of-match sequence for a FINISHED
 * live match, now PER-SIDE. Two steps:
 *  1. Nomination step (mandatory): each coach nominates ONLY their OWN team's
 *     six MJP nominations from their ALIVE + AVAILABLE roster (dead/suspended
 *     players are excluded client-side and rejected server-side, RAU-12).
 *     "Guardar mis nominaciones" POSTs `nominateMvp` (persisted per-side and
 *     replaceable). The rival side and the admin/bye viewer see a read-only
 *     status (never the rival's picks before the roll). "Tirar MVP" is enabled
 *     only once BOTH sides have nominated — the server rolls the 1D6 per team
 *     from the PERSISTED nominations (`rollMvp`) and reveals the grantees +
 *     post-match FF.
 *  2. Summary step: per team — MVP (+4 PE), winnings (→ treasury, already
 *     persisted at finish, RAU-44), dedicated-fans roll and the PE earned from
 *     the match. "Guardar y reportar" POSTs `resolveMatch` (THE closure);
 *     `onResolved` lets the parent refresh + close.
 */
export function MatchResolveModal({
  open,
  detail,
  onClose,
  onResolved,
  onNominated,
}: {
  open: boolean;
  detail: MatchDetail;
  onClose: () => void;
  onResolved: () => Promise<void>;
  /** RAU-51: after a nomination POST, refresh the match detail so the persisted
   * per-side state (status line + the roll gate) re-renders without closing. */
  onNominated: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [roll, setRoll] = useState<LiveMvpRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [saving, setSaving] = useState(false);
  const [nominating, setNominating] = useState(false);
  /** RAU-52: the FINAL confirm state — armed once BOTH sides nominated; "Sí,
   * tirar el MVP" locks the picks (no back after the roll reveals the MVP). */
  const [confirming, setConfirming] = useState(false);
  /** RAU-14: once the resolve committed, the modal stays open for the LAST
   * step of the sequence — the post-match journeyman (Novato) hire step. */
  const [resolved, setResolved] = useState(false);

  const viewerSide = detail.live?.viewerSide ?? null;
  const nominations = detail.live?.mvpNominations ?? { home: null, away: null };
  const ownSide = viewerSide;
  const rivalSide = ownSide === "home" ? "away" : ownSide === "away" ? "home" : null;
  const ownNomination = ownSide ? nominations[ownSide] : null;
  const rivalNominated = rivalSide != null && nominations[rivalSide] != null;
  const bothNominated = nominations.home != null && nominations.away != null;
  const rolled = roll != null;

  // RAU-52: the draft is the coach's OWN selected ids (checkbox toggles),
  // seeded ONCE from the PERSISTED per-side nomination so a reload never loses
  // the coach's own picks (re-saves replace; while the modal stays open the
  // draft is the client's local working copy).
  const [draft, setDraft] = useState<string[]>(() =>
    ownSide && ownNomination ? ownNomination.slice(0, MVP_NOMINATION_MAX) : [],
  );

  // RAU-52 fix (the "rival never receives the confirmation" bug): a finished
  // live match is NOT fed by the SSE hub, so the modal polls the persisted
  // match detail while the nomination step is open. When the rival submits
  // their side, their status flips to "El rival nominó 6 jugadores" WITHOUT a
  // reload — the send/confirm reaches the other coach automatically.
  useEffect(() => {
    if (!open || rolled) return;
    const id = setInterval(() => {
      void onNominated();
    }, 4000);
    return () => clearInterval(id);
  }, [open, rolled, onNominated]);

  // RAU-14: the hire step is the LAST step of the sequence. When the resolve
  // committed and there is nothing left to hire (no own side, or no remaining
  // journeymen for it), the modal closes itself — the resolution is complete.
  const ownJourneymen = ownSide ? (detail.live?.journeymen?.[ownSide] ?? []) : [];
  useEffect(() => {
    if (!open || !resolved) return;
    if (!ownSide || ownJourneymen.length === 0) onClose();
  }, [open, resolved, ownSide, ownJourneymen.length, onClose]);

  // RAU-51: the pickers are fed ONLY the viewer's own team's alive+available
  // roster (RAU-12: exclude missNextMatch) — a coach never sees the rival's
  // players here. RAU-13: Journeymen are INCLUDED — they play for the team
  // that match, so they are MVP-eligible like any match player (labeled "Novato"
  // in the picker). The dorsal (RAU-13) is the served-array index + 1 (D21), so
  // the picker labels match the FAB combos and the feed.
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
  const homeRoster = useMemo<RosterPlayerRef[]>(
    () => detail.homeTeam.players.map((p) => ({ id: p.rosterPlayerId, name: p.name })),
    [detail.homeTeam.players],
  );
  const awayRoster = useMemo<RosterPlayerRef[]>(
    () => detail.awayTeam.players.map((p) => ({ id: p.rosterPlayerId, name: p.name })),
    [detail.awayTeam.players],
  );

  if (!open) return null;

  const homeName = detail.homeTeam.name;
  const awayName = detail.awayTeam.name;
  const ownName = ownSide === "home" ? homeName : ownSide === "away" ? awayName : null;
  const rivalName =
    rivalSide === "home" ? homeName : rivalSide === "away" ? awayName : null;
  const canRoll = bothNominated && !rolling;
  const winnings = detail.liveWinnings ?? { home: 0, away: 0 };

  const nameOf = (roster: RosterPlayerRef[], id: string | null | undefined) =>
    roster.find((p) => p.id === id)?.name ?? id ?? "—";

  const doNominate = async () => {
    if (!ownSide || !nominationsReady(draft)) return;
    setError(null);
    setNominating(true);
    try {
      await nominateMvp(detail.fixture.leagueId, detail.fixture.id, ownSide, draft);
      await onNominated();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("match.resolve.nominateError"));
    } finally {
      setNominating(false);
    }
  };

  const doRoll = async () => {
    setError(null);
    setConfirming(false);
    setRolling(true);
    try {
      const result = await rollLiveMvp(detail.fixture.leagueId, detail.fixture.id);
      setRoll(result);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("match.resolve.rollError"));
    } finally {
      setRolling(false);
    }
  };

  const doSave = async () => {
    if (!roll) return;
    setError(null);
    setSaving(true);
    try {
      await resolveLiveMatch(detail.fixture.leagueId, detail.fixture.id);
      // The refresh persists the resolved result (and the finish-time winnings
      // are already applied); the modal stays OPEN for the post-match hire
      // step — RAU-14, the LAST step of the resolution sequence.
      await onResolved();
      setResolved(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("match.resolve.saveError"));
    } finally {
      setSaving(false);
    }
  };

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

          {roll == null ? (
            <>
              <p className="text-sm text-slate-600">{t("match.resolve.intro")}</p>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("match.resolve.mvpStep")}
              </h4>

              {ownSide && ownName ? (
                <>
                  {/* RAU-52: ONLY the viewer's own side is editable — the
                      CHECKBOXES list their OWN alive+available roster; the rival
                      is a read-only status that never leaks the rival's picks. */}
                  <OwnNominationSection
                    name={ownName}
                    raceId={ownSide === "home" ? detail.homeTeam.raceId : detail.awayTeam.raceId}
                    roster={ownRoster}
                    selected={draft}
                    saved={ownNomination != null}
                    nominating={nominating}
                    onToggle={(id) => {
                      setDraft((prev) => {
                        if (prev.includes(id)) return prev.filter((x) => x !== id);
                        // RAU-52: the MAX (6) is enforced — a 7th player can
                        // never be checked.
                        if (prev.length >= MVP_NOMINATION_MAX) return prev;
                        return [...prev, id];
                      });
                    }}
                    onSave={() => void doNominate()}
                    t={t}
                  />
                  <SideStatusSection
                    name={rivalName ?? awayName}
                    status={
                      rivalNominated
                        ? t("match.resolve.rivalDone")
                        : t("match.resolve.rivalPending")
                    }
                  />
                </>
              ) : (
                <>
                  {/* RAU-51: an admin/bye viewer (no side) sees BOTH sides as
                      read-only statuses — never the rival's picks before the
                      roll reveals the MVP. */}
                  <SideStatusSection
                    name={homeName}
                    status={
                      nominations.home != null
                        ? t("match.resolve.statusDone")
                        : t("match.resolve.statusPending")
                    }
                  />
                  <SideStatusSection
                    name={awayName}
                    status={
                      nominations.away != null
                        ? t("match.resolve.statusDone")
                        : t("match.resolve.statusPending")
                    }
                  />
                </>
              )}

              {!bothNominated ? (
                <p className="text-[11px] text-slate-500">{t("match.resolve.needBothSides")}</p>
              ) : null}
              <p className="text-[11px] text-slate-500">
                {t("match.resolve.maxHint", { max: MVP_NOMINATION_MAX })}
              </p>
              <div className="flex items-center justify-end gap-2 border-t border-[#e2e8f0] pt-3">
                {!confirming ? (
                  <button
                    type="button"
                    onClick={onClose}
                    className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
                  >
                    {t("common.cancel")}
                  </button>
                ) : null}
                {confirming ? (
                  // RAU-52: the FINAL confirm — armed once BOTH sides nominated.
                  // "Sí, tirar el MVP" locks the picks; there is NO going back
                  // after it (the summary below has no "change nominations").
                  <>
                    <span className="text-xs font-bold text-[#d11938]">
                      {t("match.resolve.confirmTitle")}
                    </span>
                    <button
                      type="button"
                      onClick={() => void doRoll()}
                      disabled={rolling}
                      className="rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      {rolling ? t("match.resolve.rolling") : t("match.resolve.confirmRoll")}
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirming(false)}
                      disabled={rolling}
                      className="rounded-sm border border-slate-300 px-3 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
                    >
                      {t("match.resolve.confirmCancel")}
                    </button>
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirming(true)}
                    disabled={!canRoll}
                    className="ml-2 rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {rolling ? t("match.resolve.rolling") : t("match.resolve.roll")}
                  </button>
                )}
              </div>
            </>
          ) : rolled && !resolved ? (
            <>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("match.resolve.summary")}
              </h4>
              <TeamSummarySection
                name={homeName}
                roster={homeRoster}
                mvp={roll.mvp.home}
                winnings={winnings.home}
                ffRoll={roll.ffRoll.home}
                pe={teamPe(detail, "home", roll.mvp.home)}
                nameOf={nameOf}
                t={t}
              />
              <TeamSummarySection
                name={awayName}
                roster={awayRoster}
                mvp={roll.mvp.away}
                winnings={winnings.away}
                ffRoll={roll.ffRoll.away}
                pe={teamPe(detail, "away", roll.mvp.away)}
                nameOf={nameOf}
                t={t}
              />
              <div className="flex justify-end border-t border-[#e2e8f0] pt-3">
                {/* RAU-52: NO going back after the final confirm — the picks
                    are locked once the MVP was rolled; the only way forward is
                    "Guardar y reportar" (THE closure). */}
                <button
                  type="button"
                  onClick={() => void doSave()}
                  disabled={saving}
                  className="rounded-sm bg-[#d11938] px-4 py-2 text-sm font-bold text-white hover:bg-[#b0142f] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {saving ? t("match.resolve.saving") : t("match.resolve.save")}
                </button>
              </div>
            </>
          ) : (
            // RAU-14: the LAST step of the resolution sequence — the post-match
            // journeyman (Novato) hire step (checkboxes + Contratar marcados /
            // Dejar ir). Renders for the viewer's OWN side only; the modal
            // closes itself once nothing remains to hire.
            <>
              {ownSide && ownName ? (
                <JourneymenHireStep
                  leagueId={detail.fixture.leagueId}
                  fixtureId={detail.fixture.id}
                  side={ownSide}
                  team={
                    ownSide === "home"
                      ? { name: homeName, raceId: detail.homeTeam.raceId }
                      : { name: awayName, raceId: detail.awayTeam.raceId }
                  }
                  journeymen={ownJourneymen}
                  onUpdated={onNominated}
                />
              ) : null}
              <div className="flex justify-end border-t border-[#e2e8f0] pt-3">
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
        </div>
      </div>
    </div>
  );
}

/** RAU-52: the viewer's OWN team's MJP nomination CHECKBOXES (alive+available
 * roster only; Journeymen included and labeled "Novato", RAU-13) + the
 * "Guardar mis nominaciones" action and status line. The rulebook MAX (6) is
 * enforced: a 7th checkbox is disabled, and the toggle never exceeds it. */
function OwnNominationSection({
  name,
  raceId,
  roster,
  selected,
  saved,
  nominating,
  onToggle,
  onSave,
  t,
}: {
  name: string;
  /** The OWN side's race id, so the option labels resolve the positional name. */
  raceId: string;
  roster: RosterPlayerRef[];
  selected: string[];
  saved: boolean;
  nominating: boolean;
  onToggle: (id: string) => void;
  onSave: () => void;
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
          // RAU-52: the MAX is enforced at the CONTROL level — an un-checked
          // player is not selectable once 6 are already checked.
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
          disabled={!ready || nominating}
          className="rounded-sm bg-[#12225a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {nominating ? t("match.resolve.nominating") : t("match.resolve.nominate")}
        </button>
      </div>
    </section>
  );
}

/** RAU-51: a READ-ONLY per-side status — never the player picks. Used for the
 * coach's rival side and for every side an admin/bye viewer sees. */
function SideStatusSection({ name, status }: { name: string; status: string }) {
  return (
    <section aria-label={name} className="border border-[#e2e8f0] p-3">
      <h5 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#12225a]">{name}</h5>
      <p className="text-sm text-slate-600">{status}</p>
    </section>
  );
}

/** The summary block for one team after the server roll. */
function TeamSummarySection({
  name,
  roster,
  mvp,
  winnings,
  ffRoll,
  pe,
  nameOf,
  t,
}: {
  name: string;
  roster: RosterPlayerRef[];
  mvp: string;
  winnings: number;
  ffRoll: FanFactorRoll;
  pe: { rosterPlayerId: string; pe: number }[];
  nameOf: (roster: RosterPlayerRef[], id: string | null | undefined) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  // RAU-52: the post-match fan-factor verdict glyph (rulebook p. 103) — the
  // dedicated-fans attribute goes ↑ / stays = / goes ↓ with the 1D6 roll.
  const ffGlyph = ffRoll.direction === "up" ? "↑" : ffRoll.direction === "down" ? "↓" : "=";
  return (
    <section aria-label={name} className="border border-[#e2e8f0] p-3">
      <h5 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#12225a]">{name}</h5>
      <ul className="space-y-1 text-sm text-slate-700">
        <li className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500">{t("match.resolve.mvp")}</span>
          <span className="text-[#12225a]">
            {t("match.resolve.mvpLine", { player: nameOf(roster, mvp), pe: PE_MVP })}
          </span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500">{t("match.resolve.winnings")}</span>
          <span className="tabular-nums">{winnings.toLocaleString("es-ES")} gp.</span>
        </li>
        <li className="flex justify-between gap-3">
          <span className="font-semibold text-slate-500">{t("match.resolve.fans")}</span>
          <span className="tabular-nums">
            {t("match.resolve.fansRoll", { direction: ffGlyph, roll: ffRoll.roll })}
          </span>
        </li>
        <li className="flex flex-col gap-0.5">
          <span className="font-semibold text-slate-500">{t("match.resolve.pe")}</span>
          <span className="flex flex-col gap-0.5 text-right">
            {pe.map((row) => (
              <span key={row.rosterPlayerId} className="tabular-nums">
                {t("match.resolve.peLine", { pe: row.pe, player: nameOf(roster, row.rosterPlayerId) })}
              </span>
            ))}
          </span>
        </li>
      </ul>
    </section>
  );
}
