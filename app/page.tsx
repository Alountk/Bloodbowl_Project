import { auth } from "@/auth";
import { isAuthEnabled } from "@/lib/auth-mode";
import { HomeDashboard } from "@/features/dashboard/HomeDashboard";
import { Landing } from "@/features/landing/Landing";

/**
 * Home route. In auth mode the page is the public Landing for anonymous
 * visitors (the proxy gate now allows "/") and the classic Dashboard for
 * logged-in users. In local/anonymous mode (no sessions) it is always the
 * dashboard backed by the LocalStorage store.
 */
export default async function HomePage() {
  const authEnabled = isAuthEnabled();

  if (authEnabled) {
    const session = await auth();
    if (!session?.user) {
      return <Landing />;
    }
    const user = session.user;
    return <HomeDashboard authenticated userName={user.name ?? user.email ?? null} />;
  }

  return <HomeDashboard authenticated={false} userName={null} />;
}
