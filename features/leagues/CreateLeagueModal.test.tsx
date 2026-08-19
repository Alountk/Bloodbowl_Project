import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateLeagueModal } from "./CreateLeagueModal";

const onClose = vi.fn();
const onCreate = vi.fn(async () => {});

const activeRulesets = [
  { id: "estandar-bb2025", name: "Estándar BB2025", description: null },
  { id: "tier1", name: "Liga Tier 1", description: null },
];

function stubFetch(opts: { listOk?: boolean } = {}) {
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/rulesets") {
      if (opts.listOk === false) {
        return Promise.resolve({ ok: false, status: 401, json: () => Promise.resolve({ error: "Unauthorized" }) } as Response);
      }
      return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(activeRulesets) } as Response);
    }
    if (url === "/api/leagues") {
      return Promise.resolve({
        ok: true,
        status: 201,
        json: () =>
          Promise.resolve({
            id: "l9",
            name: "Costa League",
            description: null,
            ownerId: "u1",
            createdAt: "2026-01-01",
            rulesetId: "estandar-bb2025",
            rulesetName: "Estándar BB2025",
          }),
      } as Response);
    }
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) } as Response);
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

afterEach(() => {
  vi.unstubAllGlobals();
  onClose.mockClear();
  onCreate.mockClear();
});

function renderOpen() {
  render(<CreateLeagueModal open onClose={onClose} onCreate={onCreate} />);
}

describe("CreateLeagueModal", () => {
  it("requires a name before submitting", () => {
    stubFetch();
    renderOpen();

    fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));

    expect(screen.getByRole("alert").textContent).toBe("El nombre de la liga es obligatorio.");
    // The modal stays open and no create request is made.
    expect(screen.getByRole("dialog", { name: "Nueva liga" })).toBeTruthy();
  });

  it("POSTs the league with the default (first active) ruleset and refreshes the list", async () => {
    const fetchMock = stubFetch();
    renderOpen();

    // The ruleset selector defaults to the first active ruleset (Estándar).
    await waitFor(() =>
      expect((screen.getByLabelText("Tipo de reglas") as HTMLSelectElement).value).toBe("estandar-bb2025"),
    );

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Costa League" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Costa League",
        description: null,
        rulesetId: "estandar-bb2025",
      }),
    });
  });

  it("POSTs the selected ruleset when the user changes the selector", async () => {
    const fetchMock = stubFetch();
    renderOpen();

    await waitFor(() => expect(screen.getByLabelText("Tipo de reglas")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Tipo de reglas"), { target: { value: "tier1" } });
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Tier League" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const leagueCall = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).find(
      (call) => call[0] === "/api/leagues",
    );
    const body = JSON.parse(leagueCall?.[1].body as string);
    expect(body.rulesetId).toBe("tier1");
  });

  it("creates without a ruleset when none is available (legacy behavior)", async () => {
    const fetchMock = stubFetch({ listOk: false });
    renderOpen();

    await waitFor(() =>
      expect((screen.getByLabelText("Tipo de reglas") as HTMLSelectElement).value).toBe(""),
    );
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Offline League" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    const leagueCall = (fetchMock.mock.calls as unknown as Array<[string, RequestInit]>).find(
      (call) => call[0] === "/api/leagues",
    );
    const body = JSON.parse(leagueCall?.[1].body as string);
    expect(body.rulesetId).toBeNull();
  });

  it("surfaces the duplicate-name 409 and stays open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn((input: RequestInfo | URL) => {
        const url = String(input);
        if (url === "/api/rulesets") {
          return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(activeRulesets) } as Response);
        }
        return Promise.resolve({
          ok: false,
          status: 409,
          json: () => Promise.resolve({ error: "League name already exists" }),
        } as Response);
      }),
    );

    renderOpen();
    await waitFor(() => expect(screen.getByLabelText("Tipo de reglas")).toBeTruthy());
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Taken League" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Ya existe una liga con ese nombre."),
    );
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog", { name: "Nueva liga" })).toBeTruthy();
  });

  it("returns null when closed", () => {
    vi.stubGlobal("fetch", vi.fn());
    const { container } = render(
      <CreateLeagueModal open={false} onClose={onClose} onCreate={onCreate} />,
    );
    expect(container.firstChild).toBeNull();
  });

  it("no longer renders the turn-clock toggle but keeps the ruleset selector (RAU-52)", () => {
    stubFetch();
    renderOpen();
    // The deprecated clock option is GONE from the creation UI (D15).
    expect(screen.queryByRole("checkbox", { name: /reloj de turno/i })).toBeNull();
    expect(screen.queryByText(/Duración por turno/i)).toBeNull();
    // Name + description + ruleset selector + submit remain.
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toBeTruthy();
    expect(screen.getByLabelText("Tipo de reglas")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear liga" })).toBeTruthy();
  });
});
