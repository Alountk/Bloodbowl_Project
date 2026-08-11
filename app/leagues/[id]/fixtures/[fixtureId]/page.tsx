import { use } from "react";
import { MatchView } from "@/features/leagues/MatchView";

interface MatchPageProps {
  params: Promise<{ id: string; fixtureId: string }>;
}

/**
 * Thin server page: resolves the route params and delegates to the client
 * `MatchView`, which fetches the match detail via `getMatchDetail` (D2).
 */
export default function MatchPage({ params }: MatchPageProps) {
  const { id, fixtureId } = use(params);
  return <MatchView leagueId={id} fixtureId={fixtureId} />;
}
