import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { TeamDeleteModal } from "./TeamDeleteModal";

describe("TeamDeleteModal", () => {
  const fixture = { id: "team-1", name: "Reikland Reavers" };

  beforeEach(() => vi.clearAllMocks());

  it("renders nothing when no team is pending", () => {
    render(<TeamDeleteModal team={null} onCancel={vi.fn()} onConfirm={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByText(/no se puede deshacer/i)).toBeNull();
  });

  it("renders an accessible dialog with the irreversible Spanish copy and both buttons", () => {
    render(<TeamDeleteModal team={fixture} onCancel={vi.fn()} onConfirm={vi.fn()} />);

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(dialog.getAttribute("aria-modal")).toBe("true");
    expect(
      screen.getByText(
        "Esta acción no se puede deshacer. El equipo se archivará y se eliminará de tu lista.",
      ),
    ).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Eliminar" })).toBeTruthy();
  });

  it("calls onCancel and not onConfirm when Cancelar is activated", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();
    render(<TeamDeleteModal team={fixture} onCancel={onCancel} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("calls onConfirm with the team id when Eliminar is activated", () => {
    const onConfirm = vi.fn();
    render(<TeamDeleteModal team={fixture} onCancel={vi.fn()} onConfirm={onConfirm} />);

    fireEvent.click(screen.getByRole("button", { name: "Eliminar" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onConfirm).toHaveBeenCalledWith("team-1");
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("renders the guard message and only an Entendido button when the archive is blocked", () => {
    const guardMessage =
      "No se puede borrar este equipo — pertenece a la liga Liga de Verano. Para poder borrarlo, primero expulsalo de la liga.";
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <TeamDeleteModal
        team={fixture}
        onCancel={onCancel}
        onConfirm={onConfirm}
        guardMessage={guardMessage}
      />,
    );

    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeTruthy();
    expect(screen.getByText(guardMessage)).toBeTruthy();
    // The confirm and cancel actions are replaced by a single Entendido button.
    expect(screen.getByRole("button", { name: "Entendido" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Eliminar" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Cancelar" })).toBeNull();
    // The irreversible copy is not shown when the guard blocks the delete.
    expect(screen.queryByText(/se archivará y se eliminará/i)).toBeNull();
  });

  it("Entendido acknowledges the guard and closes via onCancel", () => {
    const onCancel = vi.fn();
    const onConfirm = vi.fn();

    render(
      <TeamDeleteModal
        team={fixture}
        onCancel={onCancel}
        onConfirm={onConfirm}
        guardMessage="No se puede borrar este equipo — pertenece a la liga Liga de Verano."
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onConfirm).not.toHaveBeenCalled();
  });
});
