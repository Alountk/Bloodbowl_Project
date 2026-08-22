import { describe, expect, it, vi, beforeEach } from "vitest";

const prismaMock = vi.hoisted(() => ({
  user: {
    create: vi.fn(),
  },
}));

const bcryptMock = vi.hoisted(() => ({
  hash: vi.fn(),
}));

vi.mock("@/lib/prisma", () => ({
  prisma: prismaMock,
}));

vi.mock("bcryptjs", () => bcryptMock);

import { POST } from "./route";

describe("POST /api/auth/signup", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("creates a user and returns 201 with the created user when credentials are valid", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: null,
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "coach@example.com", password: "SuperSecret123!" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);

    const body = await res.json();
    expect(body.id).toBe("user-1");

    // Password must be hashed before persisting — never stored in plaintext.
    expect(bcryptMock.hash).toHaveBeenCalledWith("SuperSecret123!", expect.any(Number));
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "coach@example.com",
          passwordHash: "hashed-password",
        }),
      }),
    );
  });

  it("stores an optional trimmed display name", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: "Coach",
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({
        email: "coach@example.com",
        password: "SuperSecret123!",
        name: "  Coach  ",
      }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "coach@example.com",
          passwordHash: "hashed-password",
          name: "Coach",
        }),
      }),
    );
  });

  it("captures the account locale from the bb-locale cookie (RAU-58)", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: null,
      locale: "en",
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "coach@example.com", password: "SuperSecret123!" }),
      headers: {
        "content-type": "application/json",
        cookie: "bb-locale=en",
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(201);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ email: "coach@example.com", locale: "en" }),
      }),
    );
    expect((await res.json()).locale).toBe("en");
  });

  it("ignores an invalid bb-locale cookie value and leaves the DB default (es)", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    prismaMock.user.create.mockResolvedValue({
      id: "user-1",
      email: "coach@example.com",
      name: null,
      locale: "es",
    });

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "coach@example.com", password: "SuperSecret123!" }),
      headers: {
        "content-type": "application/json",
        cookie: "bb-locale=fr",
      },
    });

    await POST(req);
    expect(prismaMock.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ locale: undefined }),
      }),
    );
  });

  it("returns 400 when the payload is missing required fields", async () => {
    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "", password: "" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(400);
    expect(prismaMock.user.create).not.toHaveBeenCalled();
  });

  it("returns 409 with a clear message when the email is already registered", async () => {
    bcryptMock.hash.mockResolvedValue("hashed-password");
    const conflict = new Error("Unique constraint failed");
    (conflict as Error & { code?: string }).code = "P2002";
    prismaMock.user.create.mockRejectedValue(conflict);

    const req = new Request("http://localhost:3000/api/auth/signup", {
      method: "POST",
      body: JSON.stringify({ email: "taken@example.com", password: "SuperSecret123!" }),
      headers: { "content-type": "application/json" },
    });

    const res = await POST(req);
    expect(res.status).toBe(409);

    const body = await res.json();
    expect(body.error).toBe("An account with this email already exists");
  });
});
