import { MatchesPage } from "@/features/matches/MatchesPage";

/**
 * The dedicated Matches route. A thin client page exactly like `/leagues` and
 * `/teams`: the auth gate, AppShell chrome (nav, user menu), and the session
 * user are supplied by the `SessionAppProvider` root layout, so this page just
 * renders the `MatchesPage` feature inside that shell.
 */
export default function MatchesPageRoute() {
  return <MatchesPage />;
}
