"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { PE_MVP } from "@/lib/rules";
import { addMvpPe, deriveLivePeAwards } from "@/lib/liveResolve";
import { positionName } from "./liveControls";
import {
  nominateMvp,
  rollLiveMvp,
  resolveLiveMatch,
  type LiveMvpRoll,
  type MatchDetail,
} from "./api";

/** A roster player reference (id + name), shared with the result modal. The
 * optional dorsal/positionalKey power the "Name (Position · #N)" MJP picker
 * labels (RAU-13); the summary sections only use id + name. */
export interface RosterPlayerRef {
  id: string;
  name: string;
  dorsal?: number;
  positionalKey?: string;
}

/** Six empty MJP nomination slots per team. */
function emptyNominations(): string[] {
  return Array.from({ length: 6 }, () => "");
}

/** True when a team has exactly six DISTINCT nominations selected. */
function nominationsReady(nominations: readonly string[]): boolean {
  return (
    nominations.length === 6 &&
    new Set(nominations.filter(Boolean)).size === 6
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

  const viewerSide = detail.live?.viewerSide ?? null;
  const nominations = detail.live?.mvpNominations ?? { home: null, away: null };
  const ownSide = viewerSide;
  const rivalSide = ownSide === "home" ? "away" : ownSide === "away" ? "home" : null;
  const ownNomination = ownSide ? nominations[ownSide] : null;
  const rivalNominated = rivalSide != null && nominations[rivalSide] != null;
  const bothNominated = nominations.home != null && nominations.away != null;

  // RAU-51: the draft is seeded ONCE from the PERSISTED per-side nomination so
  // a reload never loses the coach's own picks (re-saves replace; while the
  // modal stays open the draft is the client's local working copy).
  const [draft, setDraft] = useState<string[]>(() => {
    if (ownSide && ownNomination) {
      const next = emptyNominations();
      ownNomination.slice(0, 6).forEach((id, i) => {
        next[i] = id;
      });
      return next;
    }
    return emptyNominations();
  });

  // RAU-51: the pickers are fed ONLY the viewer's own team's alive+available
  // roster (RAU-12: exclude missNextMatch) — a coach never sees the rival's
  // players here. RAU-13: Journeymen are excluded too — they earn no PE and
  // can never be the MJP grantee (the server would reject them as foreign).
  // The dorsal (RAU-13) is the served-array index + 1 (D21), so the picker
  // labels match the FAB combos and the feed.
  const ownRoster = useMemo<RosterPlayerRef[]>(() => {
    const players = ownSide === "home" ? detail.homeTeam.players : detail.awayTeam.players;
    return players
      .filter((p) => p.alive && !p.missNextMatch && !p.journeyman)
      .map((p) => ({
        id: p.rosterPlayerId,
        name: p.name,
        dorsal: players.indexOf(p) + 1,
        positionalKey: p.positionalKey,
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
      await onResolved();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("match.resolve.saveError"));
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
                  {/* RAU-51: ONLY the viewer's own side is editable — the pickers
                      list their OWN alive+available roster; the rival is a
                      read-only status that never leaks the rival's picks. */}
                  <OwnNominationSection
                    name={ownName}
                    raceId={ownSide === "home" ? detail.homeTeam.raceId : detail.awayTeam.raceId}
                    roster={ownRoster}
                    nominations={draft}
                    saved={ownNomination != null}
                    nominating={nominating}
                    onSlot={(index, value) => {
                      const next = [...draft];
                      next[index] = value;
                      setDraft(next);
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
              <p className="text-[11px] text-slate-500">{t("match.resolve.mvpHint")}</p>
              <div className="flex justify-end border-t border-[#e2e8f0] pt-3">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
                >
                  {t("common.cancel")}
                </button>
                <button
                  type="button"
                  onClick={() => void doRoll()}
                  disabled={!canRoll}
                  className="ml-2 rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {rolling ? t("match.resolve.rolling") : t("match.resolve.roll")}
                </button>
              </div>
            </>
          ) : (
            <>
              <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
                {t("match.resolve.summary")}
              </h4>
              <TeamSummarySection
                name={homeName}
                roster={homeRoster}
                mvp={roll.mvp.home}
                winnings={winnings.home}
                postFf={roll.postFf.home}
                pe={teamPe(detail, "home", roll.mvp.home)}
                nameOf={nameOf}
                t={t}
              />
              <TeamSummarySection
                name={awayName}
                roster={awayRoster}
                mvp={roll.mvp.away}
                winnings={winnings.away}
                postFf={roll.postFf.away}
                pe={teamPe(detail, "away", roll.mvp.away)}
                nameOf={nameOf}
                t={t}
              />
              <div className="flex justify-end gap-2 border-t border-[#e2e8f0] pt-3">
                <button
                  type="button"
                  onClick={() => {
                    setRoll(null);
                    setError(null);
                  }}
                  disabled={saving}
                  className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
                >
                  {t("match.resolve.back")}
                </button>
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
          )}
        </div>
      </div>
    </div>
  );
}

/** RAU-51: the viewer's OWN team's six numbered MJP pickers (alive+available
 * roster only) + the "Guardar mis nominaciones" action and status line. */
function OwnNominationSection({
  name,
  raceId,
  roster,
  nominations,
  saved,
  nominating,
  onSlot,
  onSave,
  t,
}: {
  name: string;
  /** The OWN side's race id, so the option labels resolve the positional name. */
  raceId: string;
  roster: RosterPlayerRef[];
  nominations: string[];
  saved: boolean;
  nominating: boolean;
  onSlot: (index: number, value: string) => void;
  onSave: () => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  const ready = nominationsReady(nominations);
  return (
    <section aria-label={t("match.resolve.ownNomination")} className="border border-[#e2e8f0] p-3">
      <h5 className="mb-2 text-sm font-bold uppercase tracking-wide text-[#12225a]">{name}</h5>
      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 6 }, (_, i) => (
          <label key={i} className="text-xs font-medium text-slate-600">
            {t("match.resolve.mvpSlot", { n: i + 1, name })}
            <select
              value={nominations[i] ?? ""}
              onChange={(e) => onSlot(i, e.target.value)}
              aria-label={t("match.resolve.mvpSlot", { n: i + 1, name })}
              className="ml-1 rounded-sm border border-slate-300 px-1.5 py-1 text-sm text-slate-800"
            >
              <option value="">—</option>
              {roster.map((player) => (
                <option key={player.id} value={player.id}>
                  {`${player.name} (${positionName(raceId, player.positionalKey ?? "lineman")} · #${player.dorsal ?? 0})`}
                </option>
              ))}
            </select>
          </label>
        ))}
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
  postFf,
  pe,
  nameOf,
  t,
}: {
  name: string;
  roster: RosterPlayerRef[];
  mvp: string;
  winnings: number;
  postFf: number;
  pe: { rosterPlayerId: string; pe: number }[];
  nameOf: (roster: RosterPlayerRef[], id: string | null | undefined) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
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
          <span className="tabular-nums">{t("match.resolve.fansLine", { value: postFf })}</span>
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
