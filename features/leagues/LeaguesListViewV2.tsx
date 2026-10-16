"use client";

import { useCallback, useState } from "react";
import { useSession } from "next-auth/react";
import { useI18n } from "@/lib/i18n";
import { CreateLeagueModal } from "./CreateLeagueModal";
import { LeagueCard } from "./LeagueList";
import { useLeagues } from "./useLeagues";
import { isOwnerEquivalent } from "./access";
import type { League } from "./api";

/**
 * Leagues list V2 (ui-refresh seam #5, UIR-2): presentation-only mirror of
 * `LeagueList` driven by the SAME legacy machinery — `useLeagues` (the single
 * `GET /api/leagues`), `useSession`, `isOwnerEquivalent` — and the SAME
 * shared atoms (`LeagueCard`, `StatusBadge` inside it, `CreateLeagueModal`).
 * The `myLeagues`/`openLeagues` partition is byte-identical to legacy, so
 * requests and results never diverge; only markup does.
 *
 * Legacy ids (`leagues-heading`, `my-leagues-heading`, `open-leagues-heading`)
 * stay out of V2 so the never-both assertion can use them as markers; V2
 * landmarks are the `ui-v2-leagues-*` testids. Spanish copy via the existing
 * `leagues.*` keys (leagues chrome is Spanish per AGENTS.md).
 *
 * Slice 1: functional core (hero, CTA + modal, both sections, empty/error).
 * Slice 2: Stitch chrome ("Ligas (/leagues)" / "M 09") + mobile layout.
 */
export function LeaguesListViewV2() {
  const { leagues, loading, error, refresh } = useLeagues();
  const { data: session } = useSession();
  const { t } = useI18n();
  const [modalOpen, setModalOpen] = useState(false);

  // Same post-create wiring as legacy: the modal closes itself (it calls
  // onClose before onCreate) and onCreate refreshes the list — identical
  // channel, no duplicated behavior.
  const handleRefresh = useCallback(async () => {
    await refresh();
  }, [refresh]);

  const userId = session?.user?.id;
  const role = session?.user?.role;
  // Same partition semantics as legacy (LAC-5 included): owned OR joined
  // leagues (any status) under "Mis Ligas"; foreign OPEN leagues under
  // "Ligas abiertas".
  const isOwnerEquivalentLeague = (league: League) =>
    league.canManage === true || isOwnerEquivalent(league, userId, role);
  const myLeagues = leagues.filter(
    (league) => isOwnerEquivalentLeague(league) || league.isMember,
  );
  const openLeagues = leagues.filter(
    (league) =>
      league.status === "open" &&
      !isOwnerEquivalentLeague(league) &&
      !league.isMember,
  );

  return (
    <section aria-labelledby="ui-v2-leagues-title">
      {/* Hero */}
      <header
        data-testid="ui-v2-leagues-hero"
        className="mb-5 flex flex-wrap items-center justify-between gap-3 bg-navy px-4 py-[22px] text-white sm:px-6"
      >
        <div className="min-w-0">
          <h1
            id="ui-v2-leagues-title"
            className="border-b-[3px] border-red pb-1 text-2xl font-black tracking-[0.02em] md:text-[24px]"
          >
            {t("leagues.myLeagues")}
          </h1>
          <p className="mt-1 text-[13px] text-border-subtle">{t("leagues.heroSubtitle")}</p>
        </div>
        <button
          type="button"
          data-testid="ui-v2-leagues-create-cta"
          onClick={() => setModalOpen(true)}
          className="rounded-md border-2 border-red bg-red px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-red-hover"
        >
          {t("leagues.newLeague")}
        </button>
      </header>

      {loading ? null : error ? (
        <div
          data-testid="ui-v2-leagues-error"
          className="border border-slate-200 bg-panel p-8 text-center"
        >
          <p className="text-sm text-red-600">{error}</p>
        </div>
      ) : leagues.length === 0 ? (
        <div
          data-testid="ui-v2-leagues-empty"
          className="border border-slate-200 bg-panel p-8 text-center"
        >
          <p className="text-sm text-slate-600">{t("leagues.empty")}</p>
          <button
            type="button"
            data-testid="ui-v2-leagues-create-cta-empty"
            onClick={() => setModalOpen(true)}
            className="mt-4 inline-block bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy-hover"
          >
            {t("leagues.newLeague")}
          </button>
        </div>
      ) : (
        <>
          <section
            data-testid="ui-v2-leagues-section-my"
            aria-labelledby="ui-v2-leagues-my-heading"
            className="mb-8"
          >
            <h2
              id="ui-v2-leagues-my-heading"
              className="mb-3 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-500"
            >
              {t("leagues.myLeagues")}
            </h2>
            {myLeagues.length === 0 ? (
              <p className="border border-slate-200 bg-panel p-6 text-center text-sm text-slate-600">
                {t("leagues.myEmpty")}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {myLeagues.map((league) => (
                  <LeagueCard key={league.id} league={league} />
                ))}
              </ul>
            )}
          </section>

          <section
            data-testid="ui-v2-leagues-section-open"
            aria-labelledby="ui-v2-leagues-open-heading"
          >
            <h2
              id="ui-v2-leagues-open-heading"
              className="mb-3 border-b border-slate-200 pb-1 text-sm font-bold uppercase tracking-wide text-slate-500"
            >
              {t("leagues.openLeagues")}
            </h2>
            {openLeagues.length === 0 ? (
              <p className="border border-slate-200 bg-panel p-6 text-center text-sm text-slate-600">
                {t("leagues.openEmpty")}
              </p>
            ) : (
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {openLeagues.map((league) => (
                  <LeagueCard key={league.id} league={league} />
                ))}
              </ul>
            )}
          </section>
        </>
      )}

      <CreateLeagueModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreate={handleRefresh}
      />
    </section>
  );
}
