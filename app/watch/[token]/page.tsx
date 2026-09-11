import { use } from "react";
import { WatchMatchView } from "@/features/leagues/WatchMatchView";

interface WatchPageProps {
  params: Promise<{ token: string }>;
}

/**
 * Thin public server page for a shared match link (MSL-6): resolves the route
 * token and delegates to the client `WatchMatchView`, which fetches the reduced
 * `GET /api/watch/[token]` DTO and subscribes to the guest SSE stream. The
 * route is public (see `resolveAuthGate`) and exempt from the AppShell (AS-9).
 */
export default function WatchPage({ params }: WatchPageProps) {
  const { token } = use(params);
  return <WatchMatchView token={token} />;
}
