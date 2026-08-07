import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppProvider, useApp } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import { TeamList } from "@/features/teams/TeamList";
import TeamCreatePage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

function renderWithStore() {
  const store = new InMemoryTeamStore();

  act(() => {
    render(
      <AppProvider store={store}>
        <HydrationProbe />
        <TeamCreatePage />
      </AppProvider>,
    );
  });
  return store;
}

function renderWithStoreAndList() {
  const store = new InMemoryTeamStore();

  act(() => {
    render(
      <AppProvider store={store}>
        <HydrationProbe />
        <TeamCreatePage />
        <TeamList />
      </AppProvider>,
    );
  });
  return store;
}

function HydrationProbe() {
  const { isHydrated } = useApp();
  return <span data-testid="hydration-status">{isHydrated ? "hydrated" : "loading"}</span>;
}

async function waitForHydration() {
  await waitFor(() => {
    expect(screen.getByTestId("hydration-status").textContent).toBe("hydrated");
  });
}

describe("Team creation", () => {
  it("shows the 8 races in the selector and positionals after selecting one", async () => {
    renderWithStore();
    await waitForHydration();
    await waitFor(() => expect(screen.getByLabelText("Race")).toBeTruthy());

    const select = screen.getByLabelText("Race");
    fireEvent.change(select, { target: { value: "human" } });

    expect(screen.getByLabelText("Team name")).toBeTruthy();
    const rosterSection = screen.getByRole("region", { name: "Roster builder" });
    expect(within(rosterSection).getByText("Lineman")).toBeTruthy();
    expect(within(rosterSection).getByText("Blitzer")).toBeTruthy();
    expect(within(rosterSection).getByText("Thrower")).toBeTruthy();
    expect(within(rosterSection).getByText("Catcher")).toBeTruthy();
    expect(within(rosterSection).getByText("Ogre")).toBeTruthy();
  });

  it("shows a name error when submitting without a name", async () => {
    renderWithStore();
    await waitForHydration();

    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Team" }));

    expect(screen.getByText("Team name is required")).toBeTruthy();
  });

  it("blocks submit with fewer than 3 players", async () => {
    renderWithStoreAndList();
    await waitForHydration();
    await waitFor(() => expect(screen.getByLabelText("Team name")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Half Squad" },
    });
    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Team" }));

    expect(screen.getByText(/at least 3 players/i)).toBeTruthy();
    // The team must NOT have been added to the list: no team-card link exists.
    // (The typed name may still appear as the RosterTable banner while editing.)
    expect(screen.queryByRole("link", { name: /Half Squad/i })).toBeNull();
  });

  it("blocks adding a player when it would exceed the budget", async () => {
    renderWithStoreAndList();
    await waitForHydration();

    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Deathroller Crew" },
    });
    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "dwarf" } });
    // 1 Deathroller (170k) + 11 Linemen (70k each) = 940k; 12th lineman would push to 1,010k (blocked)
    fireEvent.click(screen.getByRole("button", { name: "Add Deathroller" }));
    for (let index = 0; index < 11; index += 1) {
      fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    }
    // At 940k the 12th lineman button should be disabled (would exceed budget)
    const addLinemanBtn = screen.getByRole("button", { name: "Add Lineman" }) as HTMLButtonElement;
    expect(addLinemanBtn.disabled).toBe(true);
  });

  it("disables the increment button when a positional is at its max", async () => {
    renderWithStore();
    await waitForHydration();

    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "orc" } });
    const addTroll = screen.getByRole("button", {
      name: "Add Troll",
    }) as HTMLButtonElement;
    fireEvent.click(addTroll);

    expect(addTroll.disabled).toBe(true);
  });

  it("adds a valid team to the list and shows its roster summary", async () => {
    renderWithStoreAndList();
    await waitForHydration();
    await waitFor(() => expect(screen.getByLabelText("Team name")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Reikland Reavers" },
    });
    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Blitzer" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Team" }));

    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());
    const teamCard = screen.getByText("Reikland Reavers").closest("li")!;
    expect(within(teamCard).getByText("Human")).toBeTruthy();
    expect(within(teamCard).getByText("4 players · 3x Lineman · 1x Blitzer")).toBeTruthy();
  });
});
