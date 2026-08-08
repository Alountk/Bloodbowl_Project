import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import SignupPage from "./page";

const signInMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  signIn: signInMock,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

async function submitForm(email: string, password: string) {
  render(<SignupPage />);
  fireEvent.change(screen.getByLabelText("Email"), { target: { value: email } });
  fireEvent.change(screen.getByLabelText("Password"), { target: { value: password } });
  fireEvent.click(screen.getAllByRole("button", { name: /sign up/i }).at(-1)!);
}

describe("Signup page", () => {
  beforeEach(() => {
    signInMock.mockReset();
    vi.unstubAllGlobals();
  });

  it("POSTs to the signup API then signs the new user in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ id: "user-1", email: "coach@example.com" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    signInMock.mockResolvedValue({ error: null, ok: true });

    await submitForm("coach@example.com", "SuperSecret123!");

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        "/api/auth/signup",
        expect.objectContaining({ method: "POST" }),
      );
    });
    await waitFor(() => {
      expect(signInMock).toHaveBeenCalledWith("credentials", {
        email: "coach@example.com",
        password: "SuperSecret123!",
        redirect: false,
      });
    });
    vi.unstubAllGlobals();
  });

  it("shows the duplicate-email error when the API returns 409", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "An account with this email already exists" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await submitForm("taken@example.com", "SuperSecret123!");

    await waitFor(() =>
      expect(screen.getByText("An account with this email already exists")).toBeTruthy(),
    );
    expect(signInMock).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });
});
