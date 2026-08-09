import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Page from "./page";

const sessionMock = vi.hoisted(() =>
  vi.fn(() => ({ data: { user: { id: "u1" } }, status: "authenticated" })),
);
vi.mock("next-auth/react", () => ({
  useSession: () => sessionMock(),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("Leagues page route", () => {
  it("renders the leagues list via the LeagueList component", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })),
    );

    render(<Page />);

    await waitFor(() =>
      expect(screen.getByRole("heading", { level: 1, name: "Mis Ligas" })).toBeTruthy(),
    );
  });
});
