import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RulesetWizard } from "./RulesetWizard";

const onClose = vi.fn();
const onSaved = vi.fn();

afterEach(() => {
  vi.unstubAllGlobals();
  onClose.mockClear();
  onSaved.mockClear();
});

function renderOpen(editing?: Parameters<typeof RulesetWizard>[0]["editing"]) {
  render(<RulesetWizard onClose={onClose} onSaved={onSaved} editing={editing} />);
}

describe("RulesetWizard", () => {
  it("renders step 1 (Información) with the step bar and name/description fields", () => {
    renderOpen();
    expect(screen.getByRole("dialog", { name: "Nuevo tipo de reglas" })).toBeTruthy();
    expect(screen.getByText("1 · Información")).toBeTruthy();
    expect(screen.getByText("2 · Razas")).toBeTruthy();
    expect(screen.getByText("3 · Economía y plantilla")).toBeTruthy();
    expect(screen.getByText("4 · Gestión y reglas")).toBeTruthy();
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toBeTruthy();
  });

  it("blocks advancing without a name", () => {
    renderOpen();
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect(screen.getByRole("alert").textContent).toBe("El nombre es obligatorio.");
    // Still on step 1 (no race checkboxes rendered yet).
    expect(screen.queryByLabelText("Human")).toBeNull();
  });

  it("walks the 4 steps and creates the ruleset via POST on save", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: "r-new",
            name: "Liga Tier 1",
            description: null,
            races: ["human", "orc", "dwarf"],
            startingTreasury: 1000000,
            tvCap: null,
            minPlayers: 11,
            maxPlayers: 16,
            hireFire: "between-jornadas",
            seasonReform: true,
            mercenaries: false,
            active: true,
          }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderOpen();

    // Step 1 → name.
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Liga Tier 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));

    // Step 2 → 31 race checkboxes with the Tier 1 preset.
    expect(screen.getAllByRole("checkbox")).toHaveLength(31);
    fireEvent.click(screen.getByRole("button", { name: "Tier 1" }));
    expect(screen.getAllByRole("checkbox").filter((el) => (el as HTMLInputElement).checked)).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));

    // Step 3 → treasury/tvCap/min/max pre-filled with the defaults.
    expect((screen.getByLabelText("Tesorería inicial") as HTMLInputElement).value).toBe("1000000");
    expect((screen.getByLabelText("Mínimo de jugadores") as HTMLInputElement).value).toBe("11");
    expect((screen.getByLabelText("Máximo de jugadores") as HTMLInputElement).value).toBe("16");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));

    // Step 4 → management toggles; save POSTs the draft.
    expect(screen.getByText("Contratar / despedir")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Guardar tipo de reglas" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    const body = JSON.parse(calls[0][1].body as string) as Record<string, unknown>;
    expect(calls[0][0]).toBe("/api/dev/rulesets");
    expect(calls[0][1].method).toBe("POST");
    expect(body.name).toBe("Liga Tier 1");
    // The Tier 1 preset applied in step 2 is what gets persisted.
    expect((body.races as string[]).length).toBe(8);
    expect(body.startingTreasury).toBe(1000000);
    expect(body.active).toBe(true);
  });

  it("validates step 3 amounts and min ≤ max before continuing", () => {
    renderOpen();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "X" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));

    fireEvent.change(screen.getByLabelText("Tesorería inicial"), { target: { value: "0" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect(screen.getByRole("alert").textContent).toContain("tesorería inicial");

    fireEvent.change(screen.getByLabelText("Tesorería inicial"), { target: { value: "1000000" } });
    fireEvent.change(screen.getByLabelText("Mínimo de jugadores"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("Máximo de jugadores"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect(screen.getByRole("alert").textContent).toContain("mínimo");
  });

  it("edit mode pre-fills the draft and PATCHes on save", async () => {
    const fetchMock = vi.fn(() =>
      Promise.resolve({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            id: "r1",
            name: "Copa de Invierno",
            description: null,
            races: ["human"],
            startingTreasury: 1000000,
            tvCap: 1300000,
            minPlayers: 11,
            maxPlayers: 16,
            hireFire: "libre",
            seasonReform: false,
            mercenaries: true,
            active: false,
          }),
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    renderOpen({
      id: "r1",
      name: "Copa de Invierno",
      description: "Torneo corto",
      races: ["human"],
      startingTreasury: 1000000,
      tvCap: 1300000,
      minPlayers: 11,
      maxPlayers: 16,
      hireFire: "libre",
      seasonReform: false,
      mercenaries: true,
      active: false,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    });

    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Copa de Invierno");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect((screen.getByLabelText("Tope de TV") as HTMLInputElement).value).toBe("1300000");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar tipo de reglas" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe("/api/dev/rulesets/r1");
    expect(calls[0][1].method).toBe("PATCH");
    const body = JSON.parse(calls[0][1].body as string) as Record<string, unknown>;
    expect(body.hireFire).toBe("libre");
    expect(body.active).toBe(false);
  });
});
