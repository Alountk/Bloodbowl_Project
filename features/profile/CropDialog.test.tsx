import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { CropDialog } from "./CropDialog";

/**
 * CropDialog is a thin react-easy-crop shell (1:1, pan + zoom) for the chosen
 * image. Here we verify the real, DOM-level behavior: it renders the crop
 * container with a zoom control, and wiring the Cancelar button to onCancel.
 */
const baseProps = {
  imageSrc: "data:image/webp;base64,blob-placeholder",
  onCancel: vi.fn(),
  onConfirm: vi.fn(),
  pending: false,
};

describe("CropDialog", () => {
  it("renders the crop stage, a zoom control, and Cancelar/Guardar actions", () => {
    render(<CropDialog {...baseProps} />);

    expect(screen.getByLabelText(/Zoom/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Cancelar/i })).toBeTruthy();
    expect(screen.getByRole("button", { name: /Guardar/i })).toBeTruthy();
  });

  it("calls onCancel when Cancelar is clicked", () => {
    render(<CropDialog {...baseProps} />);

    fireEvent.click(screen.getByRole("button", { name: /Cancelar/i }));

    expect(baseProps.onCancel).toHaveBeenCalledTimes(1);
  });
});
