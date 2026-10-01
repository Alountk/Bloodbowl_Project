import { StrictMode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import VerifyPage from "./page";

const params = vi.hoisted(() => new URLSearchParams());
vi.mock("next/navigation", () => ({
  useSearchParams: () => params,
}));

/** POST answer for `/api/auth/verify/token`. */
const tokenOk = () => ({ ok: true, json: async () => ({ ok: true }) });
const tokenRejected = () => ({
  ok: false,
  status: 400,
  json: async () => ({ error: "Invalid or expired verification code" }),
});

describe("app/verify (mailed activation link)", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    params.set("token", "tok-abc");
    params.set("email", "coach@example.com");
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    params.delete("token");
    params.delete("email");
  });

  it("POSTs the token pair once and reports the verified account", async () => {
    fetchMock.mockResolvedValue(tokenOk());

    render(<VerifyPage />);

    await waitFor(() =>
      expect(screen.getByText("Correo verificado. Ya puedes iniciar sesión.")).toBeTruthy(),
    );
    // Sessionless activation: the pair rides in the mail link and goes to the
    // existing token endpoint — exactly once, no replay.
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "tok-abc", email: "coach@example.com" }),
      }),
    );
    expect(screen.getByRole("link", { name: "Iniciar sesión" }).getAttribute("href")).toBe(
      "/login",
    );
  });

  it("reports the generic failure copy when the endpoint rejects (no raw body leak)", async () => {
    fetchMock.mockResolvedValue(tokenRejected());

    render(<VerifyPage />);

    await waitFor(() =>
      expect(
        screen.getByText(
          "Este enlace de activación no es válido o ha caducado. Inicia sesión para pedir un código nuevo.",
        ),
      ).toBeTruthy(),
    );
    expect(screen.queryByText(/Invalid or expired/)).toBeNull();
    expect(screen.getByRole("link", { name: "Iniciar sesión" }).getAttribute("href")).toBe(
      "/login",
    );
  });

  it("fails without a POST when the link is missing its pair", async () => {
    params.delete("token");
    fetchMock.mockResolvedValue(tokenOk());

    render(<VerifyPage />);

    // The stored hash is domain-separated by the address, so a pair-less link
    // can never match — no point drawing from the shared attempt budget.
    expect(fetchMock).not.toHaveBeenCalled();
    await waitFor(() =>
      expect(screen.getByRole("status").textContent).toContain(
        "Este enlace de activación no es válido",
      ),
    );
  });

  // The fire-once ref claim (page.tsx): StrictMode double-invokes effects in
  // development, so THIS — not the plain renders above — is the test that
  // would fail if the guard were removed (a second POST would draw from the
  // shared attempt budget and, after success, replay a consumed secret).
  it("still POSTs exactly once when rendered inside StrictMode", async () => {
    fetchMock.mockResolvedValue(tokenOk());

    render(
      <StrictMode>
        <VerifyPage />
      </StrictMode>,
    );

    await waitFor(() =>
      expect(screen.getByText("Correo verificado. Ya puedes iniciar sesión.")).toBeTruthy(),
    );
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify/token",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ token: "tok-abc", email: "coach@example.com" }),
      }),
    );
  });
});
