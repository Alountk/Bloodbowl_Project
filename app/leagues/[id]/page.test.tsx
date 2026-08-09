import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import LeagueDetailPage from "./page";

const sessionMock = vi.hoisted(() =>
  vi.fn(() => ({ data: { user: { id: "u1" } }, status: "authenticated" })),
);
vi.mock("next-auth/react", () => ({
  useSession: () => sessionMock(),
}));

const leagueDetail = {
  id: "l1",
  name: "North Reikland",
  description: null,
  ownerId: "u1",
  createdAt: "2026-01-01",
  status: "open",
  seasonLength: null,
  startedAt: null,
  ownerName: "Coach A",
  memberCount: 0,
  teams: [],
  fixtures: [],
};

afterEach(() => {
  vi.unstubAllGlobals();
});

function renderPage(id: string) {
  return render(
    <Suspense fallback={null}>
      <LeagueDetailPage params={Promise.resolve({ id })} />
    </Suspense>,
  );
}

describe("League detail page route", () => {
  it("renders the league detail for a known league", async () => {
    const fetchMock = vi.fn((input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/teams") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) });
      }
      if (url === "/api/leagues/l1") {
        return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(leagueDetail) });
      }
      return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
    });
    vi.stubGlobal("fetch", fetchMock);

    await act(async () => {
      renderPage("l1");
    });

    await waitFor(() =>
      expect(screen.getByRole("heading", { name: "North Reikland" })).toBeTruthy(),
    );
    expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1");
  });

  it("renders a not-found message for a foreign or missing league", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/leagues/foreign") {
          return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
        }
        return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
      }),
    );

    await act(async () => {
      renderPage("foreign");
    });

    await waitFor(() =>
      expect(screen.getByText("Liga no encontrada o sin acceso.")).toBeTruthy(),
    );
  });
});
