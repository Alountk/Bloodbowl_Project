import { afterEach, describe, expect, it } from "vitest";
import {
  AUTH_RATE_LIMITS,
  clientIp,
  rateLimit,
  resetRateLimits,
  tooManyRequests,
} from "./rateLimit";

afterEach(() => {
  resetRateLimits();
});

describe("rateLimit (sliding window)", () => {
  it("allows hits under the limit and rejects once the limit is reached", () => {
    const t = 1_000_000;
    const now = () => t;
    const key = "test:allows";

    for (let i = 0; i < 3; i++) {
      expect(rateLimit(key, 3, 60_000, now).ok).toBe(true);
    }
    const denied = rateLimit(key, 3, 60_000, now);
    expect(denied.ok).toBe(false);
    expect(denied.retryAfterMs).toBeGreaterThan(0);
    expect(denied.retryAfterMs).toBeLessThanOrEqual(60_000);
  });

  it("frees a slot once the window slides past the oldest hit", () => {
    let t = 0;
    const now = () => t;
    const key = "test:slide";

    expect(rateLimit(key, 1, 100, now).ok).toBe(true);
    expect(rateLimit(key, 1, 100, now).ok).toBe(false);

    t = 101;
    expect(rateLimit(key, 1, 100, now).ok).toBe(true);
  });

  it("tracks keys independently", () => {
    const now = () => 0;
    expect(rateLimit("a", 1, 1_000, now).ok).toBe(true);
    expect(rateLimit("a", 1, 1_000, now).ok).toBe(false);
    expect(rateLimit("b", 1, 1_000, now).ok).toBe(true);
  });

  it("reset clears a single key", () => {
    const now = () => 0;
    expect(rateLimit("c", 1, 1_000, now).ok).toBe(true);
    expect(rateLimit("c", 1, 1_000, now).ok).toBe(false);
    resetRateLimits("c");
    expect(rateLimit("c", 1, 1_000, now).ok).toBe(true);
  });
});

describe("clientIp", () => {
  it("uses the first x-forwarded-for hop", () => {
    const req = new Request("http://x", {
      headers: { "x-forwarded-for": "10.0.0.1, 1.2.3.4" },
    });
    expect(clientIp(req)).toBe("10.0.0.1");
  });

  it("falls back to x-real-ip then local", () => {
    expect(clientIp(new Request("http://x", { headers: { "x-real-ip": "9.9.9.9" } }))).toBe(
      "9.9.9.9",
    );
    expect(clientIp(new Request("http://x"))).toBe("local");
  });
});

describe("tooManyRequests", () => {
  it("returns 429 with a Retry-After header in whole seconds", () => {
    const res = tooManyRequests(1_500);
    expect(res.status).toBe(429);
    expect(res.headers.get("retry-after")).toBe("2");
    expect(res.headers.get("content-type")).toContain("application/json");
  });

  it("never returns a Retry-After below 1 second", () => {
    expect(tooManyRequests(1).headers.get("retry-after")).toBe("1");
  });
});

describe("AUTH_RATE_LIMITS", () => {
  it("keeps the documented policy shape", () => {
    expect(AUTH_RATE_LIMITS.signup.limit).toBe(5);
    expect(AUTH_RATE_LIMITS.login.limit).toBe(10);
    expect(AUTH_RATE_LIMITS.passwordChange.limit).toBe(10);
    expect(AUTH_RATE_LIMITS.login.windowMs).toBe(15 * 60 * 1000);
  });
});
