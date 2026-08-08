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
  it("calls signIn with credentials and navigates to / on success", async () => {
    signInMock.mockResolvedValue({ error: null, ok: true });

    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "coach@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "SuperSecret123!" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "coach@example.com",
        password: "SuperSecret123!",
        redirect: false,
      });
    });

    await waitFor(() => expect(signInMock).toHaveBeenCalledTimes(1));
  });

  it("shows an invalid-credentials error when signIn reports CredentialsSignin", async () => {
    signInMock.mockResolvedValue({ error: "CredentialsSignin", ok: false });

    render(<SignInPage />);

    fireEvent.change(screen.getByLabelText("Email"), { target: { value: "coach@example.com" } });
    fireEvent.change(screen.getByLabelText("Password"), { target: { value: "wrong-password" } });
    fireEvent.click(screen.getByRole("button", { name: /log in/i }));

    await waitFor(() =>
      expect(screen.getByText("Invalid email or password")).toBeTruthy(),
    );
  });
});
