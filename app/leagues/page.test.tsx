import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import Page from "./page";

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
      expect(screen.getByRole("heading", { name: "Mis Ligas" })).toBeTruthy(),
    );
  });
});
