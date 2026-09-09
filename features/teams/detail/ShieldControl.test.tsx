import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { ShieldControl } from "./ShieldControl";

// Mock the teams API module: ShieldControl never performs a real fetch in tests.
// The hoisted mocks are asserted directly (upload/remove args + refresh wiring).
const { uploadTeamShieldMock, removeTeamShieldMock } = vi.hoisted(() => ({
  uploadTeamShieldMock: vi.fn(),
  removeTeamShieldMock: vi.fn(),
}));

vi.mock("../api", () => ({
  uploadTeamShield: uploadTeamShieldMock,
  removeTeamShield: removeTeamShieldMock,
}));

const TEAM_ID = "team-t1";

function renderControl({
  hasEmblem = false,
  onShieldChanged,
}: {
  hasEmblem?: boolean;
  onShieldChanged?: () => void | Promise<void>;
} = {}) {
  return render(
    <ShieldControl teamId={TEAM_ID} hasEmblem={hasEmblem} onShieldChanged={onShieldChanged} />,
  );
}

function pickFile(name = "shield.png") {
  const input = screen.getByTestId("shield-file-input") as HTMLInputElement;
  const file = new File(["fake-png-bytes"], name, { type: "image/png" });
  fireEvent.change(input, { target: { files: [file] } });
  return file;
}

beforeEach(() => {
  uploadTeamShieldMock.mockReset().mockResolvedValue({ emblem: "/uploads/shields/t1-a.webp" });
  removeTeamShieldMock.mockReset().mockResolvedValue({ emblem: null });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("ShieldControl (RAU-78) — rendering", () => {
  it("renders the Subir escudo trigger and a hidden image file input when the team has no shield", () => {
    renderControl();

    expect(screen.getByRole("button", { name: "Subir escudo" })).toBeTruthy();
    const input = screen.getByTestId("shield-file-input") as HTMLInputElement;
    expect(input.getAttribute("type")).toBe("file");
    expect(input.getAttribute("accept")).toBe("image/jpeg,image/png,image/webp");
    expect(screen.queryByRole("button", { name: "Quitar escudo" })).toBeNull();
    expect(screen.queryByTestId("shield-status-error")).toBeNull();
  });

  it("adds the Quitar escudo action only when the team already has an emblem", () => {
    renderControl({ hasEmblem: true });

    expect(screen.getByRole("button", { name: "Subir escudo" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Quitar escudo" })).toBeTruthy();
  });
});

describe("ShieldControl (RAU-78) — upload", () => {
  it("uploads the picked file via uploadTeamShield and refreshes the team on success", async () => {
    const onShieldChanged = vi.fn().mockResolvedValue(undefined);
    renderControl({ onShieldChanged });

    const file = pickFile();

    await waitFor(() => {
      expect(uploadTeamShieldMock).toHaveBeenCalledWith(TEAM_ID, file);
    });
    await waitFor(() => {
      expect(onShieldChanged).toHaveBeenCalledTimes(1);
    });
    // Success feedback is announced through a live status region.
    const status = screen.getByTestId("shield-status-success");
    expect(status.getAttribute("role")).toBe("status");
    expect(status.textContent).toBe("Escudo actualizado.");
  });

  it("clears any prior error before a new upload and never shows a remove action without an emblem", async () => {
    uploadTeamShieldMock.mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce({
      emblem: "/uploads/shields/t1-a.webp",
    });
    const onShieldChanged = vi.fn();
    renderControl({ onShieldChanged });

    pickFile();
    await waitFor(() => {
      expect(screen.getByTestId("shield-status-error").getAttribute("role")).toBe("alert");
      expect(screen.getByTestId("shield-status-error").textContent).toBe(
        "No se pudo actualizar el escudo.",
      );
    });
    expect(onShieldChanged).not.toHaveBeenCalled();

    // A successful retry replaces the error with the success live region.
    pickFile();
    await waitFor(() => {
      expect(screen.getByTestId("shield-status-success").textContent).toBe("Escudo actualizado.");
      expect(screen.queryByTestId("shield-status-error")).toBeNull();
    });
    expect(onShieldChanged).toHaveBeenCalledTimes(1);
  });

  it("shows the pending state (disabled actions + live status) while the request is in flight", async () => {
    let release!: () => void;
    uploadTeamShieldMock.mockReturnValue(
      new Promise((resolve) => {
        release = () => resolve({ emblem: "/uploads/shields/t1-a.webp" });
      }),
    );
    renderControl({ hasEmblem: true, onShieldChanged: vi.fn() });

    pickFile();

    expect(screen.getByRole("button", { name: "Subir escudo" })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: "Quitar escudo" })).toHaveProperty("disabled", true);
    const pending = screen.getByTestId("shield-status-pending");
    expect(pending.getAttribute("role")).toBe("status");
    expect(pending.textContent).toBe("Actualizando…");

    release();
    await waitFor(() => {
      expect(screen.queryByTestId("shield-status-pending")).toBeNull();
    });
  });
});

describe("ShieldControl (RAU-78) — removal", () => {
  it("removes the shield via removeTeamShield and refreshes the team on success", async () => {
    const onShieldChanged = vi.fn().mockResolvedValue(undefined);
    renderControl({ hasEmblem: true, onShieldChanged });

    fireEvent.click(screen.getByRole("button", { name: "Quitar escudo" }));

    await waitFor(() => {
      expect(removeTeamShieldMock).toHaveBeenCalledWith(TEAM_ID);
    });
    await waitFor(() => {
      expect(onShieldChanged).toHaveBeenCalledTimes(1);
    });
    const status = screen.getByTestId("shield-status-success");
    expect(status.textContent).toBe("Escudo actualizado.");
    expect(uploadTeamShieldMock).not.toHaveBeenCalled();
  });

  it("surfaces the error alert and does not refresh when the removal is denied", async () => {
    removeTeamShieldMock.mockRejectedValue(new Error("Not found"));
    const onShieldChanged = vi.fn();
    renderControl({ hasEmblem: true, onShieldChanged });

    fireEvent.click(screen.getByRole("button", { name: "Quitar escudo" }));

    await waitFor(() => {
      expect(screen.getByTestId("shield-status-error").textContent).toBe(
        "No se pudo actualizar el escudo.",
      );
    });
    expect(onShieldChanged).not.toHaveBeenCalled();
  });
});
