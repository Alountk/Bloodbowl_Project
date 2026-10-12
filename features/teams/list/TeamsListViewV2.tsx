"use client";

import Link from "next/link";
import { useState } from "react";
import { useApp } from "@/app/providers/AppProvider";
import { useI18n } from "@/lib/i18n";
import { TeamEmblem } from "@/features/leagues/TeamEmblem";
import { TeamSearch } from "../TeamSearch";
import { TeamDeleteModal } from "../TeamDeleteModal";
import { useLeagueNameMap } from "../useLeagueNameMap";
import { getRaceById } from "../data/races";
import { ArchiveGuardError } from "../store/ApiTeamStore";
import {
  computeCoachingCost,
  computeRosterCostFromPlayers,
  computeSpendableBalance,
} from "../roster";
import { formatRulebookCost } from "../format";
import type { Race, Team } from "../types";

/**
 * ui-refresh teams list V2 surface (UIR-2 / UIR-4) — full Stitch translation
 * ("05 teams" desktop / "M 05" mobile), slice 2.
 *
 * Second declared seam (`app/teams/page.tsx`): mounted INSTEAD of legacy
 * `TeamsPage` when the `bb-ui` flag is ON, called with ZERO props — the seam
 * calls both surfaces bare, so the props contract is identical by
 * construction.
 *
 * Behavior mirrors the legacy surface through the SAME shared channels —
 * `useApp` (store handlers + search query), `useLeagueNameMap` (one shared
 * `listLeagues` fetch), the reused `TeamSearch` and `TeamDeleteModal`
 * components — while the markup is translated to the `ui-v2-teams-*`
 * vocabulary: page header + create CTA (a sticky bottom bar below the `sm`
 * breakpoint, per Stitch "M 05"; no hamburger — `AppNav` owns the drawer),
 * leagueId sections, full cards (`TeamEmblem`, name link KEEPING the
 * `/teams/{id}` href the e2e harness clicks, race, TV, treasury, league
 * badge, delete control) and the empty / no-match states.
 *
 * Presentation-only contract (UIR-2): MUST NOT import `features/teams/api` —
 * no data-fetching or mutation path beyond what legacy already uses through
 * shared providers (enforced by TeamsListViewV2.test.tsx). Consequence: no
 * per-card progression fetch like the legacy card performs, so the card TV
 * is roster + coaching cost (progression valueBonus excluded by design) and
 * the ready-to-improve hint is not rendered.
 *
 * Responsive strategy per design decisions table: Tailwind breakpoints
 * (`grid sm:grid-cols-2 lg:grid-cols-3`) — the list degrades to stacked
 * cards below 640px without a JS branch.
 *
 * Testid vocabulary is `ui-v2-teams-*` ONLY — the legacy section heading ids
 * and legacy card testids (TeamsPage / TeamCard) are never reused, so the
 * never-both assertions hold at the seam.
 *
 * Flip discipline (UIR-5): the flag default STAYS OFF (legacy). `useUiFlag()`
 * is consumed only by the two declared seams; no default flip ships with
 * this change.
 */

/**
 * Rulebook-styled Spanish copy for the delete-modal 409 guard, matching the
 * home-list and legacy teams-page message. The league name comes from the
 * league map (no extra fetch).
 */
function guardMessageFor(leagueName: string): string {
  return `No se puede borrar este equipo — pertenece a la liga ${leagueName}. Para poder borrarlo, primero expulsalo de la liga.`;
}

