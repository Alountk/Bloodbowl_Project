import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { LeagueList } from "./LeagueList";

/**
 * LeagueList loads its own data through the leagues API wrapper (`fetch`).
 * The API is user-scoped and returns 401 unauthenticated, so tests mock `fetch`
 * to simulate the mocked-fetch/session pattern used by the other route tests.
 */

const leaguesResponse = [
  { id: "l1", name: "North Reikland", description: "Open league", ownerId: "u1", createdAt: "2026-01-01" },
  { id: "l2", name: "Middenheim Cup", description: null, ownerId: "u1", createdAt: "2026-02-01" },
];

afterEach(() => {
  vi.unstubAllGlobals();
});

/** fetch mock serving list + per-league details so the cards can show member counts. */
function stubFetch() {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/leagues") {
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(leaguesResponse) });
    }
    if (url === "/api/leagues/l1") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...leaguesResponse[0], teams: [{ id: "t1" }] }),
      });
    }
    if (url === "/api/leagues/l2") {
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ ...leaguesResponse[1], teams: [] }),
      });
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

describe("LeagueList", () => {
  it("renders the hero and the + Nueva liga button", async () => {
    stubFetch();
    render(<LeagueList />);

    expect(screen.getByRole("heading", { name: "Mis Ligas" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "+ Nueva liga" })).toBeTruthy();
  });

  it("renders a Pattern-2 card grid with name, description, member count and Ver link", async () => {
    stubFetch();
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("North Reikland")).toBeTruthy());

    const card = screen.getByText("North Reikland").closest("li") as HTMLElement;
    expect(within(card).getByText("Open league")).toBeTruthy();
    expect(within(card).getByText("1 equipo")).toBeTruthy();
    expect(within(card).getByRole("link", { name: "Ver" }).getAttribute("href")).toBe("/leagues/l1");

    // League without a description still renders its member count and Ver link.
    const card2 = screen.getByText("Middenheim Cup").closest("li") as HTMLElement;
    expect(within(card2).getByText("Sin descripción")).toBeTruthy();
    expect(within(card2).getByText("0 equipos")).toBeTruthy();
    expect(within(card2).getByRole("link", { name: "Ver" }).getAttribute("href")).toBe("/leagues/l2");
  });

  it("shows the empty state with a create CTA when there are no leagues", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })),
    );
    render(<LeagueList />);

    await waitFor(() => expect(screen.getByText("No hay ligas todavía. Crea la primera.")).toBeTruthy());
    // Hero create button + the empty-state CTA both offer "+ Nueva liga".
    expect(screen.getAllByRole("button", { name: "+ Nueva liga" })).toHaveLength(2);
  });

  it("opens the create modal from the + Nueva liga button", async () => {
    stubFetch();
    render(<LeagueList />);

    fireEvent.click(screen.getByRole("button", { name: "+ Nueva liga" }));

    // Rulebook modal with name + description fields (role dialog).
    await waitFor(() => expect(screen.getByRole("dialog", { name: /Nueva liga/ })).toBeTruthy());
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toBeTruthy();
  });
});
