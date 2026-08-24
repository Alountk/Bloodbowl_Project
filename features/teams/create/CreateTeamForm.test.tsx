import { describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { AppProvider, useApp } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import type { RulesetDto } from "@/lib/rulesets";
import { RACES } from "@/features/teams/data/races";
import { PLAYER_NAME_BANKS, PLAYER_SURNAME_BANKS } from "@/features/teams/data/playerNames";
import { TEAM_NAME_BANKS } from "@/features/teams/data/teamNames";
import { CreateTeamForm } from "./CreateTeamForm";

// Mock next/navigation
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

/** Asserts a wizard auto-name is composed as "{first} {surname}" from the human banks. */
function expectComposedHumanName(name: string) {
  const [first, ...rest] = name.split(" ");
  expect(PLAYER_NAME_BANKS.human).toContain(first);
  expect(PLAYER_SURNAME_BANKS.human).toContain(rest.join(" "));
}

  function HydrationProbe() {
    const { isHydrated } = useApp();
    return <span data-testid="hydration-status">{isHydrated ? "hydrated" : "loading"}</span>;
  }

describe("CreateTeamForm", () => {
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
    fireEvent.change(screen.getByLabelText(/nombre del equipo/i), { target: { value: name } });
    fireEvent.change(screen.getByLabelText(/raza/i), { target: { value: raceId } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
  }

  // --- Step 1 ---

  it("starts on step 1 and renders the team name, race and Siguiente button", async () => {
    await renderForm();
    expect(screen.getByLabelText(/nombre del equipo/i)).toBeTruthy();
    expect(screen.getByLabelText(/raza/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeTruthy();
    // Step-2 content must not render yet.
    expect(screen.queryByRole("region", { name: "Plantilla" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Jugadores disponibles" })).toBeNull();
    expect(screen.queryByRole("region", { name: "Cuerpo técnico" })).toBeNull();
  });

  it("renders all race options in the select dropdown", async () => {
    await renderForm();
    const select = screen.getByLabelText(/raza/i) as HTMLSelectElement;
    const options = Array.from(select.options);
    expect(options[0].value).toBe("");
    expect(options[0].text).toBe("Selecciona una raza");
    const raceOptions = options.slice(1);
    expect(raceOptions).toHaveLength(RACES.length);
    RACES.forEach((race, index) => {
      expect(raceOptions[index].value).toBe(race.id);
      expect(raceOptions[index].text).toBe(race.name);
    });
  });

  it("wraps the Race select in a relative div with a pointer-events-none chevron and 16px font", async () => {
    await renderForm();
    const raceSelect = screen.getByLabelText(/raza/i) as HTMLSelectElement;
    const wrapper = raceSelect.parentElement as HTMLElement;
    expect(wrapper.className).toContain("relative");
    const chevron = wrapper.querySelector("span[aria-hidden]");
    expect(chevron).not.toBeNull();
    expect(chevron?.className).toContain("pointer-events-none");
    // text-[16px] prevents iOS auto-zoom; jsdom cannot compute Tailwind so the
    // class name is the only stable assertion for that CSS contract.
    expect(raceSelect.className).toContain("text-[16px]");
    // Still calls changeRace: pick Orc then advance to step 2 -> hero shows Orc.
    fireEvent.change(screen.getByLabelText(/nombre del equipo/i), { target: { value: "Reikland Reavers" } });
    fireEvent.change(raceSelect, { target: { value: "orc" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("heading", { name: /reikland reavers/i })).toBeTruthy();
    expect(screen.getByText(/orc.*paso 2/i)).toBeTruthy();
  });

  it("clicking Siguiente without a name stays on step 1 and shows a validation error", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/raza/i), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByText(/el nombre del equipo es obligatorio/i)).toBeTruthy();
    expect(screen.queryByRole("region", { name: "Plantilla" })).toBeNull();
  });

  it("clicking Siguiente without a race stays on step 1 and shows a validation error", async () => {
    await renderForm();
    fireEvent.change(screen.getByLabelText(/nombre del equipo/i), { target: { value: "Team" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("alert").textContent).toMatch(/selecciona una raza/i);
  });

  it("renders the team-name dice next to the name input, disabled without a race", async () => {
    await renderForm();
    const dice = screen.getByRole("button", { name: /nombre de equipo al azar/i }) as HTMLButtonElement;
    expect(dice).toBeTruthy();
    expect(dice.disabled).toBe(true);
    expect(dice.textContent).toContain("🎲");
  });

  it("clicking the team-name dice after selecting a race sets a name from that race's bank", async () => {
    await renderForm();
    const dice = screen.getByRole("button", { name: /nombre de equipo al azar/i }) as HTMLButtonElement;
    expect(dice.disabled).toBe(true);
    fireEvent.change(screen.getByLabelText(/raza/i), { target: { value: "orc" } });
    expect(dice.disabled).toBe(false);
    fireEvent.click(dice);
    const nameInput = screen.getByLabelText(/nombre del equipo/i) as HTMLInputElement;
    expect(nameInput.value.length).toBeGreaterThan(0);
    expect(TEAM_NAME_BANKS.orc).toContain(nameInput.value);
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
    expect(screen.getByRole("region", { name: "Cuerpo técnico" })).toBeTruthy();
    expect(screen.getByRole("button", { name: /crear equipo/i })).toBeTruthy();
  });

  it("Jugadores disponibles shows Add buttons; adding a player populates Plantilla", async () => {
    await goToStep2();
    const availability = screen.getByRole("region", { name: "Jugadores disponibles" });
    expect(within(availability).getByRole("button", { name: "Añadir Human Lineman" })).toBeTruthy();
    // Empty Plantilla roster shows the empty-state message.
    expect(screen.getByText(/todavía no hay jugadores en la plantilla/i)).toBeTruthy();

    fireEvent.click(within(availability).getByRole("button", { name: "Añadir Human Lineman" }));
    const plantilla = screen.getByRole("region", { name: "Plantilla" });
    expect(within(plantilla).getByRole("textbox")).toBeTruthy();
    const nameInput = within(plantilla).getByRole("textbox") as HTMLInputElement;
    expectComposedHumanName(nameInput.value);
    // Empty-state message is gone now that the roster has a player.
    expect(screen.queryByText(/todavía no hay jugadores en la plantilla/i)).toBeNull();
  });

  it("player dice re-roll still works and composes a new name in step 2", async () => {
    await goToStep2();
    const availability = screen.getByRole("region", { name: "Jugadores disponibles" });
    fireEvent.click(within(availability).getByRole("button", { name: "Añadir Human Lineman" }));
    const plantilla = screen.getByRole("region", { name: "Plantilla" });
    const nameInput = within(plantilla).getByRole("textbox") as HTMLInputElement;
    expectComposedHumanName(nameInput.value);
    const previous = nameInput.value;

    fireEvent.click(screen.getByRole("button", { name: /tirar nombre al azar/i }));
    expect(nameInput.value).not.toBe(previous);
    expectComposedHumanName(nameInput.value);
  });

  it("Editar nombre/raza returns to step 1 and preserves the entered team name", async () => {
    await goToStep2("Reikland Reavers", "human");
    fireEvent.click(screen.getByRole("button", { name: /editar nombre\/raza/i }));
    expect(screen.getByRole("button", { name: /siguiente/i })).toBeTruthy();
    const nameInput = screen.getByLabelText(/nombre del equipo/i) as HTMLInputElement;
    expect(nameInput.value).toBe("Reikland Reavers");
    const raceSelect = screen.getByLabelText(/raza/i) as HTMLSelectElement;
    expect(raceSelect.value).toBe("human");
  });

  it("step 2 hides rows in Jugadores disponibles once a positional reaches its max", async () => {
    await goToStep2();
    // Add 2 Blitzers (human max 2) through the availability table.
    const availability = screen.getByRole("region", { name: "Jugadores disponibles" });
    for (let i = 0; i < 2; i += 1) {
      fireEvent.click(within(availability).getByRole("button", { name: "Añadir Human Blitzer" }));
    }
    expect(screen.queryByRole("button", { name: "Añadir Human Blitzer" })).toBeNull();
    // Other positionals still available.
    expect(screen.getByRole("button", { name: "Añadir Human Lineman" })).toBeTruthy();
  });

  it("shows budget feedback with formatGold strings in step 2", async () => {
    await goToStep2();
    expect(screen.getByText(/0 jugadores · 0k \/ 1,000k gc/i)).toBeTruthy();
    expect(screen.getByText(/quedan 1,000k/i)).toBeTruthy();
  });

  // --- Race change dialog (in step 2 context after editing step 1) ---

  it("shows a confirm dialog when changing race with an active roster", async () => {
    await goToStep2("Reikland Reavers", "human");
    // Add a player from the availability table (step 2).
    fireEvent.click(screen.getByRole("button", { name: "Añadir Human Lineman" }));
    // Return to step 1 where the race select lives.
    fireEvent.click(screen.getByRole("button", { name: /editar nombre\/raza/i }));
    fireEvent.change(screen.getByLabelText(/raza/i), { target: { value: "orc" } });
    expect(screen.getByText(/borrará tu plantilla actual/i)).toBeTruthy();
  });

  it("clears roster on confirm race change", async () => {
    await goToStep2("Reikland Reavers", "human");
    fireEvent.click(screen.getByRole("button", { name: "Añadir Human Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: /editar nombre\/raza/i }));
    fireEvent.change(screen.getByLabelText(/raza/i), { target: { value: "orc" } });
    fireEvent.click(screen.getByRole("button", { name: /confirm/i }));
    // Return to step 2 to see the empty roster.
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByText(/todavía no hay jugadores en la plantilla/i)).toBeTruthy();
  });

  it("keeps roster on cancel race change", async () => {
    await goToStep2("Reikland Reavers", "human");
    fireEvent.click(screen.getByRole("button", { name: "Añadir Human Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: /editar nombre\/raza/i }));
    fireEvent.change(screen.getByLabelText(/raza/i), { target: { value: "orc" } });
    fireEvent.click(screen.getByRole("button", { name: /cancel/i }));
    // Player remains in step 2 after clicking Siguiente again.
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    const plantilla = screen.getByRole("region", { name: "Plantilla" });
    expect(within(plantilla).getByRole("textbox")).toBeTruthy();
  });

  // --- Coaching staff ---

  it("hides Coaching Staff on step 1 and shows it on step 2", async () => {
    await renderForm();
    expect(screen.queryByRole("region", { name: "Cuerpo técnico" })).toBeNull();
    fireEvent.change(screen.getByLabelText(/nombre del equipo/i), { target: { value: "Team" } });
    fireEvent.change(screen.getByLabelText(/raza/i), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByRole("region", { name: "Cuerpo técnico" })).toBeTruthy();
  });

  it("renders the Coaching Staff inputs with no league-type select", async () => {
    await goToStep2();
    expect(screen.getByLabelText("Segundas oportunidades")).toBeTruthy();
    expect(screen.getByLabelText("Fanáticos dedicados")).toBeTruthy();
    expect(screen.getByLabelText("Entrenadores asistentes")).toBeTruthy();
    expect(screen.getByLabelText("Animadoras")).toBeTruthy();
    expect(screen.getByLabelText("Apotecario")).toBeTruthy();
    // The league-type select is removed: no "League type" label or select exists.
    expect(screen.queryByLabelText("League type")).toBeNull();
    expect(screen.queryByRole("option", { name: "open" })).toBeNull();
    expect(screen.queryByRole("option", { name: "exhibition" })).toBeNull();
  });

  it("shows unit costs next to each coaching field and consumes the budget", async () => {
    await goToStep2();
    const region = screen.getByRole("region", { name: "Cuerpo técnico" });
    expect(within(region).getAllByText("50k gc", { selector: "span" }).length).toBeGreaterThan(0);
    const rerollInput = screen.getByLabelText("Segundas oportunidades") as HTMLInputElement;
    fireEvent.change(rerollInput, { target: { value: "2" } });
    expect(screen.getByText(/quedan 900k/i)).toBeTruthy();
  });

  it("includes the apothecary cost in the coaching subtotal", async () => {
    await goToStep2();
    const region = screen.getByRole("region", { name: "Cuerpo técnico" });
    const apothecary = screen.getByLabelText("Apotecario") as HTMLInputElement;
    expect(within(region).queryByText("50k gc · 50k", { selector: "span" })).toBeNull();
    fireEvent.click(apothecary);
    expect(within(region).getByText("50k gc · 50k", { selector: "span" })).toBeTruthy();
  });
});

describe("CreateTeamForm with a league ruleset (RAU-56)", () => {
  function ruleset(overrides: Partial<RulesetDto> = {}): RulesetDto {
    return {
      id: "r1",
      name: "Estándar BB2025",
      description: null,
      races: ["orc", "skaven"],
      startingTreasury: 1_200_000,
      tvCap: null,
      minPlayers: 11,
      maxPlayers: 16,
      hireFire: "between-jornadas",
      seasonReform: true,
      mercenaries: false,
      active: true,
      createdAt: "2026-01-01",
      updatedAt: "2026-01-01",
      ...overrides,
    };
  }

  async function renderFormWithRuleset() {
    await act(async () => {
      render(
        <AppProvider store={new InMemoryTeamStore()}>
          <HydrationProbe />
          <CreateTeamForm ruleset={ruleset()} leagueId="l1" />
        </AppProvider>,
      );
    });

    await waitFor(() => {
      expect(screen.getByTestId("hydration-status").textContent).toBe("hydrated");
    });
  }

  it("filters the race select to the ruleset's allowed races and shows the ruleset hint", async () => {
    await renderFormWithRuleset();

    // The ruleset hint names the league rules.
    expect(screen.getByText("Reglas de la liga: Estándar BB2025")).toBeTruthy();

    const select = screen.getByLabelText(/raza/i) as HTMLSelectElement;
    const options = Array.from(select.options).map((option) => option.value);
    // Allowed races are present; disallowed races are absent.
    expect(options).toContain("orc");
    expect(options).toContain("skaven");
    expect(options).not.toContain("human");
    expect(options).not.toContain("dwarf");
  });

  it("blocks a disallowed race even when a race is otherwise available", async () => {
    await renderFormWithRuleset();

    const select = screen.getByLabelText(/raza/i) as HTMLSelectElement;
    const humanOption = Array.from(select.options).find((option) => option.value === "human");
    expect(humanOption).toBeUndefined();
  });
});
