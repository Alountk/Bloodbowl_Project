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
}

describe("CreateLeagueModal", () => {
  it("requires a name before submitting", () => {
    renderOpen();

    fireEvent.click(screen.getByRole("button", { name: "Crear liga" }));

    expect(screen.getByRole("alert").textContent).toBe("El nombre de la liga es obligatorio.");
    // The modal stays open and no create request is made.
    expect(screen.getByRole("dialog", { name: "Nueva liga" })).toBeTruthy();
  });

  it("POSTs the league and refreshes the list on success", async () => {
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

  it("no longer renders the turn-clock toggle or duration select (D15 deprecation)", () => {
    renderOpen();
    // The deprecated clock option is GONE from the creation UI (D15).
    expect(screen.queryByRole("checkbox", { name: /reloj de turno/i })).toBeNull();
    expect(screen.queryByRole("combobox")).toBeNull();
    expect(screen.queryByText(/Duración por turno/i)).toBeNull();
    // Name + description + submit remain.
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
    expect(screen.getByLabelText("Descripción")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Crear liga" })).toBeTruthy();
  });
});
