import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SignInPage from "./page";

const signInMock = vi.hoisted(() => vi.fn());
const pushMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: vi.fn() }),
}));

describe("Login page (AuthModal fallback)", () => {
  it("calls signIn with credentials and navigates to / on success", async () => {
    signInMock.mockResolvedValue({ error: null, ok: true });

    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "coach@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "SuperSecret123!" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" }).at(-1)!);

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "coach@example.com",
        password: "SuperSecret123!",
        redirect: false,
      });
    });

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    // Event-handler router.push to / (lint-approved) so the session is used
    // from the first render (fixes empty teams/leagues until a manual reload).
    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
  });

  it("shows an invalid-credentials error when signIn reports CredentialsSignin", async () => {
    signInMock.mockResolvedValue({ error: "CredentialsSignin", ok: false });

    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Correo electrónico"), { target: { value: "coach@example.com" } });
    fireEvent.change(screen.getByLabelText("Contraseña"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getAllByRole("button", { name: "Sign in" }).at(-1)!);

    await waitFor(() =>
      expect(screen.getByText("Email o contraseña no válidos")).toBeTruthy(),
    );
  });

  it("closing the modal navigates home", () => {
    render(<SignInPage />);
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(pushMock).toHaveBeenCalledWith("/");
  });
});
