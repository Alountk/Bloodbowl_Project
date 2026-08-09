import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SignInPage from "./page";

const signInMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

describe("Login page", () => {
  it("calls signIn with credentials and fully navigates to / on success", async () => {
    signInMock.mockResolvedValue({ error: null, ok: true });

    const assignSpy = vi.fn();
    Object.defineProperty(window, "location", {
      value: { ...window.location, assign: assignSpy },
      configurable: true,
    });

    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "coach@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SuperSecret123!" } });
    fireEvent.click(screen.getAllByRole("button", { name: /log in/i }).at(-1)!);

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "coach@example.com",
        password: "SuperSecret123!",
        redirect: false,
      });
    });

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
    // Full navigation so the session cookie is used from the first render
    // (fixes empty teams/leagues until a manual reload).
    await waitFor(() => expect(assignSpy).toHaveBeenCalledWith("/"));
  });

  it("shows an invalid-credentials error when signIn reports CredentialsSignin", async () => {
    signInMock.mockResolvedValue({ error: "CredentialsSignin", ok: false });

    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "coach@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getAllByRole("button", { name: /log in/i }).at(-1)!);

    await waitFor(() =>
      expect(screen.getByText("Invalid email or password")).toBeTruthy(),
    );
  });
});
