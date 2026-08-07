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

  async function goToStep2(name = "Reikland Reavers", raceId = "human") {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: name } });
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: raceId } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
  }

  // --- Step 1 ---

  it("starts on step 1 and renders the team name, race and Siguiente button", async () => {
    await renderForm();
    expect(screen.getByLabelText(/team name/i)).toBeTruthy();
    expect(screen.getByLabelText(/race/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeTruthy();
    // Step-2 content must not render yet.
    expect(screen.queryByRole("region", { name: "Plantilla" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Jugadores disponibles" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Coaching Staff" })).toBeNull();
  });

  it("renders all race options in the select dropdown", async () => {
    await renderForm();
    const select = screen.getByLabelText(/race/i) as HTMLSelectElement;
    const options = Array.from(select.options);
    expect(options[0].value).toBe("");
    expect(options[0].text).toBe("Select a race");
    const raceOptions = options.slice(1);
    expect(raceOptions).toHaveLength(RACES.length);
    RACES.forEach((race, index) => {
      expect(raceOptions[index].value).toBe(race.id);
      expect(raceOptions[index].text).toBe(race.name);
    });
  });

  it("clicking Siguiente without a name stays on step 1 and shows a validation error", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByText(/team name is required/i)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Plantilla" })).toBeNull();
  });

  it("clicking Siguiente without a race stays on step 1 and shows a validation error", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: "Team" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/select a race/i);
  });

  // --- Step 2 ---

  it("clicking Siguiente with a name and race moves to step 2 with a hero and subline", async () => {
    await goToStep2("Reikland Reavers", "human");
    expect(screen.getByRole("heading", { name: /reikland reavers/i })).toBeTruthy();
    expect(screen.getByText(/human.*paso 2/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /editar nombre\/raza/i })).toBeTruthy();
  });

  it("step 2 shows the Plantilla table, budget bar, Jugadores disponibles and Coaching Staff", async () => {
    await goToStep2();
    expect(screen.getByRole("region", { name: "Plantilla" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Jugadores disponibles" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Coaching Staff" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /create team/i })).toBeTruthy();
  });

  it("Jugadores disponibles shows Add buttons; adding a player populates Plantilla", async () => {
    await goToStep2();
    const availability = screen.getByRole("region", { name: "Jugadores disponibles" });
    expect(within(availability).getByRole("button", { name: "Add Lineman" })).toBeTruthy();
    // Empty Plantilla roster shows the empty-state message.
    expect(screen.getByText(/no players in roster yet/i)).toBeTruthy();

    fireEvent.click(within(availability).getByRole("button", { name: "Add Lineman" }));
    const plantilla = screen.getByRole("region", { name: "Plantilla" });
    expect(within(plantilla).getByRole("textbox")).toBeTruthy();
    expect(screen.getByLabelText("Player name for Player 1")).toBeTruthy();
    // Empty-state message is gone now that the roster has a player.
    expect(screen.queryByText(/no players in roster yet/i)).toBeNull();
  });

  it("Editar nombre/raza returns to step 1 and preserves the entered team name", async () => {
    await goToStep2("Reikland Reavers", "human");
    fireEvent.click(screen.getByRole("button", { name: /editar nombre\/raza/i }));
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeTruthy();
    const nameInput = screen.getByLabelText(/team name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Reikland Reavers");
    const raceSelect = screen.getByLabelText(/race/i) as HTMLSelectElement;
    expect(raceSelect.value).toBe("human");
  });

  it("step 2 hides rows in Jugadores disponibles once a positional reaches its max", async () => {
    await goToStep2();
    // Add 4 Blitzers (human max 4) through the availability table.
    const availability = screen.getByRole("region", { name: "Jugadores disponibles" });
    for (let i = 0; i < 4; i += 1) {
      fireEvent.click(within(availability).getByRole("button", { name: "Add Blitzer" }));
    }
    expect(screen.queryByRole("button", { name: "Add Blitzer" })).toBeNull();
    // Other positionals still available.
    expect(screen.getByRole("button", { name: "Add Lineman" })).toBeTruthy();
  });

  it("shows budget feedback with formatGold strings in step 2", async () => {
    await goToStep2();
    expect(screen.getByText(/0 players · 0k \/ 1,000k gc/i)).toBeTruthy();
    expect(screen.getByText(/1,000k remaining/i)).toBeTruthy();
  });

  // --- Race change dialog (in step 2 context after editing step 1) ---

  it("shows a confirm dialog when changing race with an active roster", async () => {
    await goToStep2("Reikland Reavers", "human");
    // Add a player from the availability table (step 2).
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    // Return to step 1 where the race select lives.
    fireEvent.click(screen.getByRole("button", { name: /editar nombre\/raza/i }));
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "orc" } });
    expect(screen.getByText(/roster will be cleared/i)).toBeTruthy();
  });

  it("clears roster on confirm race change", async () => {
    await goToStep2("Reikland Reavers", "human");
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: /editar nombre\/raza/i }));
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "orc" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    // Return to step 2 to see the empty roster.
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByText(/no players in roster yet/i)).toBeTruthy();
  });

  it("keeps roster on cancel race change", async () => {
    await goToStep2("Reikland Reavers", "human");
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: /editar nombre\/raza/i }));
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "orc" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    // Player remains in step 2 after clicking Siguiente again.
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByLabelText("Player name for Player 1")).toBeTruthy();
  });

  // --- Coaching staff ---

  it("hides Coaching Staff on step 1 and shows it on step 2", async () => {
    await renderForm();
    expect(screen.queryByRole("region", { name: "Coaching Staff" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: "Team" } });
    fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("region", { name: "Coaching Staff" })).toBeTruthy();
  });

  it("renders the Coaching Staff inputs and league select", async () => {
    await goToStep2();
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
    await goToStep2();
    const region = screen.getByRole("region", { name: "Coaching Staff" });
    expect(within(region).getAllByText("50k gc", { selector: "span" }).length).toBeGreaterThan(0);
    const rerollInput = screen.getByLabelText("Rerolls") as HTMLInputElement;
    fireEvent.change(rerollInput, { target: { value: "2" } });
    expect(screen.getByText(/900k remaining/i)).toBeTruthy();
  });

  it("includes the apothecary cost in the coaching subtotal", async () => {
    await goToStep2();
    const region = screen.getByRole("region", { name: "Coaching Staff" });
    const apothecary = screen.getByLabelText("Apothecary") as HTMLInputElement;
    expect(within(region).queryByText("50k gc · 50k", { selector: "span" })).toBeNull();
    fireEvent.click(apothecary);
    expect(within(region).getByText("50k gc · 50k", { selector: "span" })).toBeTruthy();
  });
});
