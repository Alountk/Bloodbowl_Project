import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { StartLeagueModal } from "./StartLeagueModal";

const onClose = vi.fn();
const onStarted = vi.fn(async () => {});

afterEach(() => {
  vi.unstubAllGlobals();
  onClose.mockClear();
  onStarted.mockClear();
});

function renderOpen(teamCount: number) {
  return render(
    <StartLeagueModal
      open
      leagueId="l1"
      teamCount={teamCount}
      onClose={onClose}
      onStarted={onStarted}
    />,
  );
}

describe("StartLeagueModal", () => {
  it("prompts for the number of jornadas and hints the maximum (teams - 1)", () => {
    renderOpen(6);

    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText("¿Cuántas jornadas?")).toBeTruthy();
    // Max for 6 teams is 5: each round is "todos contra todos".
    expect(screen.getByText(/Máximo 5 jornadas/)).toBeTruthy();
  });

  it("window-validates the input to 1..teams-1 and blocks out-of-range", () => {
    renderOpen(4);
    const input = screen.getByLabelText(/jornadas/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar liga" }));
    // Invalid: stays open, no start call.
    expect(onStarted).not.toHaveBeenCalled();

    fireEvent.change(input, { target: { value: "4" } });
    fireEvent.click(screen.getByRole("button", { name: "Iniciar liga" }));
    expect(onStarted).not.toHaveBeenCalled();
  });

  it("POSTs startLeague with the chosen seasonLength and refreshes on success", async () => {
    renderOpen(4);
    const input = screen.getByLabelText(/jornadas/i) as HTMLInputElement;

    fireEvent.change(input, { target: { value: "3" } });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () =>
        Promise.resolve({
          id: "l1",
          status: "started",
          seasonLength: 3,
          fixtures: [],
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    fireEvent.click(screen.getByRole("button", { name: "Iniciar liga" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await waitFor(() => expect(onStarted).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/leagues/l1/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ seasonLength: 3 }),
    });
  });

  it("returns null when closed", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { container } = render(
      <StartLeagueModal
        open={false}
        leagueId="l1"
        teamCount={2}
        onClose={onClose}
        onStarted={onStarted}
      />,
    );
    expect(container.firstChild).toBeNull();
  });
});
