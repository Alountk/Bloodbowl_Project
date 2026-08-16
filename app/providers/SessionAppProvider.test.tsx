import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionAppProvider } from "./SessionAppProvider";
import { __resetMigrationGuardForTests } from "@/features/migration/useTeamMigration";

const useSessionMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/",
}));

vi.mock("next-auth/react", () => ({
  useSession: () => useSessionMock(),
  signOut: signOutMock,
}));

// The ApiTeamStore talks to fetch; we assert on the fetch calls to prove an
// authenticated session selects the API-backed store.
const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

function renderGate(status: "loading" | "authenticated" | "unauthenticated") {
  useSessionMock.mockReturnValue({ status });
  return render(<SessionAppProvider>content</SessionAppProvider>);
}

describe("SessionAppProvider", () => {
  it("renders a loading state while the session is loading", () => {
    renderGate("loading");
    expect(screen.getByRole("status")).toBeTruthy();
    expect(screen.queryByText("content")).toBeNull();
  });

  it("uses the API-backed store when authenticated (fetches teams from the API)", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([])));

    renderGate("authenticated");

    // The ApiTeamStore hydrates by LISTing /api/teams once mounted.
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith("/api/teams"));
  });

  it("falls back to local storage when unauthenticated (no API call)", () => {
    fetchMock.mockClear();
    renderGate("unauthenticated");
    expect(screen.getByText("content")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("signs the user out when auth is active", async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify([])));
    useSessionMock.mockReturnValue({ status: "authenticated" });

    render(<SessionAppProvider>content</SessionAppProvider>);
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());

    fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
    await waitFor(() => expect(signOutMock).toHaveBeenCalledWith({ redirect: false }));
    // Event-handler router.push (lint-approved) to /login, and only after the
    // sign-out POST completes (session cookie cleared).
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/login"));
  });
});

describe("SessionAppProvider — legacy localStorage migration", () => {
  beforeEach(() => {
    __resetMigrationGuardForTests();
    window.localStorage.clear();
    // Each fetch call gets a FRESH Response so `res.json()` is never called on
    // an already-consumed body (which would look like a spurious failure).
    fetchMock.mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify([]))),
    );
  });

  it("runs the localStorage bb_teams_v1 migration when the session is authenticated", async () => {
    const legacyTeam = {
      id: "t1",
      name: "Reavers",
      raceId: "human",
      roster: [],
      coaching: { rerolls: 0, dedicatedFans: 1, assistantCoaches: 0, cheerleaders: 0, apothecary: false },
      leagueId: null,
    };
    window.localStorage.setItem("bb_teams_v1", JSON.stringify([legacyTeam]));
    useSessionMock.mockReturnValue({ status: "authenticated" });
    fetchMock.mockClear();

    render(<SessionAppProvider>content</SessionAppProvider>);

    // The authenticated ApiTeamStore hydrates via GET /api/teams, and the
    // migration POSTs the single legacy team via the same endpoint.
    await waitFor(() => {
      const posts = fetchMock.mock.calls.filter(
        (c) => (c[1] as RequestInit | undefined)?.method === "POST",
      );
      expect(posts).toHaveLength(1);
    });
    const posts = fetchMock.mock.calls.filter(
      (c) => (c[1] as RequestInit | undefined)?.method === "POST",
    );
    expect(posts[0][0]).toBe("/api/teams");
    expect(JSON.parse((posts[0][1] as RequestInit).body as string).name).toBe("Reavers");
    // The migration flag is set after success.
    expect(window.localStorage.getItem("bb_teams_migrated_v1")).toBe("1");
  });

  it("does not run the migration when unauthenticated", () => {
    window.localStorage.setItem(
      "bb_teams_v1",
      JSON.stringify([{ id: "t1", name: "Reavers", raceId: "human", roster: [], coaching: {}, leagueId: null }]),
    );
    useSessionMock.mockReturnValue({ status: "unauthenticated" });
    fetchMock.mockClear();

    render(<SessionAppProvider>content</SessionAppProvider>);

    expect(window.localStorage.getItem("bb_teams_migrated_v1")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("re-hydrates the team list after the migration posts legacy teams", async () => {
    window.localStorage.setItem(
      "bb_teams_v1",
      JSON.stringify([
        { id: "t1", name: "Reavers", raceId: "human", roster: [], coaching: { rerolls: 0 }, leagueId: null },
      ]),
    );
    useSessionMock.mockReturnValue({ status: "authenticated" });
    fetchMock.mockClear();

    const gets = () =>
      fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method !== "POST");
    const posts = () =>
      fetchMock.mock.calls.filter((c) => (c[1] as RequestInit | undefined)?.method === "POST");

    render(<SessionAppProvider>content</SessionAppProvider>);

    // The migration POSTs the legacy team, then the list must be re-fetched so
    // the migrated team appears without a manual reload.
    await waitFor(() => expect(posts()).toHaveLength(1));
    await waitFor(() => expect(window.localStorage.getItem("bb_teams_migrated_v1")).toBe("1"));
    // After migration, at least 2 GETs happen: the initial hydration + the re-hydration.
    await waitFor(() => expect(gets().length).toBeGreaterThanOrEqual(2));
  });
});
