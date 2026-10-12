"use client";

import Link from "next/link";
import { useApp } from "@/app/providers/AppProvider";
import { useI18n } from "@/lib/i18n";
import type { Team } from "@/features/teams/types";

/**
 * ui-refresh teams list V2 surface (UIR-2 / UIR-4) — SLICE 1 skeleton.
 *
 * Second declared seam (`app/teams/page.tsx`): mounted INSTEAD of legacy
 * `TeamsPage` when the `bb-ui` flag is ON, called with ZERO props — the seam
 * calls both surfaces bare, so the props contract is identical by
 * construction.
 *
 * Slice 1 renders the structural skeleton: the `ui-v2-teams-grid` marker,
 * the two sections split by `leagueId` (hidden when empty, legacy parity)
 * and one navigation row per team (`ui-v2-teams-card-<id>`, name link to
 * the detail route). The rows are REQUIRED for parity, not decoration: the
 * flag-ON detail e2e harness reaches `/teams/{id}` ONLY through the list
 * (the local store dies on reload, home and nav carry no team links), and
 * UIR-2 keeps behavior identical across variants. Slice 2 (tasks 2.1–2.2)
 * FINISHES the card translation (emblem, race, TV, treasury, league badge,
 * TeamSearch, CTA, empty states, responsive polish).
 *
 * Testid vocabulary is `ui-v2-teams-*` ONLY — legacy markers
 * (`teams-unassigned-heading`, `team-ctv`, `team-treasury`) are never
 * reused, so the never-both assertions hold at the seam.
 *
 * Presentation-only contract (UIR-2): shared providers only (`useApp`,
 * `useI18n`; slice 2 adds `useLeagueNameMap` / `TeamSearch`); MUST NOT
 * import `features/teams/api` — no new data-fetching or mutation paths
 * (enforced by TeamsListViewV2.test.tsx). NO hamburger: `AppNav` owns the
 * nav drawer on every route.
 *
 * Flip discipline (UIR-5): the flag default STAYS OFF (legacy). `useUiFlag()`
 * is consumed only by the two declared seams; no default flip ships with
 * this change.
 */
export function TeamsListViewV2() {
  const { t } = useI18n();
  const { teams, isHydrated } = useApp();

  // Same hydration gate as legacy: no flash of empty sections.
  if (!isHydrated) return null;

  const unassigned = teams.filter((team) => team.leagueId === null);
  const assigned = teams.filter((team) => team.leagueId !== null);

  const section = (list: Team[], testId: string, headingId: string, title: string) =>
    list.length === 0 ? null : (
      <section data-testid={testId} aria-labelledby={headingId}>
        <h2
          id={headingId}
          className="mb-3 border-b-[3px] border-red pb-1.5 text-lg font-bold text-navy"
        >
          {title}
        </h2>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {list.map((team) => (
            <li
              key={team.id}
              data-testid={`ui-v2-teams-card-${team.id}`}
              className="overflow-hidden border border-border bg-panel"
            >
              {/* Slice 2 replaces the name row with the full Stitch card. */}
              <Link
                href={`/teams/${team.id}`}
                className="block p-4 font-bold text-navy hover:bg-info-fill"
              >
                {team.name}
              </Link>
            </li>
          ))}
        </ul>
      </section>
    );

  return (
    <div data-testid="ui-v2-teams-grid" className="flex flex-col gap-8">
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
    </div>
  );
}
