"use client";

import { useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { PE_MVP } from "@/lib/rules";
import { addMvpPe, deriveLivePeAwards } from "@/lib/liveResolve";
import {
  rollLiveMvp,
  resolveLiveMatch,
  type LiveMvpRoll,
  type MatchDetail,
} from "./api";

/** A roster player reference (id + name), shared with the result modal. */
export interface RosterPlayerRef {
  id: string;
  name: string;
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
 * RAU-49 resolution modal — the guided end-of-match sequence that REPLACES the
 * manual result form for a FINISHED LIVE match. Two steps:
 *  1. MVP step (mandatory): six numbered MJP nominations per team; "Tirar MVP"
 *     POSTs the server-owned `rollMvp` command so the server (never the client)
 *     rolls the 1D6 per team, reveals the grantees + post-match FF and persists
 *     them (`LiveMatch.pendingResolution`) so the commit reuses the SAME rolls.
 *  2. Summary step: per team — MVP (+4 PE), winnings (→ treasury, already
 *     persisted at finish, RAU-44), dedicated-fans roll and the PE earned from
 *     the match. "Guardar y reportar" POSTs `resolveMatch` (THE closure);
 *     `onResolved` lets the parent refresh the detail.
 * The resolve POST itself rejects without the six nominations (MVP is
 * mandatory); the modal mirrors that contract client-side.
 */
export function MatchResolveModal({
  open,
  detail,
  onClose,
  onResolved,
}: {
  open: boolean;
  detail: MatchDetail;
  onClose: () => void;
  onResolved: () => Promise<void>;
}) {
  const { t } = useI18n();
  const [home, setHome] = useState<string[]>(emptyNominations);
  const [away, setAway] = useState<string[]>(emptyNominations);
  const [roll, setRoll] = useState<LiveMvpRoll | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [rolling, setRolling] = useState(false);
  const [saving, setSaving] = useState(false);

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
  const canRoll = nominationsReady(home) && nominationsReady(away);
  const winnings = detail.liveWinnings ?? { home: 0, away: 0 };

  const nameOf = (roster: RosterPlayerRef[], id: string | null | undefined) =>
    roster.find((p) => p.id === id)?.name ?? id ?? "—";

  const doRoll = async () => {
    setError(null);
    setRolling(true);
    try {
      const result = await rollLiveMvp(detail.fixture.leagueId, detail.fixture.id, { home, away });
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
      await resolveLiveMatch(detail.fixture.leagueId, detail.fixture.id, { home, away });
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
              <TeamNominationSection
                name={homeName}
                roster={homeRoster}
                nominations={home}
                onSlot={(index, value) => {
                  const next = [...home];
                  next[index] = value;
                  setHome(next);
                }}
                t={t}
              />
              <TeamNominationSection
                name={awayName}
                roster={awayRoster}
                nominations={away}
                onSlot={(index, value) => {
                  const next = [...away];
                  next[index] = value;
                  setAway(next);
                }}
                t={t}
              />
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
                  disabled={!canRoll || rolling}
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

/** One team's six numbered MJP nomination pickers. */
function TeamNominationSection({
  name,
  roster,
  nominations,
  onSlot,
  t,
}: {
  name: string;
  roster: RosterPlayerRef[];
  nominations: string[];
  onSlot: (index: number, value: string) => void;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <section aria-label={t("match.resolve.mvpStep")} className="border border-[#e2e8f0] p-3">
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
                  {player.name}
                </option>
              ))}
            </select>
          </label>
        ))}
      </div>
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
