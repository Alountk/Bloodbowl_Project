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

/** Fills step 1 and advances to step 2. */
async function goToStep2(name: string, raceId: string) {
  await waitForHydration();
  await waitFor(() => expect(screen.getByLabelText("Nombre del equipo")).toBeTruthy());
  fireEvent.change(screen.getByLabelText("Nombre del equipo"), { target: { value: name } });
  fireEvent.change(screen.getByLabelText("Raza"), { target: { value: raceId } });
  fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
}

describe("Team creation", () => {
  it("shows the positionals for a race in Jugadores disponibles after moving to step 2", async () => {
    renderWithStore();
    await waitForHydration();
    await waitFor(() => expect(screen.getByLabelText("Raza")).toBeTruthy());

    fireEvent.change(screen.getByLabelText("Nombre del equipo"), { target: { value: "Reikland Reavers" } });
    fireEvent.change(screen.getByLabelText("Raza"), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    const availability = screen.getByRole("region", { name: "Jugadores disponibles" });
    expect(within(availability).getByText("Lineman · (Human, Línea)")).toBeTruthy();
    expect(within(availability).getByText("Blitzer · (Human, Blitzer)")).toBeTruthy();
    expect(within(availability).getByText("Thrower · (Human, Lanzador)")).toBeTruthy();
    expect(within(availability).getByText("Catcher · (Human, Receptor)")).toBeTruthy();
    expect(within(availability).getByText("Ogre · (Human, Grandullón)")).toBeTruthy();
  });

  it("shows a name error when submitting without a name", async () => {
    renderWithStore();
    await waitForHydration();

    fireEvent.change(screen.getByLabelText("Raza"), { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
    expect(screen.getByText("El nombre del equipo es obligatorio")).toBeTruthy();
  });

  it("blocks submit with fewer than 3 players", async () => {
    renderWithStoreAndList();
    await goToStep2("Half Squad", "human");

    fireEvent.click(screen.getByRole("button", { name: "Añadir Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Añadir Lineman" }));
    fireEvent.click(screen.getByRole("button", { name: "Crear equipo" }));

    expect(screen.getByText(/al menos 11 jugadores/i)).toBeTruthy();
    // The team must NOT have been added to the list.
    expect(screen.queryByRole("link", { name: /Half Squad/i })).toBeNull();
  });

  it("blocks adding a player when it would exceed the budget", async () => {
    renderWithStoreAndList();
    await goToStep2("Deathroller Crew", "dwarf");

    // 1 Deathroller (170k) + 11 Linemen (70k each) = 940k; the 12th would exceed.
    const addDeathroller = screen.getByRole("button", { name: "Añadir Deathroller" }) as HTMLButtonElement;
    expect(addDeathroller.disabled).toBe(false);
    fireEvent.click(addDeathroller);
    for (let index = 0; index < 11; index += 1) {
      const addLineman = screen.getByRole("button", { name: "Añadir Lineman" }) as HTMLButtonElement;
      expect(addLineman.disabled).toBe(false);
      fireEvent.click(addLineman);
    }
    // At 940k the 12th lineman button should be disabled.
    const addLinemanBtn = screen.getByRole("button", { name: "Añadir Lineman" }) as HTMLButtonElement;
    expect(addLinemanBtn.disabled).toBe(true);
  });

  it("disables the increment button when a positional reaches its max", async () => {
    renderWithStore();
    await waitForHydration();

    fireEvent.change(screen.getByLabelText("Nombre del equipo"), { target: { value: "Orc Pack" } });
    fireEvent.change(screen.getByLabelText("Raza"), { target: { value: "orc" } });
    fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));

    // Orc Troll has max 1.
    const addTroll = screen.getByRole("button", {
      name: "Añadir Troll",
    }) as HTMLButtonElement;
    expect(addTroll.disabled).toBe(false);
    fireEvent.click(addTroll);
    // At max, the row disappears entirely (the user's explicit requirement).
    expect(screen.queryByRole("button", { name: "Añadir Troll" })).toBeNull();
  });

  it("adds a valid team to the list and shows its roster summary", async () => {
    renderWithStoreAndList();
    await goToStep2("Reikland Reavers", "human");

    for (let i = 0; i < 11; i++) {
      fireEvent.click(screen.getByRole("button", { name: "Añadir Lineman" }));
    }
    fireEvent.click(screen.getByRole("button", { name: "Crear equipo" }));

    await waitFor(() => expect(screen.getByText("Reikland Reavers")).toBeTruthy());
    const teamCard = screen.getByText("Reikland Reavers").closest("li")!;
    expect(within(teamCard).getByText("Human")).toBeTruthy();
    expect(within(teamCard).getByText("11 jugadores · 11x Lineman")).toBeTruthy();
  });
});
