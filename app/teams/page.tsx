import { TeamsPage } from "@/features/teams/TeamsPage";

/**
 * The dedicated Teams route. A thin client page exactly like `/leagues`: the
 * auth gate, AppShell chrome (nav, user menu), and the user-scoped team store
 * are supplied by the `SessionAppProvider` root layout, so this page just
 * renders the `TeamsPage` feature inside that shell.
 */
export default function TeamsPageRoute() {
  return <TeamsPage />;
}
