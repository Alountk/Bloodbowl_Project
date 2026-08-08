"use client";

import { use } from "react";
import { notFound } from "next/navigation";
import { useApp } from "@/app/providers/AppProvider";
import { getRaceById } from "@/features/teams/data/races";
import { TeamDetailView } from "@/features/teams/detail/TeamDetailView";
import { useLeagueName } from "@/features/leagues/useLeagueName";
import type { Race } from "@/features/teams/types";

interface TeamDetailPageProps {
  params: Promise<{ teamId: string }>;
}

export default function TeamDetailPage({ params }: TeamDetailPageProps) {
  const { teamId } = use(params);
  const { teams, isHydrated } = useApp();
  // Resolve the team unconditionally so the league-name hook can run at the top
  // level (Rules of Hooks); notFound() still waits for hydration below.
  const team = teams.find((t) => t.id === teamId);
  const leagueName = useLeagueName(team?.leagueId);

  if (!isHydrated) {
    return (
      <div
        data-testid="team-detail-skeleton"
        aria-label="Loading team"
        role="status"
      />
    );
  }

  if (!team) {
    notFound();
    // notFound() throws; this return is unreachable but satisfies TypeScript
    return null;
  }

  // Resolve the race from catalog, or construct a FALLBACK_RACE so TeamDetailView
  // always gets a valid Race shape. Fallback: name = raw raceId (spec requirement).
  const resolvedRace: Race = getRaceById(team.raceId) ?? {
    id: team.raceId,
    name: team.raceId,
    rerollCost: 0,
    positionals: [],
  };

  return <TeamDetailView team={team} race={resolvedRace} leagueName={leagueName} />;
}
