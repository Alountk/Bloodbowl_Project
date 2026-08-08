import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { SessionAppProvider } from "./SessionAppProvider";

const useSessionMock = vi.hoisted(() => vi.fn());
const signOutMock = vi.hoisted(() => vi.fn());

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

    fireEvent.click(screen.getByRole("button", { name: "Log out" }));
    expect(signOutMock).toHaveBeenCalledWith({ redirectTo: "/login" });
  });
});
