import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { submitAuth, submitVerification } from "./authSubmit";

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

  it("POSTs to the signup route (with name) and asks for verification, WITHOUT signing in", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ id: "user-1", verifyRequired: true }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const outcome = await submitAuth({
      mode: "signup",
      email: "coach@example.com",
      password: "SuperSecret123!",
      name: "  Coach   ",
    });

    expect(outcome.ok).toBe(true);
    // Two-step signup (#197): the code screen, never a session.
    expect(outcome.next).toBe("verify");
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
    expect(signInMock).not.toHaveBeenCalled();
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

  it("maps login of an unverified account (code=email_not_verified) to its own key", async () => {
    signInMock.mockResolvedValue({
      error: "CredentialsSignin",
      code: "email_not_verified",
    });

    const outcome = await submitAuth({
      mode: "login",
      email: "coach@example.com",
      password: "SuperSecret123!",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBe("emailNotVerified");
  });

  it("skips the code screen when signup answers verifyRequired:false (AUTH_MODE=local)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ id: "user-1", verifyRequired: false }),
      }),
    );

    const outcome = await submitAuth({
      mode: "signup",
      email: "coach@example.com",
      password: "SuperSecret123!",
    });

    // No `next: verify` → the caller navigates straight home; no session to make.
    expect(outcome.ok).toBe(true);
    expect(outcome.next).toBeUndefined();
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("fails CLOSED to the code screen when the signup body omits verifyRequired", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => ({ id: "user-1" }) }),
    );

    const outcome = await submitAuth({
      mode: "signup",
      email: "coach@example.com",
      password: "SuperSecret123!",
    });

    // Only an EXPLICIT `false` may skip verification (authSubmit.ts:94-97) —
    // a missing field must never silently establish an unverified account
    // with no session and no code screen.
    expect(outcome.ok).toBe(true);
    expect(outcome.next).toBe("verify");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("fails CLOSED to the code screen when the signup body is a garbled non-object", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, json: async () => null }),
    );

    const outcome = await submitAuth({
      mode: "signup",
      email: "coach@example.com",
      password: "SuperSecret123!",
    });

    expect(outcome.ok).toBe(true);
    expect(outcome.next).toBe("verify");
    expect(signInMock).not.toHaveBeenCalled();
  });

  it("submitVerification accepts the mailed code, signs in, and reports ok", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue({ ok: true, json: async () => ({ ok: true }) });
    vi.stubGlobal("fetch", fetchMock);
    signInMock.mockResolvedValue({ error: null });

    const outcome = await submitVerification({
      email: "coach@example.com",
      password: "SuperSecret123!",
      code: "421337",
    });

    expect(outcome.ok).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/auth/verify/code",
      expect.objectContaining({
        method: "POST",
        body: JSON.stringify({ email: "coach@example.com", code: "421337" }),
      }),
    );
    expect(signInMock).toHaveBeenCalledWith("credentials", {
      email: "coach@example.com",
      password: "SuperSecret123!",
      redirect: false,
    });
  });

  it("submitVerification maps a rejected code to verifyFailed and does NOT sign in", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => ({}) }),
    );

    const outcome = await submitVerification({
      email: "coach@example.com",
      password: "SuperSecret123!",
      code: "000000",
    });

    expect(outcome.ok).toBe(false);
    expect(outcome.errorKey).toBe("verifyFailed");
    expect(signInMock).not.toHaveBeenCalled();
  });
});
