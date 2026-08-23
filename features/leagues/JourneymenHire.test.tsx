import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { JourneymenHireStep } from "./JourneymenHire";

/**
 * RAU-14/RAU-52 post-resolve journeyman (Novato) hire step tests: the LAST
 * step of the end-of-match resolution sequence (shown AFTER the MVP roll + the
 * final confirm, so the hire cost is paid from the treasury AFTER the match
 * winnings were collected). The viewer's OWN side's remaining Novatos are
 * listed with CHECKBOXES ("Contratar a {name} por {cost} M.O."); "Contratar
 * marcados" POSTs `hireJourneyman { hire: true }` for each checked novato
 * (the server decrements the treasury by the cost), and "Dejar ir" POSTs
 * `hire: false` (the option is removed). Every decision refreshes via
 * `onUpdated`; the step renders nothing when no journeymen remain.
 */

const JOURNEYMEN = [
  { id: "journeyman-th-1", name: "Aldric Martillo" },
  { id: "journeyman-th-2", name: "Brunhild Hacha" },
];

function renderStep(props: Partial<Parameters<typeof JourneymenHireStep>[0]> = {}) {
  const onUpdated = vi.fn().mockResolvedValue(undefined);
  render(
    <JourneymenHireStep
      leagueId="l1"
      fixtureId="f1"
      side="home"
      team={{ name: "Reavers", raceId: "human" }}
      journeymen={JOURNEYMEN}
      onUpdated={onUpdated}
      {...props}
    />,
  );
  return { onUpdated };
}

afterEach(() => vi.unstubAllGlobals());

describe("JourneymenHireStep", () => {
  it("renders the remaining novatos as CHECKBOXES with the race Lineman cost (Human = 50.000 M.O.)", () => {
    renderStep();
    const section = screen.getByTestId("journeymen-hire");
    expect(
      within(section).getByRole("checkbox", { name: "Contratar a Aldric Martillo por 50.000 M.O." }),
    ).toBeTruthy();
    expect(
      within(section).getByRole("checkbox", { name: "Contratar a Brunhild Hacha por 50.000 M.O." }),
    ).toBeTruthy();
    // Each row keeps the "Dejar ir" release action.
    expect(within(section).getAllByRole("button", { name: "Dejar ir" })).toHaveLength(2);
    // The bulk action is disabled until at least one novato is marked.
    expect(within(section).getByRole("button", { name: "Contratar marcados" })).toHaveProperty("disabled", true);
  });

  it("renders nothing when the side has no remaining journeymen", () => {
    renderStep({ journeymen: [] });
    expect(screen.queryByTestId("journeymen-hire")).toBeNull();
  });

  it("'Contratar marcados' POSTs hireJourneyman { hire: true } for EACH checked novato and refreshes (onUpdated)", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            journeymen: { home: [], away: [] },
            team: { id: "th", roster: [], treasury: 400000 },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onUpdated } = renderStep();
    const section = screen.getByTestId("journeymen-hire");
    fireEvent.click(within(section).getByRole("checkbox", { name: /Aldric Martillo/ }));
    fireEvent.click(within(section).getByRole("checkbox", { name: /Brunhild Hacha/ }));
    fireEvent.click(within(section).getByRole("button", { name: "Contratar marcados" }));

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    const hireCalls = fetchMock.mock.calls.filter(([, init]) =>
      String((init as RequestInit).body).includes("hireJourneyman"),
    );
    expect(hireCalls).toHaveLength(2);
    const bodies = hireCalls.map(([, init]) => JSON.parse(String((init as RequestInit).body)));
    expect(bodies).toEqual([
      { type: "hireJourneyman", side: "home", journeymanId: "journeyman-th-1", hire: true },
      { type: "hireJourneyman", side: "home", journeymanId: "journeyman-th-2", hire: true },
    ]);
  });

  it("'Dejar ir' POSTs hireJourneyman { hire: false } for the row and refreshes (the option is removed)", async () => {
    const fetchMock = vi.fn((_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            journeymen: { home: [], away: [] },
            team: { id: "th", roster: [], treasury: 0 },
          }),
      });
    });
    vi.stubGlobal("fetch", fetchMock);

    const { onUpdated } = renderStep();
    const section = screen.getByTestId("journeymen-hire");
    fireEvent.click(within(section).getAllByRole("button", { name: "Dejar ir" })[0]);

    await waitFor(() => expect(onUpdated).toHaveBeenCalledTimes(1));
    const call = fetchMock.mock.calls.find(([, init]) =>
      String((init as RequestInit).body).includes("hireJourneyman"),
    );
    expect(call).toBeTruthy();
    const body = JSON.parse((call![1] as RequestInit).body as string);
    expect(body).toEqual({
      type: "hireJourneyman",
      side: "home",
      journeymanId: "journeyman-th-1",
      hire: false,
    });
  });

  it("surfaces a rejection (e.g. 409 insufficient treasury) in the step and does NOT refresh", async () => {
    vi.stubGlobal("fetch", (_url: string, _init?: RequestInit) => {
      void _url;
      void _init;
      return Promise.resolve({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "Cannot hire in current state" }),
      });
    });

    const { onUpdated } = renderStep();
    const section = screen.getByTestId("journeymen-hire");
    fireEvent.click(within(section).getByRole("checkbox", { name: /Aldric Martillo/ }));
    fireEvent.click(within(section).getByRole("button", { name: "Contratar marcados" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toContain("Cannot hire in current state"),
    );
    expect(onUpdated).not.toHaveBeenCalled();
  });
});
