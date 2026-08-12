import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { CreateLeagueModal } from "./CreateLeagueModal";

const onClose = vi.fn();
const onCreate = vi.fn(async () => {});

afterEach(() => {
  vi.unstubAllGlobals();
  onClose.mockClear();
  onCreate.mockClear();
});

function renderOpen() {
  render(<CreateLeagueModal open onClose={onClose} onCreate={onCreate} />);
}

function fillNameAndSubmit(name: string) {
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: name } });
  fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));
}describe("CreateLeagueModal", () => {
  it("requires a name before submitting", () => {
    renderOpen();

    fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));

    expect(screen.getByRole("alert").textContent).toBe("El nombre de la liga es obligatorio.");
    // The modal stays open and no create request is made.
    expect(screen.getByRole("dialog", { name: "Nueva liga" })).toBeTruthy();
  });

  it("POSTs the league (with the default turn-clock option enabled@240) and refreshes the list on success", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "l9",
          name: "Costa League",
          description: null,
          ownerId: "u1",
          createdAt: "2026-01-01",
          turnClockEnabled: true,
          turnClockSeconds: 240,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderOpen();
    fillNameAndSubmit("Costa League");

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    await waitFor(() => expect(onCreate).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Costa League",
        description: null,
        turnClockEnabled: true,
        turnClockSeconds: 240,
      }),
    });
  });

  it("surfaces the duplicate-name 409 and stays open", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "League name already exists" }),
      }),
    );

    renderOpen();
    fillNameAndSubmit("Taken League");

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

  it("renders the turn-clock toggle enabled by default with a 240s duration select", () => {
    renderOpen();
    const toggle = screen.getByRole("checkbox", { name: /reloj de turno/i }) as HTMLInputElement;
    expect(toggle.checked).toBe(true);
    expect((screen.getByRole("combobox") as HTMLSelectElement).value).toBe("240");
    // The three valid per-turn durations are offered (120/240/360).
    expect(screen.getByRole("option", { name: "2 min" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "4 min" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "6 min" })).toBeTruthy();
  });

  it("POSTs the chosen enabled option (e.g. 360s) along with the league", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "l10",
          name: "Base 443",
          description: null,
          ownerId: "u1",
          createdAt: "2026-01-01",
          turnClockEnabled: true,
          turnClockSeconds: 360,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderOpen();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Base 443" } });
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "360" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "Base 443",
        description: null,
        turnClockEnabled: true,
        turnClockSeconds: 360,
      }),
    });
  });

  it("POSTs the clocks-disabled option (toggle off) while retaining the chosen duration", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: () =>
        Promise.resolve({
          id: "l11",
          name: "No Clock League",
          description: null,
          ownerId: "u1",
          createdAt: "2026-01-01",
          turnClockEnabled: false,
          turnClockSeconds: 120,
        }),
    });
    vi.stubGlobal("fetch", fetchMock);

    renderOpen();
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "No Clock League" } });
    fireEvent.click(screen.getByRole("checkbox", { name: /reloj de turno/i }));
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "120" } });
    fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));

    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(fetchMock).toHaveBeenCalledWith("/api/leagues", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        name: "No Clock League",
        description: null,
        turnClockEnabled: false,
        turnClockSeconds: 120,
      }),
    });
  });
});