export function TeamsListViewV2() {
  const { t } = useI18n();
  const { teams, isHydrated, searchQuery, removeTeam } = useApp();
  const { leagueNameMap } = useLeagueNameMap();
  const [pendingTeam, setPendingTeam] = useState<Team | null>(null);
  const [guardMessage, setGuardMessage] = useState<string | null>(null);

  // Same hydration gate as legacy: no flash of empty sections.
  if (!isHydrated) return null;

  // Same filter channel as legacy: name OR race name against the shared
  // TeamSearch query, then split the visible list by leagueId.
  const query = searchQuery.trim().toLowerCase();
  const visible = query
    ? teams.filter((team) => {
        const race = getRaceById(team.raceId);
        return (
          team.name.toLowerCase().includes(query) ||
          race?.name.toLowerCase().includes(query)
        );
      })
    : teams;

  const unassigned = visible.filter((team) => team.leagueId === null);
  const assigned = visible.filter((team) => team.leagueId !== null);

  const openDelete = (team: Team) => {
    setGuardMessage(null);
    setPendingTeam(team);
  };

  // SAME handler channel legacy TeamsPage wires: removeTeam from useApp
  // (store.remove). On a 409 archive guard the modal keeps the team and
  // swaps to the Spanish guard copy; any other error closes the modal.
  const handleConfirm = async (id: string) => {
    try {
      await removeTeam(id);
      setPendingTeam(null);
      setGuardMessage(null);
    } catch (err) {
      if (err instanceof ArchiveGuardError) {
        const team = teams.find((t) => t.id === id) ?? pendingTeam;
        let name = "";
        if (team?.leagueId) {
          // League name from the map; an unresolved/stale id falls back to the
          // league id so the block is still surfaced without a crash.
          name = leagueNameMap.get(team.leagueId) ?? team.leagueId;
        }
        setGuardMessage(guardMessageFor(name));
      } else {
        setPendingTeam(null);
        setGuardMessage(null);
      }
    }
  };

  const card = (team: Team) => {
    const catalogRace = getRaceById(team.raceId);
    // Race-not-in-catalog fallback (same convention as the legacy TeamCard):
    // an unknown race id renders as its raw id with zero costs.
    const race: Race = catalogRace ?? {
      id: team.raceId,
      name: team.raceId,
      rerollCost: 0,
      positionals: [],
    };
    // Presentation-only: no per-card progression fetch (UIR-2), so the TV is
    // roster + coaching cost — the progression valueBonus legacy adds via its
    // own fetch is intentionally excluded.
    const tv =
      computeRosterCostFromPlayers(race, team.roster) +
      computeCoachingCost(race, team.coaching);
    const treasury = computeSpendableBalance(team, race);
    const leagueName = team.leagueId
      ? leagueNameMap.get(team.leagueId)
      : undefined;

    return (
      <li
        key={team.id}
        data-testid={`ui-v2-teams-card-${team.id}`}
        className="flex flex-col overflow-hidden border border-border bg-panel"
      >
        <div className="h-[6px] border-b-2 border-red bg-navy" />
        <Link href={`/teams/${team.id}`} className="flex flex-col gap-2 p-4">
          <div className="flex items-center gap-3">
            <TeamEmblem
              teamId={team.id}
              name={team.name}
              size="md"
              emblem={team.emblem}
            />
            <div className="min-w-0 flex-1">
              <h3 className="truncate text-[15px] font-extrabold text-navy">
                {team.name}
              </h3>
              <p className="text-xs text-slate-500">{race.name}</p>
            </div>
          </div>

          {leagueName ? (
            <span className="inline-flex w-fit items-center gap-1 rounded-full bg-navy-tint px-2.5 py-0.5 text-[11px] font-bold text-white">
              {leagueName}
            </span>
          ) : null}

          <div className="flex items-center gap-3 text-[12px] text-slate-700">
            <span>
              TV:{" "}
              <b
                data-testid={`ui-v2-teams-card-${team.id}-tv`}
                className="text-navy"
              >
                {formatRulebookCost(tv)}
              </b>
            </span>
            <span>
              {t("teams.treasury")}:{" "}
              <b
                data-testid={`ui-v2-teams-card-${team.id}-treasury`}
                className="text-navy"
              >
                {formatRulebookCost(treasury)}
              </b>
            </span>
          </div>
        </Link>
        {/* Same accessible name convention as the legacy TeamCard control. */}
        <div className="mt-auto flex justify-end px-3 pb-3">
          <button
            type="button"
            aria-label={`Eliminar ${team.name}`}
            onClick={() => openDelete(team)}
            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-600 hover:border-red hover:text-red"
          >
            Eliminar
          </button>
        </div>
      </li>
    );
  };

  const section = (list: Team[], testId: string, headingId: string, title: string) =>
    list.length === 0 ? null : (
      <section data-testid={testId} aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="mb-3 border-b-[3px] border-red pb-1.5 text-lg font-bold text-navy"
        >
          {title}
        </h2>
        {/* Mobile: single stacked column; sm/lg: desktop grid (design decision). */}
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map(card)}
        </ul>
      </section>
    );

  return (
    <div data-testid="ui-v2-teams-grid" className="flex flex-col gap-6">
      {/* Page header per Stitch "05 teams": title + primary CTA. Below the sm
          breakpoint the CTA docks to the bottom as a sticky action bar
          (Stitch "M 05"); `position: static` from `sm:` puts it back in the
          header row and neutralizes the inset offsets. */}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h1 className="border-b-[3px] border-red pb-1.5 text-2xl font-black text-navy">
          {t("teams.heading")}
        </h1>
        <Link
          href="/teams/create"
          data-testid="ui-v2-teams-create-cta"
          className="fixed inset-x-4 bottom-4 z-20 block bg-navy px-4 py-3 text-center text-sm font-bold text-white shadow-[0_2px_8px_rgba(0,0,0,0.25)] hover:bg-navy-hover sm:static sm:z-auto sm:px-4 sm:py-2.5 sm:shadow-none"
        >
          {t("teams.createNew")}
        </Link>
      </div>

      <TeamSearch />

      {visible.length === 0 ? (
        teams.length === 0 ? (
          <div
            data-testid="ui-v2-teams-empty"
            className="border border-slate-200 bg-panel p-8 text-center"
          >
            <p className="text-sm text-slate-600">{t("teams.empty")}</p>
            <Link
              href="/teams/create"
              className="mt-4 inline-block bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy-hover"
            >
              {t("teams.createNew")}
            </Link>
          </div>
        ) : (
          <div
            data-testid="ui-v2-teams-no-match"
            className="border border-slate-200 bg-panel p-8 text-center"
          >
            <p className="text-sm text-slate-600">{t("teams.noMatch")}</p>
          </div>
        )
      ) : (
        <>
          {section(
            unassigned,
            "ui-v2-teams-section-unassigned",
            "ui-v2-teams-heading-unassigned",
            t("teams.unassigned"),
          )}
          {section(
            assigned,
            "ui-v2-teams-section-assigned",
            "ui-v2-teams-heading-assigned",
            t("teams.inLeague"),
          )}
        </>
      )}

      <TeamDeleteModal
        team={pendingTeam}
        onCancel={() => {
          setPendingTeam(null);
          setGuardMessage(null);
        }}
        onConfirm={(id) => {
          void handleConfirm(id);
        }}
        guardMessage={guardMessage}
      />
    </div>
  );
}
