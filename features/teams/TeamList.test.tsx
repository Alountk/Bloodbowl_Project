import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { Topbar } from "@/components/Topbar";
import { TeamList } from "./TeamList";

describe("TeamList", () => {
  it("shows the initial teams", () => {
    render(
      <AppProvider>
        <TeamList />
      </AppProvider>,
    );

    expect(screen.getByRole("heading", { name: "Teams" })).toBeTruthy();
    expect(screen.getByText("London Arrows")).toBeTruthy();
    expect(screen.getByText("Birmingham Boro")).toBeTruthy();
    expect(screen.getAllByText("Premier League")).toHaveLength(2);
  });

  it("shows an empty state when there are no teams", () => {
    render(
      <AppProvider initialTeams={[]}>
        <TeamList />
      </AppProvider>,
    );

    expect(screen.getByText(/no teams yet/i)).toBeTruthy();
  });

  it("filters teams by the search query from the topbar", () => {
    render(
      <AppProvider>
        <Topbar />
        <TeamList />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText(/search teams/i), {
      target: { value: "london" },
    });

    expect(screen.getByText("London Arrows")).toBeTruthy();
    expect(screen.queryByText("Birmingham Boro")).toBeNull();
  });
});
