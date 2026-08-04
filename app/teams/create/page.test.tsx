import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { PLAYER_POSITION_LABELS } from "@/features/teams/constants";
import { TeamList } from "@/features/teams/TeamList";
import TeamCreatePage from "./page";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Team creation", () => {
  it("renders the create team form with player positions", () => {
    render(
      <AppProvider>
        <TeamCreatePage />
      </AppProvider>,
    );

    expect(screen.getByRole("heading", { name: "Create Team" })).toBeTruthy();
    expect(screen.getByLabelText("Team name")).toBeTruthy();
    expect(screen.getByLabelText("League")).toBeTruthy();
    expect(screen.getByLabelText(PLAYER_POSITION_LABELS.lineman)).toBeTruthy();
    expect(screen.getByLabelText(PLAYER_POSITION_LABELS.thrower)).toBeTruthy();
    expect(screen.getByLabelText(PLAYER_POSITION_LABELS.blitzer)).toBeTruthy();
    expect(screen.getByLabelText(PLAYER_POSITION_LABELS.catcher)).toBeTruthy();
  });

  it("shows validation errors when submitting an empty form", () => {
    render(
      <AppProvider>
        <TeamCreatePage />
      </AppProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Create Team" }));

    expect(screen.getByText("Team name is required")).toBeTruthy();
    expect(screen.getByText("League is required")).toBeTruthy();
  });

  it("adds the created team to the list", () => {
    render(
      <AppProvider>
        <TeamCreatePage />
        <TeamList />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText("Team name"), {
      target: { value: "Orc Crushers" },
    });
    fireEvent.change(screen.getByLabelText("League"), {
      target: { value: "Green League" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Team" }));

    expect(screen.getByText("Orc Crushers")).toBeTruthy();
    expect(screen.getByText("Green League")).toBeTruthy();
  });
});
