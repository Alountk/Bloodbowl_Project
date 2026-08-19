import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { RulesetManager } from "./RulesetManager";

const r1 = {
  id: "estandar-bb2025",
  name: "Estándar BB2025",
  description: "Reglamento completo.",
  races: ["human", "orc", "dwarf"],
  startingTreasury: 1000000,
  tvCap: null,
  minPlayers: 11,
  maxPlayers: 16,
  hireFire: "between-jornadas",
  seasonReform: true,
  mercenaries: false,
  active: true,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

const r2 = {
  ...r1,
  id: "liga-tier-1",
  name: "Liga Tier 1",
  description: "Competitiva.",
};

const rulesets = [r1, r2];

function stubFetch(overrides: Record<string, Partial<Response>> = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    const override = overrides[url] ?? {};
    return Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve(rulesets),
      ...override,
    } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("RulesetManager", () => {
  it("renders the cards grid with summary chips from the dev API", async () => {
    stubFetch();
    render(<RulesetManager />);

    await waitFor(() => expect(screen.getByText("Estándar BB2025")).toBeTruthy());
    expect(screen.getByRole("heading", { name: /Tipos de reglas/ })).toBeTruthy();
    expect(screen.getByText("Reglamento completo.")).toBeTruthy();
    // Summary chips: races 3/31, treasury 1M, TV ∞, 11–16 jug., Activo.
    expect(screen.getAllByText("3/31")[0]).toBeTruthy();
    expect(screen.getAllByText("1M")[0]).toBeTruthy();
    expect(screen.getAllByText("∞")[0]).toBeTruthy();
    expect(screen.getAllByText("Activo")[0]).toBeTruthy();
  });

  it("shows the editor placeholder while no ruleset is loaded for editing", async () => {
    stubFetch();
    render(<RulesetManager />);

    await waitFor(() => expect(screen.getByText("Estándar BB2025")).toBeTruthy());
    expect(
      screen.getByText(/Selecciona un tipo de la lista para editarlo/),
    ).toBeTruthy();
    expect(screen.queryByRole("tablist")).toBeNull();
  });

  it("opens the inline create editor from + Nuevo tipo", async () => {
    stubFetch();
    render(<RulesetManager />);

    await waitFor(() => expect(screen.getByText("Estándar BB2025")).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: "+ Nuevo tipo" }));

    await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy());
    expect(screen.getByRole("tab", { name: "1 · Información" })).toHaveProperty("ariaSelected", "true");
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
    // The placeholder is replaced by the editor.
    expect(screen.queryByText(/Selecciona un tipo de la lista para editarlo/)).toBeNull();
  });

  it("opens the editor in edit mode from the card Editar button", async () => {
    stubFetch();
    render(<RulesetManager />);

    await waitFor(() => expect(screen.getByText("Estándar BB2025")).toBeTruthy());
    fireEvent.click(screen.getAllByRole("button", { name: "Editar" })[0]);

    await waitFor(() => expect(screen.getByRole("tablist")).toBeTruthy());
    // Edit mode pre-fills the name from the clicked card.
    expect((screen.getByLabelText("Nombre") as HTMLInputElement).value).toBe("Estándar BB2025");
  });

  it("shows the empty-state CTA when there are no rulesets", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve([]) })),
    );
    render(<RulesetManager />);

    await waitFor(() => expect(screen.getByText("No hay tipos de reglas todavía. Crea el primero.")).toBeTruthy());
  });
});
