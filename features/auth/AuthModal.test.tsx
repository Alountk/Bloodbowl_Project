import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AuthModal } from "./AuthModal";

const signInMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({ signIn: signInMock }));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

function renderModal(overrides: Partial<Parameters<typeof AuthModal>[0]> = {}) {
  const props = { open: true, onClose: vi.fn(), initialMode: "login" as const, ...overrides };
  return { props, result: render(<AuthModal {...props} />) };
}

beforeEach(() => {
  signInMock.mockReset();
  pushMock.mockReset();
  refreshMock.mockReset();
  vi.unstubAllGlobals();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("AuthModal", () => {
  it("renders nothing when closed", () => {
    render(<AuthModal open={false} onClose={() => {}} />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("opens in login mode with email + password and no name field", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: "Iniciar sesión" })).toBeTruthy();
    expect(screen.getByLabelText("Correo electrónico")).toBeTruthy();
    expect(screen.getByLabelText("Contraseña")).toBeTruthy();
    expect(screen.queryByLabelText("Nombre")).toBeNull();
  });

  it("switches to the signup tab showing the name field", () => {
    renderModal();
    fireEvent.click(screen.getAllByRole("button", { name: "Registrarse" })[0]);
    expect(screen.getByRole("dialog", { name: "Registrarse" })).toBeTruthy();
    expect(screen.getByLabelText("Nombre")).toBeTruthy();
  });

  it("signs in with credentials and navigates home on success", async () => {
    signInMock.mockResolvedValue({ error: null });
    renderModal();

    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "coach@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "SuperSecret123!" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Iniciar sesión" }).at(-1)!);

    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "coach@example.com",
        password: "SuperSecret123!",
        redirect: false,
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(refreshMock).toHaveBeenCalled();
  });

  it("shows the translated login error when credentials are rejected", async () => {
    signInMock.mockResolvedValue({ error: "CredentialsSignin" });
    renderModal();

    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "coach@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "wrong" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Iniciar sesión" }).at(-1)!);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe("Email o contraseña no válidos"),
    );
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("POSTs to the signup API (with name) then signs the new user in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "user-1" }) }),
    );
    signInMock.mockResolvedValue({ error: null });
    renderModal({ initialMode: "signup" });

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Coach" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "coach@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "SuperSecret123!" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Registrarse" }).at(-1)!);

    await waitFor(() =>
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "coach@example.com",
        password: "SuperSecret123!",
        redirect: false,
      }),
    );
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("surfaces the signup API message without signing in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: async () => ({ error: "An account with this email already exists" }),
      }),
    );
    renderModal({ initialMode: "signup" });

    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "taken@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "SuperSecret123!" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Registrarse" }).at(-1)!);

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "An account with this email already exists",
      ),
    );
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("closes on the close button", () => {
    const { props } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(props.onClose).toHaveBeenCalled();
  });

  it("closes on Escape", () => {
    const { props } = renderModal();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(props.onClose).toHaveBeenCalled();
  });

  it("closes on a backdrop click (pointerdown on the overlay)", () => {
    const { props } = renderModal();
    const overlay = screen.getByRole("dialog");
    fireEvent.pointerDown(overlay);
    fireEvent.click(overlay);
    expect(props.onClose).toHaveBeenCalled();
  });

  it("does NOT close when the pointerdown started inside the card (backdrop-close race)", () => {
    const { props } = renderModal();
    const overlay = screen.getByRole("dialog");
    const card = overlay.querySelector("div")!;
    fireEvent.pointerDown(card);
    fireEvent.click(overlay);
    expect(props.onClose).not.toHaveBeenCalled();
  });

  it("shows the forgot-password note without closing", () => {
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: /olvidaste tu contraseña/i }));
    expect(screen.getByRole("status").textContent).toBe(
      "El restablecimiento de contraseña aún no está disponible. Pide ayuda al administrador de tu liga.",
    );
  });
});
