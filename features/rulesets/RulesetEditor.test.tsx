import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RulesetEditor } from "./RulesetEditor";
import type { Ruleset } from "./api";

const onClose = vi.fn();
const onSaved = vi.fn();

const r1: Ruleset = {
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
};

function savedResponse(overrides: Partial<Ruleset> = {}) {
  return Promise.resolve({
    ok: true,
    status: 200,
    json: () => Promise.resolve({ ...r1, ...overrides }),
  });
}

function renderEditor(editing: Ruleset | null) {
  return render(<RulesetEditor editing={editing} onSaved={onSaved} onClose={onClose} />);
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  onClose.mockClear();
  onSaved.mockClear();
});

describe("RulesetEditor", () => {
  it("renders the 4 tabs in create mode starting on tab 1 (Información)", () => {
    renderEditor(null);

    expect(screen.getByRole("tablist", { name: "Configuración del tipo de reglas" })).toBeTruthy();
    const infoTab = screen.getByRole("tab", { name: "1 · Información" });
    expect(infoTab).toHaveProperty("ariaSelected", "true");
    expect(screen.getByRole("tab", { name: "2 · Razas" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "3 · Economía y plantilla" })).toBeTruthy();
    expect(screen.getByRole("tab", { name: "4 · Gestión y reglas" })).toBeTruthy();
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toBeTruthy();
  });

  it("create mode locks direct tab navigation (sequential flow)", () => {
    renderEditor(null);
    const racesTab = screen.getByRole("tab", { name: "2 · Razas" });
    expect((racesTab as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(racesTab);
    expect(screen.queryByLabelText("Human")).toBeNull();
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
  });

  it("blocks advancing without a name", () => {
    renderEditor(null);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect(screen.getByRole("alert").textContent).toBe("El nombre es obligatorio.");
    expect(screen.queryByLabelText("Human")).toBeNull();
  });

  it("walks the 4 tabs sequentially and POSTs on Crear tipo de reglas", async () => {
    const fetchMock = vi.fn(() => savedResponse({ id: "r-new", name: "Liga Tier 1" }));
    vi.stubGlobal("fetch", fetchMock);

    renderEditor(null);

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Liga Tier 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));

    expect(screen.getAllByRole("checkbox")).toHaveLength(31);
    fireEvent.click(screen.getByRole("button", { name: "Tier 1" }));
    expect(screen.getAllByRole("checkbox").filter((el) => (el as HTMLInputElement).checked)).toHaveLength(8);
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));

    expect((screen.getByLabelText("Tesorería inicial") as HTMLInputElement).value).toBe("1000000");
    expect((screen.getByLabelText("Mínimo de jugadores") as HTMLInputElement).value).toBe("11");
    expect((screen.getByLabelText("Máximo de jugadores") as HTMLInputElement).value).toBe("16");
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));

    expect(screen.getByText("Contratar / despedir")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Crear tipo de reglas" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe("/api/dev/rulesets");
    expect(calls[0][1].method).toBe("POST");
    const body = JSON.parse(calls[0][1].body as string) as Record<string, unknown>;
    expect(body.name).toBe("Liga Tier 1");
    expect((body.races as string[]).length).toBe(8);
    expect(body.startingTreasury).toBe(1000000);
    expect(body.active).toBe(true);
  });

  it("create mode can go back with ← Atrás and keeps the draft", () => {
    renderEditor(null);
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Liga Tier 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Siguiente →" }));
    expect(screen.getByLabelText("Human")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "← Atrás" }));
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Liga Tier 1");
  });

  it("edit mode loads the card, allows free tabs and PATCHes on Guardar", async () => {
    const fetchMock = vi.fn(() => savedResponse({ name: "Copa de Invierno" }));
    vi.stubGlobal("fetch", fetchMock);

    renderEditor(r1);
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Copa de Invierno");

    // Free navigation: jump straight to tab 4.
    fireEvent.click(screen.getByRole("tab", { name: "4 · Gestión y reglas" }));
    expect(screen.getByLabelText("Contratar / despedir")).toBeTruthy();
    fireEvent.click(screen.getByLabelText("Reforma del equipo entre temporadas"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    const calls = fetchMock.mock.calls as unknown as Array<[string, RequestInit]>;
    expect(calls[0][0]).toBe("/api/dev/rulesets/r1");
    expect(calls[0][1].method).toBe("PATCH");
  });
});
