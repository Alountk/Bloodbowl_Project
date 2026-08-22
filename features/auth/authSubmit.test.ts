import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitAuth } from "./authSubmit";

const signInMock = vi.hoisted(() => vi.fn());
vi.mock("next-auth/react", () => ({ signIn: signInMock }));

describe("submitAuth", () => {
  beforeEach(() => {
    signInMock.mockReset();
    vi.unstubAllGlobals();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("signs in with the Credentials provider on login", async () => {
    signInMock.mockResolvedValue({ error: null });

    const outcome = await submitAuth({
      mode: "login",
      email: "coach@example.com",
      password: "SuperSecret123!",
    });

    expect(outcome.ok).toBe(true);
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "coach@example.com",
      password: "SuperSecret123!",
      redirect: false,
    });
  });

  it("maps a signIn error to the loginError key", async () => {
    signInMock.mockResolvedValue({ error: "CredentialsSignin" });

    const outcome = await submitAuth({
      mode: "login",
      email: "coach@example.com",
      password: "wrong",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBe("loginError");
  });

  it("maps a signIn rejection to the loginError key", async () => {
    signInMock.mockRejectedValue(new Error("network"));

    const outcome = await submitAuth({
      mode: "login",
      email: "coach@example.com",
      password: "SuperSecret123!",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBe("loginError");
  });

  it("POSTs to the signup route (with name) then signs the new user in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "user-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    signInMock.mockResolvedValue({ error: null });

    const outcome = await submitAuth({
      mode: "signup",
      email: "coach@example.com",
      password: "SuperSecret123!",
      name: "  Coach   ",
    });

    expect(outcome.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/signup",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({
          email: "coach@example.com",
          password: "SuperSecret123!",
          name: "Coach",
        }),
      }),
    );
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "coach@example.com",
      password: "SuperSecret123!",
      redirect: false,
    });
  });

  it("omits an empty name from the signup payload", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "user-1" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    signInMock.mockResolvedValue({ error: null });

    const outcome = await submitAuth({
      mode: "signup",
      email: "coach@example.com",
      password: "SuperSecret123!",
      name: "",
    });

    expect(outcome.ok).toBe(true);
    const body = JSON.parse(
      (fetchMock.mock.calls[0][1] as { body: string }).body,
    ) as { name?: string };
    expect(body.name).toBeUndefined();
  });

  it("surfaces the signup API message and does not sign in on 409", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: false,
      status: 409,
      json: async () => ({ error: "An account with this email already exists" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await submitAuth({
      mode: "signup",
      email: "taken@example.com",
      password: "SuperSecret123!",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBe("signupFailed");
    expect(outcome.serverError).toBe("An account with this email already exists");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("maps a failed signup fetch to the signupFailed key", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("offline")));

    const outcome = await submitAuth({
      mode: "signup",
      email: "coach@example.com",
      password: "SuperSecret123!",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBe("signupFailed");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("maps a signIn error after a successful signup to signupSigninFailed", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "user-1" }) }),
    );
    signInMock.mockResolvedValue({ error: "CredentialsSignin" });

    const outcome = await submitAuth({
      mode: "signup",
      email: "coach@example.com",
      password: "SuperSecret123!",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBe("signupSigninFailed");
  });
});
