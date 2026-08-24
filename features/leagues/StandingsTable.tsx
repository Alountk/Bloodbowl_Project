"use client";

import { useMemo } from "react";
import { computeStandings, type StandingsFixture } from "@/lib/standings";
import { useI18n } from "@/lib/i18n";
import { getRaceById } from "@/features/teams/data/races";
import type { FixtureDraft, LeagueMemberTeam } from "./api";

export interface StandingsTableProps {
  teams: LeagueMemberTeam[];
  /** The league's round-robin fixtures (played ones carry both scores). */
  fixtures: FixtureDraft[];
  /** RAU-40: the stored champion's team id on a finished league — its row gets
   * the gold highlight. Absent while open/started (the leader row stays navy). */
  championTeamId?: string | null;
}

/** The fixture subset the standings need; normalizes the optional API fields
 * (a missing score is the same as null for the standings computation). */
function toStandingsFixtures(fixtures: readonly FixtureDraft[]): StandingsFixture[] {
  return fixtures.map((f) => ({
    homeTeamId: f.homeTeamId,
    awayTeamId: f.awayTeamId,
    homeScore: f.homeScore ?? null,
    awayScore: f.awayScore ?? null,
    winnerId: f.winnerId ?? null,
  }));
}

/**
 * League standings table (RAU-40 UI): the 3/1/0 scoring + approved tiebreaker
 * chain computed by the SAME pure `computeStandings` the season-close logic
 * uses — so the row #1 here is exactly the champion `maybeCloseLeague`
 * declared. Rulebook-light: navy heading, dense slate rows, gold row for the
 * stored champion, horizontal scroll on mobile. The table never renders
 * fixture controls — it is the read-only summary of the jornadas below it.
 */
export function StandingsTable({ teams, fixtures, championTeamId }: StandingsTableProps) {
  const { t } = useI18n();

  const rows = useMemo(() => computeStandings(toStandingsFixtures(fixtures)), [fixtures]);
  const nameById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams],
  );
  const raceById = useMemo(
    () =>
      new Map(
        teams.map((team) => [
          team.id,
          team.raceId ? getRaceById(team.raceId)?.name ?? team.raceId : "",
        ]),
      ),
    [teams],
  );

  if (rows.length === 0) {
    return (
      <section
        aria-labelledby="standings-heading"
        className="rounded-md border border-[#e2e8f0] bg-white p-6 text-center"
      >
        <h2
          id="standings-heading"
          className="text-sm font-black uppercase tracking-wide text-[#12225a]"
        >
          {t("leagues.standings.heading")}
        </h2>
        <p className="mt-1 text-sm text-slate-600">{t("leagues.standings.empty")}</p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby="standings-heading"
      data-testid="standings-table"
      className="rounded-md border border-[#e2e8f0] bg-white"
    >
      <h2
        id="standings-heading"
        className="border-b border-[#e2e8f0] px-4 py-3 text-sm font-black uppercase tracking-wide text-[#12225a]"
      >
        {t("leagues.standings.heading")}
      </h2>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[560px] text-left text-[13px]">
          <caption className="sr-only">{t("leagues.standings.heading")}</caption>
          <thead>
            <tr className="border-b border-[#e2e8f0] bg-slate-100 text-[11px] uppercase tracking-wide text-slate-500">
              <th scope="col" className="px-3 py-2 font-bold">{t("leagues.standings.pos")}</th>
              <th scope="col" className="px-3 py-2 font-bold">{t("leagues.standings.team")}</th>
              <th scope="col" className="px-3 py-2 text-center font-bold">{t("leagues.standings.played")}</th>
              <th scope="col" className="px-3 py-2 text-center font-bold">{t("leagues.standings.won")}</th>
              <th scope="col" className="px-3 py-2 text-center font-bold">{t("leagues.standings.drawn")}</th>
              <th scope="col" className="px-3 py-2 text-center font-bold">{t("leagues.standings.lost")}</th>
              <th scope="col" className="px-3 py-2 text-center font-bold">{t("leagues.standings.points")}</th>
              <th scope="col" className="px-3 py-2 text-center font-bold">{t("leagues.standings.tdFor")}</th>
              <th scope="col" className="px-3 py-2 text-center font-bold">{t("leagues.standings.tdAgainst")}</th>
              <th scope="col" className="px-3 py-2 text-center font-bold">{t("leagues.standings.tdDiff")}</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const champion = championTeamId === row.teamId;
              return (
                <tr
                  key={row.teamId}
                  data-testid={champion ? "standings-champion-row" : undefined}
                  className={`border-b border-[#f1f5f9] last:border-b-0 ${
                    champion
                      ? "bg-[#fef9c3]"
                      : index === 0
                        ? "bg-white"
                        : index % 2 === 1
                          ? "bg-[#f8fafc]"
                          : "bg-white"
                  }`}
                >
                  <td className="px-3 py-2 font-black text-[#12225a]">{index + 1}</td>
                  <td className="px-3 py-2">
                    <p className={`font-semibold ${champion ? "text-[#12225a]" : "text-slate-800"}`}>
                      {nameById.get(row.teamId) ?? row.teamId}
                    </p>
                    {raceById.get(row.teamId) ? (
                      <p className="text-[10px] text-slate-500">{raceById.get(row.teamId)}</p>
                    ) : null}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{row.played}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{row.wins}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{row.draws}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{row.losses}</td>
                  <td className="px-3 py-2 text-center text-[15px] font-black tabular-nums text-[#12225a]">
                    {row.points}
                  </td>
                  <td className="px-3 py-2 text-center tabular-nums">{row.tdFor}</td>
                  <td className="px-3 py-2 text-center tabular-nums">{row.tdAgainst}</td>
                  <td className="px-3 py-2 text-center tabular-nums">
                    {row.tdDiff > 0 ? `+${row.tdDiff}` : row.tdDiff}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}
