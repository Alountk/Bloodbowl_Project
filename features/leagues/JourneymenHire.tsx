"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getRaceById } from "@/features/teams/data/races";
import { linemanPositionalOf } from "@/lib/journeymen";
import { hireJourneyman, type MatchDetail } from "./api";

/**
 * RAU-14: the post-resolve journeyman (Novato) hire panel. After a match is
 * reported ("Match reported"), each side's OWNER sees their fielded journeymen
 * that are not yet hired-or-gone, one offer per novato: "Tu novato {name} puede
 * quedarse por {cost}" with **Contratar** / **Dejar ir**.
 *
 * - "Contratar" POSTs `hireJourneyman { hire: true }`: the journeyman's cost
 *   (the race Lineman positional) is paid from the treasury and they become a
 *   permanent roster player (their persisted journeyman name, `positionalKey` =
 *   the race Lineman — RAU-11 style). The server enforces the spendable-balance
 *   formula + the 16-roster cap.
 * - "Dejar ir" POSTs `hireJourneyman { hire: false }`: the option is removed,
 *   nothing else mutates.
 *
 * Every decision refreshes via `onUpdated` (the parent re-fetches the match
 * detail), so the panel disappears when no journeymen remain. An admin/bye
 * viewer (no side) or a side with no persisted journeymen renders nothing.
 */
export function JourneymenHirePanel({
  detail,
  viewerSide,
  onUpdated,
}: {
  detail: MatchDetail;
  viewerSide: "home" | "away" | null;
  onUpdated: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  if (!viewerSide) return null;
  const sideTeam = viewerSide === "home" ? detail.homeTeam : detail.awayTeam;
  const journeymen = detail.live?.journeymen?.[viewerSide] ?? [];
  if (journeymen.length === 0) return null;

  // RAU-14: the offer price is the race's core Lineman positional cost — the
  // same server-side derivation the hire command charges (display-only here).
  const lineman = linemanPositionalOf(getRaceById(sideTeam.raceId));
  const cost = lineman?.cost ?? 0;
  const formattedCost = cost.toLocaleString(locale === "en" ? "en-US" : "es-ES");

  const decide = async (journeymanId: string, hire: boolean) => {
    setBusyId(journeymanId);
    setError(null);
    try {
      await hireJourneyman(detail.fixture.leagueId, detail.fixture.id, viewerSide, journeymanId, hire);
      await onUpdated();
    } catch (e) {
      setError(e instanceof Error ? e.message : t("match.journeymen.error"));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <section
      aria-label={t("match.journeymen.aria")}
      data-testid="journeymen-hire"
      className="border border-[#e2e8f0] bg-white p-4"
    >
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {t("match.journeymen.title")}
      </h4>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <ul className="mt-2 space-y-2">
        {journeymen.map((j) => (
          <li
            key={j.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e2e8f0] pt-2"
          >
            <p className="text-sm text-slate-700">
              {t("match.journeymen.offer", { name: j.name, cost: formattedCost })}
            </p>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => void decide(j.id, true)}
                disabled={busyId != null}
                className="rounded-sm bg-[#12225a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("match.journeymen.hire")}
              </button>
              <button
                type="button"
                onClick={() => void decide(j.id, false)}
                disabled={busyId != null}
                className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {t("match.journeymen.letGo")}
              </button>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
