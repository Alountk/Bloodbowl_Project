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
});
