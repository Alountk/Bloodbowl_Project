import { use } from "react";
import { LeagueDetail } from "@/features/leagues/LeagueDetail";

interface LeagueDetailPageProps {
  params: Promise<{ id: string }>;
}

export default function LeagueDetailPage({ params }: LeagueDetailPageProps) {
  const { id } = use(params);
  return <LeagueDetail leagueId={id} />;
}
