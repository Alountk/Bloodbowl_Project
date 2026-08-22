"use client";

import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getRaceById } from "@/features/teams/data/races";
import { linemanPositionalOf } from "@/lib/journeymen";
import { hireJourneyman } from "./api";

/**
 * RAU-14/RAU-52: the post-resolve journeyman (Novato) HIRE STEP — the last
 * step of the end-of-match resolution sequence, shown AFTER the MVP roll +
 * the final confirm (the resolve already collected the match winnings, so the
 * hire cost is subtracted from the treasury AFTER them). Each side's OWNER
 * sees their fielded journeymen that are not yet hired-or-gone with
 * CHECKBOXES to mark which to hire:
 *
 * - "Contratar marcados" POSTs `hireJourneyman { hire: true }` for each
 *   checked novato: the journeyman's cost (the race Lineman positional) is
 *   PAID IN CASH from the treasury (the server decrements it) and they become
 *   a permanent roster player (their persisted journeyman name,
 *   `positionalKey` = the race Lineman — RAU-11 style). The server enforces
 *   the treasury affordability + the 16-roster cap.
 * - "Dejar ir" POSTs `hireJourneyman { hire: false }`: the option is removed,
 *   nothing else mutates.
 *
 * Every decision refreshes via `onUpdated` (the parent re-fetches the match
 * detail), so the step disappears when no journeymen remain. Renders nothing
 * when the side has no remaining journeymen.
 */
export function JourneymenHireStep({
  leagueId,
  fixtureId,
  side,
  team,
  journeymen,
  onUpdated,
}: {
  leagueId: string;
  fixtureId: string;
  side: "home" | "away";
  team: { name: string; raceId: string };
  journeymen: { id: string; name: string }[];
  onUpdated: () => Promise<void>;
}) {
  const { t, locale } = useI18n();
  const [selected, setSelected] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (journeymen.length === 0) return null;

  // RAU-14: the offer price is the race's core Lineman positional cost — the
  // same server-side derivation the hire command charges (display-only here).
  const lineman = linemanPositionalOf(getRaceById(team.raceId));
  const cost = lineman?.cost ?? 0;
  const formattedCost = cost.toLocaleString(locale === "en" ? "en-US" : "es-ES");

  const hireChecked = async () => {
    if (selected.length === 0 || busy) return;
    setBusy(true);
    setError(null);
    try {
      for (const journeymanId of selected) {
        await hireJourneyman(leagueId, fixtureId, side, journeymanId, true);
      }
      await onUpdated();
      setSelected([]);
    } catch (e) {
      setError(e instanceof Error ? e.message : t("match.journeymen.error"));
    } finally {
      setBusy(false);
    }
  };

  const letGo = async (journeymanId: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await hireJourneyman(leagueId, fixtureId, side, journeymanId, false);
      await onUpdated();
      setSelected((prev) => prev.filter((id) => id !== journeymanId));
    } catch (e) {
      setError(e instanceof Error ? e.message : t("match.journeymen.error"));
    } finally {
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={t("match.journeymen.aria")}
      data-testid="journeymen-hire"
      className="border border-[#e2e8f0] bg-white p-3"
    >
      <h4 className="text-xs font-bold uppercase tracking-wide text-slate-500">
        {t("match.journeymen.title")}
      </h4>
      <p className="mt-1 text-xs font-semibold text-slate-500">{t("match.journeymen.hint")}</p>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-600">
          {error}
        </p>
      ) : null}
      <ul className="mt-2 space-y-1">
        {journeymen.map((j) => (
          <li
            key={j.id}
            className="flex flex-wrap items-center justify-between gap-2 border-t border-[#e2e8f0] pt-2"
          >
            <label className="flex min-w-0 flex-1 items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                aria-label={t("match.journeymen.checkHire", { name: j.name, cost: formattedCost })}
                checked={selected.includes(j.id)}
                disabled={busy}
                onChange={() =>
                  setSelected((prev) =>
                    prev.includes(j.id) ? prev.filter((id) => id !== j.id) : [...prev, j.id],
                  )
                }
                className="accent-[#12225a]"
              />
              <span className="truncate">
                {t("match.journeymen.checkHire", { name: j.name, cost: formattedCost })}
              </span>
            </label>
            <button
              type="button"
              onClick={() => void letGo(j.id)}
              disabled={busy}
              className="rounded-sm border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:border-slate-400 disabled:opacity-50"
            >
              {t("match.journeymen.letGo")}
            </button>
          </li>
        ))}
      </ul>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs font-semibold text-slate-600">
          {t("match.journeymen.counter", { count: selected.length })}
        </p>
        <button
          type="button"
          onClick={() => void hireChecked()}
          disabled={selected.length === 0 || busy}
          className="rounded-sm bg-[#12225a] px-3 py-1.5 text-xs font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("match.journeymen.hireChecked")}
        </button>
      </div>
    </section>
  );
}
