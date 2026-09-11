import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ResetLiveMatchModal } from "./ResetLiveMatchModal";

/**
 * ResetLiveMatchModal is the confirmation dialog for a manual live-match reset
 * (LMR-7): it mirrors ForfeitModal's dialog chrome but only confirms a single
 * destructive action. The parent owns the POST; the modal owns the pending
 * (buttons disabled, "Reiniciando…") and error (role=alert) state, and closes
 * itself ONLY on success.
 */

function renderModal(
  props: Partial<{ open: boolean; onConfirm: () => Promise<void>; onClose: () => void }> = {},
) {
  const onConfirm = vi.fn().mockResolvedValue(undefined);
  const onClose = vi.fn();
  render(<ResetLiveMatchModal open onConfirm={onConfirm} onClose={onClose} {...props} />);
  return { onConfirm, onClose };
}

describe("ResetLiveMatchModal", () => {
  it("renders a confirmation dialog with the reset prompt and both actions", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: /Reiniciar partido en vivo/ })).toBeTruthy();
    expect(screen.getByText(/volverá a estar pendiente/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sí, reiniciar" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeTruthy();
  });

  it("fires onConfirm and closes on a successful reset", async () => {
    const { onConfirm, onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Sí, reiniciar" }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it("surfaces a rejected reset as an alert and stays open", async () => {
    const onConfirm = vi.fn().mockRejectedValue(new Error("No se pudo reiniciar el partido."));
    const onClose = vi.fn();
    render(<ResetLiveMatchModal open onConfirm={onConfirm} onClose={onClose} />);

    fireEvent.click(screen.getByRole("button", { name: "Sí, reiniciar" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("No se pudo reiniciar el partido.");
    expect(onClose).not.toHaveBeenCalled();
  });

  it("disables the actions while the reset is in flight", async () => {
    let release!: () => void;
    const onConfirm = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    render(<ResetLiveMatchModal open onConfirm={onConfirm} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: "Sí, reiniciar" }));

    const submitting = (await screen.findByRole("button", {
      name: "Reiniciando…",
    })) as HTMLButtonElement;
    expect(submitting.disabled).toBe(true);
    const cancel = screen.getByRole("button", { name: "Cancelar" }) as HTMLButtonElement;
    expect(cancel.disabled).toBe(true);

    release();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reiniciando…" })).toBeNull());
  });

  it("does not render at all when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog")).toBeNull();
  });
});
