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

/** A successful signup answer (the only call the default route makes). */
const signupOk = () => ({ ok: true, json: async () => ({ id: "user-1", verifyRequired: true }) });

/**
 * Drives the signup form to the code screen, with every `fetch(url)` routed
 * through `route` so a test can script the resend answers per URL.
 */
async function openVerifyView(route: (url: string) => Promise<unknown> = async () => signupOk()) {
  const fetchMock = vi.fn((url: string) => route(url));
  vi.stubGlobal("fetch", fetchMock);
  renderModal({ initialMode: "signup" });
  fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Coach" } });
  fireEvent.change(screen.getByLabelText("Correo electrónico"), {
    target: { value: "coach@example.com" },
  });
  fireEvent.change(screen.getByLabelText("Contraseña"), {
    target: { value: "SuperSecret123!" },
  });
  fireEvent.click(screen.getAllByRole("button", { name: "Registrarse" }).at(-1)!);
  await waitFor(() => expect(screen.getByLabelText("Código de verificación")).toBeTruthy());
  return fetchMock;
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

  it("signup shows the check-your-email code screen WITHOUT signing in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "user-1", verifyRequired: true }),
      }),
    );
    renderModal({ initialMode: "signup" });

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Coach" } });
    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "coach@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "SuperSecret123!" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Registrarse" }).at(-1)!);

    // Two-step signup (#197): the panel asks for the mailed code, shows the
    // target address, and neither a session nor navigation happens yet.
    await waitFor(() =>
      expect(screen.getByLabelText("Código de verificación")).toBeTruthy(),
    );
    expect(screen.getByText(/coach@example\.com/)).toBeTruthy();
    expect(signInMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("entering the mailed code verifies, signs in, and navigates home", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ id: "user-1", verifyRequired: true }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
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
      expect(screen.getByLabelText("Código de verificación")).toBeTruthy(),
    );

    fireEvent.change(screen.getByLabelText("Código de verificación"), {
      target: { value: "042133" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(refreshMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/auth/verify/code",
      expect.objectContaining({
        body: JSON.stringify({ email: "coach@example.com", code: "042133" }),
      }),
    );
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "coach@example.com",
      password: "SuperSecret123!",
      redirect: false,
    });
  });

  it("surfaces a rejected code and does not sign in", async () => {
    vi.stubGlobal(
      "fetch",
      vi
        .fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ id: "user-1", verifyRequired: true }),
        })
        .mockResolvedValueOnce({ ok: false, status: 400, json: async () => ({}) }),
    );
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
      expect(screen.getByLabelText("Código de verificación")).toBeTruthy(),
    );

    fireEvent.change(screen.getByLabelText("Código de verificación"), {
      target: { value: "000000" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "El código no es válido o ha caducado.",
      ),
    );
    expect(signInMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("a login refused with code=email_not_verified opens the code screen and completes the sign-in", async () => {
    // Refusal (correct password, unverified account), then the successful
    // sign-in after the code is confirmed.
    signInMock
      .mockResolvedValueOnce({ error: "CredentialsSignin", code: "email_not_verified" })
      .mockResolvedValueOnce({ error: null });
    const fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    renderModal();

    fireEvent.change(screen.getByLabelText("Correo electrónico"), {
      target: { value: "coach@example.com" },
    });
    fireEvent.change(screen.getByLabelText("Contraseña"), {
      target: { value: "SuperSecret123!" },
    });
    fireEvent.click(screen.getAllByRole("button", { name: "Iniciar sesión" }).at(-1)!);

    // THE lockout fix (#197): the refusal lands on the code screen, not on a
    // dead-end message in the form. Email + password stay in state.
    await waitFor(() => expect(screen.getByLabelText("Código de verificación")).toBeTruthy());
    expect(screen.getByText(/coach@example\.com/)).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalled();
    expect(signInMock).toHaveBeenCalledTimes(1);

    // `submitVerification` from the LOGIN path: posts the code, then signs in
    // with the credentials already in state — no re-entry needed.
    fireEvent.change(screen.getByLabelText("Código de verificación"), {
      target: { value: "042133" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Verificar" }));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(refreshMock).toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify/code",
      expect.objectContaining({
        body: JSON.stringify({ email: "coach@example.com", code: "042133" }),
      }),
    );
    expect(signInMock).toHaveBeenLastCalledWith("credentials", {
      email: "coach@example.com",
      password: "SuperSecret123!",
      redirect: false,
    });
  });

  it("resends the code and shows a calm confirmation with the target address", async () => {
    const fetchMock = await openVerifyView(async (url) =>
      url === "/api/auth/verify/resend"
        ? { ok: true, json: async () => ({ ok: true }) }
        : signupOk(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Hemos enviado un nuevo código a coach@example.com.",
      ),
    );
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify/resend",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "coach@example.com" }),
      }),
    );
    expect(signInMock).not.toHaveBeenCalled();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("turns the resend cooldown 429 into a retry message (never the raw JSON body)", async () => {
    await openVerifyView(async (url) =>
      url === "/api/auth/verify/resend"
        ? {
            ok: false,
            status: 429,
            headers: { get: (name: string) => (name === "retry-after" ? "42" : null) },
            json: async () => ({ error: "Too many requests" }),
          }
        : signupOk(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));

    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toBe(
        "Espera 42 segundos antes de pedir otro código.",
      ),
    );
    expect(screen.queryByText(/Too many requests/)).toBeNull();
  });

  it("shows a generic resend note when the request fails (transport error)", async () => {
    await openVerifyView(async (url) =>
      url === "/api/auth/verify/resend" ? Promise.reject(new Error("offline")) : signupOk(),
    );

    fireEvent.click(screen.getByRole("button", { name: "Reenviar código" }));

    await waitFor(() =>
      expect(screen.getByRole("alert").textContent).toBe(
        "No se pudo reenviar el código. Inténtalo de nuevo.",
      ),
    );
    expect(pushMock).not.toHaveBeenCalled();
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

    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Coach" } });
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
