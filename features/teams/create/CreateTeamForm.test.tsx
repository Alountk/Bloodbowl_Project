import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProvider, useApp } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import { CreateTeamForm } from "./CreateTeamForm";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("CreateTeamForm", () => {
  function HydrationProbe() {
    const { isHydrated } = useApp();
    return <span data-testid="hydration-status">{isHydrated ? "hydrated" : "loading"}</span>;
  }

  async function renderForm() {
    await act(async () => {
      render(
        <AppProvider store={new InMemoryTeamStore()}>
          <HydrationProbe />
          <CreateTeamForm />
        </AppProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("hydration-status").textContent).toBe("hydrated");
    });
  }

  it("renders the team name and race inputs", async () => {
    await renderForm();
    expect(screen.getByLabelText(/team name/i)).toBeTruthy();
    expect(screen.getByLabelText(/race/i)).toBeTruthy();
  });

  it("shows stat headers MA ST AG PA AV after selecting a race", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    // Add a player so RosterTable renders with headers
    const addButtons = screen.getAllByRole("button", { name: /add lineman/i });
    fireEvent.click(addButtons[0]);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("MA");
    expect(headers).toContain("ST");
    expect(headers).toContain("AG");
    expect(headers).toContain("PA");
    expect(headers).toContain("AV");
    // No duplicate "A" column
    expect(headers.filter((h) => h === "A")).toHaveLength(0);
  });

  it("shows role-grouped positional add buttons after selecting a race", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    // Should show add buttons for at least some positionals
    const addButtons = screen.getAllByRole("button", { name: /add/i });
    expect(addButtons.length).toBeGreaterThan(0);
  });

  it("adds a player to the roster when add button is clicked", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    const addButtons = screen.getAllByRole("button", { name: /add lineman/i });
    fireEvent.click(addButtons[0]);
    // RosterTable should now show a player
    expect(screen.getAllByRole("textbox").length).toBeGreaterThan(0);
  });

  it("shows a confirm dialog when changing race with active roster", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    // Add a player
    const addButtons = screen.getAllByRole("button", { name: /add lineman/i });
    fireEvent.click(addButtons[0]);
    // Change race
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "orc" } });
    // Confirm dialog should appear
    expect(screen.getByText(/roster will be cleared/i)).toBeTruthy();
  });

  it("clears roster on confirm race change", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    const addButtons = screen.getAllByRole("button", { name: /add lineman/i });
    fireEvent.click(addButtons[0]);
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "orc" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    // RosterTable should show empty state message (no player inputs)
    expect(screen.getByText(/no players/i)).toBeTruthy();
  });

  it("keeps roster on cancel race change", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    const addButtons = screen.getAllByRole("button", { name: /add lineman/i });
    fireEvent.click(addButtons[0]);
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "orc" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    // Player name input should still be present (1 player)
    const playerInputs = screen.getAllByRole("textbox").filter(
      (el) => (el as HTMLInputElement).value.startsWith("Player"),
    );
    expect(playerInputs).toHaveLength(1);
  });

  it("shows budget feedback", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    // Budget display should be visible (e.g. remaining gc)
    expect(screen.getByText(/remaining/i)).toBeTruthy();
  });

  it("renders role-group headings for the selected race (R1: positionals grouped by role)", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    // Human roster has Lineman, Thrower, Blitzer, Catcher, Big Guy roles.
    // The form renders each role as an <h3> heading with text "{role}s".
    expect(screen.getByRole("heading", { name: /linemans/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /throwers/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /blitzers/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /catchers/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /big guys/i })).toBeTruthy();
  });

  // --- coaching staff ---

  it("renders the Coaching Staff inputs and league select", async () => {
    await renderForm();
    expect(screen.getByRole("region", { name: "Coaching Staff" })).toBeTruthy();
    expect(screen.getByLabelText("Rerolls")).toBeTruthy();
    expect(screen.getByLabelText("Dedicated Fans")).toBeTruthy();
    expect(screen.getByLabelText("Assistant Coaches")).toBeTruthy();
    expect(screen.getByLabelText("Cheerleaders")).toBeTruthy();
    expect(screen.getByLabelText("Apothecary")).toBeTruthy();
    const leagueSelect = screen.getByLabelText("League type");
    expect(leagueSelect.tagName).toBe("SELECT");
    const options = screen.getAllByRole("option") as HTMLOptionElement[];
    const leagueValues = options.map((option) => option.value);
    expect(leagueValues).toEqual(expect.arrayContaining(["exhibition", "open"]));
  });

  it("binds the reroll input value to coaching state", async () => {
    await renderForm();
    const rerollInput = screen.getByLabelText("Rerolls") as HTMLInputElement;
    fireEvent.change(rerollInput, { target: { value: "4" } });
    expect(rerollInput.value).toBe("4");
  });

  it("binds the league select value to leagueType state", async () => {
    await renderForm();
    const leagueSelect = screen.getByLabelText("League type") as HTMLSelectElement;
    fireEvent.change(leagueSelect, { target: { value: "exhibition" } });
    expect(leagueSelect.value).toBe("exhibition");
  });
});
