import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppProvider, useApp } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import { RACES } from "@/features/teams/data/races";
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

  it("renders all race options in the select dropdown", async () => {
    await renderForm();
    const select = screen.getByLabelText(/race/i) as HTMLSelectElement;
    const options = Array.from(select.options);
    // First option is the placeholder
    expect(options[0].value).toBe("");
    expect(options[0].text).toBe("Select a race");
    // Remaining options should match RACES data
    const raceOptions = options.slice(1);
    expect(raceOptions).toHaveLength(RACES.length);
    RACES.forEach((race, index) => {
      expect(raceOptions[index].value).toBe(race.id);
      expect(raceOptions[index].text).toBe(race.name);
    });
  });

  it("selects a race by its id and shows the placeholder when deselected", async () => {
    await renderForm();
    const select = screen.getByLabelText(/race/i) as HTMLSelectElement;
    fireEvent.change(select, { target: { value: "orc" } });
    expect(select.value).toBe("orc");
    // Deselect back to placeholder
    fireEvent.change(select, { target: { value: "" } });
    expect(select.value).toBe("");
    // Roster should be gone
    expect(screen.queryByRole("region", { name: "Roster builder" })).toBeNull();
  });

  it("shows the placeholder 'Select a race' before any race is selected", async () => {
    await renderForm();
    const select = screen.getByLabelText(/race/i) as HTMLSelectElement;
    expect(select.value).toBe("");
    // The placeholder option should be visible
    const placeholderOption = select.querySelector('option[value=""]');
    expect(placeholderOption).toBeTruthy();
    expect(placeholderOption?.textContent).toBe("Select a race");
  });

  it("renders the roster builder for every race in RACES", async () => {
    await renderForm();
    for (const race of RACES) {
      fireEvent.change(screen.getByLabelText(/race/i), { target: { value: race.id } });
      expect(screen.getByRole("region", { name: "Roster builder" })).toBeTruthy();
      // Should show at least one positional add button
      const addButtons = screen.getAllByRole("button", { name: /add/i });
      expect(addButtons.length).toBeGreaterThan(0);
    }
  });

  it("shows Spanish stat headers MV FU AG PS AR after selecting a race", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    // Add a player so RosterTable renders with headers
    const addButtons = screen.getAllByRole("button", { name: /add lineman/i });
    fireEvent.click(addButtons[0]);
    const headers = screen.getAllByRole("columnheader").map((h) => h.textContent);
    expect(headers).toContain("MV");
    expect(headers).toContain("FU");
    expect(headers).toContain("AG");
    expect(headers).toContain("PS");
    expect(headers).toContain("AR");
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

  it("hides the Coaching Staff section until a race is selected", async () => {
    await renderForm();
    expect(screen.queryByRole("region", { name: "Coaching Staff" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    expect(screen.getByRole("region", { name: "Coaching Staff" })).toBeTruthy();
  });

  it("renders the Coaching Staff inputs and league select after a race is selected", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
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

  it("shows unit costs next to each coaching field and consumes the budget", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    const region = screen.getByRole("region", { name: "Coaching Staff" });
    // Human rerolls cost 50k and the apothecary costs 50k: both unit costs visible.
    expect(within(region).getAllByText("50k gc", { selector: "span" }).length).toBeGreaterThan(0);
    // Budget starts at 1,000k with no players.
    expect(screen.getByText(/remaining/i)).toBeTruthy();
    const rerollInput = screen.getByLabelText("Rerolls") as HTMLInputElement;
    fireEvent.change(rerollInput, { target: { value: "2" } });
    // 2 rerolls x 50k = 100k; 1000k - 100k = 900k remaining.
    expect(screen.getByText(/900k remaining/i)).toBeTruthy();
  });

  it("binds the reroll input value to coaching state", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    const rerollInput = screen.getByLabelText("Rerolls") as HTMLInputElement;
    fireEvent.change(rerollInput, { target: { value: "4" } });
    expect(rerollInput.value).toBe("4");
  });

  it("binds the league select value to leagueType state", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    const leagueSelect = screen.getByLabelText("League type") as HTMLSelectElement;
    fireEvent.change(leagueSelect, { target: { value: "exhibition" } });
    expect(leagueSelect.value).toBe("exhibition");
  });

  it("includes the apothecary cost in the coaching subtotal", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    const region = screen.getByRole("region", { name: "Coaching Staff" });
    const apothecary = screen.getByLabelText("Apothecary") as HTMLInputElement;
    // Apothecary shows its 50k unit cost once selected.
    expect(within(region).queryByText("50k gc · 50k", { selector: "span" })).toBeNull();
    fireEvent.click(apothecary);
    expect(within(region).getByText("50k gc · 50k", { selector: "span" })).toBeTruthy();
  });
});
