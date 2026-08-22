"use client";

import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { UpcomingMatchCard } from "./UpcomingMatchCard";
import { useUpcomingMatches } from "./useUpcomingMatches";
import { groupUpcomingFixtures } from "./groupUpcomingFixtures";

/**
 * MatchesPage (Design B / MP-1, MP-4, MP-5): the dedicated `/matches` feature.
 * Loads the session user's upcoming fixtures via `useUpcomingMatches` and
 * groups them by date — "Hoy", one section per distinct future date (labelled
 * with the localized day), and a trailing "Sin programar" section for undated
 * fixtures. Zero upcoming, or an unavailable league API (local/anonymous), both
 * render the `matches.empty` panel — the same "rulebook-light" white panel used
 * by Teams/Dashboard — instead of failing (MP-4).
 */
export function MatchesPage() {
  const { t } = useI18n();
  const { data: session } = useSession();
  const userId = session?.user?.id;
  const { fixtures, loading, unavailable } = useUpcomingMatches(userId);

  const showEmpty = unavailable || fixtures.length === 0;

  if (loading) return null;

  return (
    <div className="flex flex-col gap-8">
      <h1 className="border-b-[3px] border-[#d11938] pb-1.5 text-2xl font-black tracking-[0.02em] text-[#12225a]">
        {t("matches.heading")}
      </h1>

      {showEmpty ? (
        <div className="border border-slate-200 bg-white p-8 text-center">
          <p className="text-sm text-slate-600">{t("matches.empty")}</p>
        </div>
      ) : (
        groupUpcomingFixtures(fixtures, new Date()).map((bucket, index) => {
          const heading =
            bucket.group === "today"
              ? t("matches.today")
              : bucket.group === "date"
                ? bucket.dayLabel
                : t("matches.unplanned");
          return (
            <section key={index} aria-labelledby={`matches-section-${index}`}>
              <h2
                id={`matches-section-${index}`}
                className="mb-3 border-b-[3px] border-[#d11938] pb-1.5 text-lg font-bold text-[#12225a]"
              >
                {heading}
              </h2>
              <ul className="grid gap-3 md:grid-cols-2">
                {bucket.fixtures.map((fixture) => (
                  <UpcomingMatchCard key={fixture.id} fixture={fixture} />
                ))}
              </ul>
            </section>
          );
        })
      )}
    </div>
  );
}
