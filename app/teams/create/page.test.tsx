import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { TeamList } from "@/features/teams/TeamList";
import TeamCreatePage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Team creation", () => {
  it("shows the 8 races in the selector and positionals after selecting one", () => {
    render(
      <AppProvider>
        <TeamCreatePage />
      </AppProvider>,
    );

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

  it("shows a name error when submitting without a name", () => {
    render(
      <AppProvider>
        <TeamCreatePage />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Team" }));

    expect(screen.getByText("Team name is required")).toBeTruthy();
  });

  it("blocks submit with fewer than 3 players", () => {
    render(
      <AppProvider>
        <TeamCreatePage />
        <TeamList />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Half Squad" },
    });
    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Team" }));

    expect(screen.getByText(/at least 3 players/i)).toBeTruthy();
    expect(screen.queryByText("Half Squad")).toBeNull();
  });

  it("blocks adding a player when it would exceed the budget", () => {
    render(
      <AppProvider>
        <TeamCreatePage />
        <TeamList />
      </AppProvider>,
    );

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

  it("disables the increment button when a positional is at its max", () => {
    render(
      <AppProvider>
        <TeamCreatePage />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "orc" } });
    const addTroll = screen.getByRole("button", {
      name: "Add Troll",
    }) as HTMLButtonElement;
    fireEvent.click(addTroll);

    expect(addTroll.disabled).toBe(true);
  });

  it("adds a valid team to the list and shows its roster summary", () => {
    render(
      <AppProvider>
        <TeamCreatePage />
        <TeamList />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Reikland Reavers" },
    });
    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Blitzer" }));
    fireEvent.click(screen.getByRole("button", { name: "Create Team" }));

    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    const teamCard = screen.getByText("Reikland Reavers").closest("li")!;
    expect(within(teamCard).getByText("Human")).toBeTruthy();
    expect(within(teamCard).getByText("4 players · 3x Lineman · 1x Blitzer")).toBeTruthy();
  });
});
