import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";

const getSessionMock = vi.hoisted(() => vi.fn());
const navigateMock = vi.hoisted(() => vi.fn());

vi.mock("next-auth/react", () => ({
  getSession: getSessionMock,
}));

vi.mock("@/lib/navigation", () => ({
  hardNavigate: navigateMock,
}));

const fetchMock = vi.hoisted(() => vi.fn());
vi.stubGlobal("fetch", fetchMock);

import { logout } from "./logout";

describe("logout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    fetchMock.mockResolvedValue(new Response(null, { status: 204 }));
  });

  afterEach(() => vi.useRealTimers());

  it("drains the in-flight session reads before the clear that sticks", async () => {
    getSessionMock.mockResolvedValue(null);

    const done = logout();

    // The first clear is immediate...
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();

    // ...then it waits, because Auth.js re-sets the session cookie on every
    // session read and a read sent before the clear can still write after it.
    await vi.advanceTimersByTimeAsync(399);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    await done;

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock).toHaveBeenCalledWith("/api/logout", { credentials: "same-origin" });
    // A private check: it must not ping other tabs into re-reading.
    expect(getSessionMock).toHaveBeenCalledWith({ broadcast: false });
    // A FULL document load: a client-side push would be served from the Router
    // Cache with the signed-in payload.
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("clears again when a late write re-issued the session", async () => {
    getSessionMock
      .mockResolvedValueOnce({ user: { id: "u1" } })
      .mockResolvedValue(null);

    const done = logout();
    await vi.advanceTimersByTimeAsync(5000);
    await done;

    // clear, verify (still signed in), drain, clear, verify (clean) -> 3 clears.
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(getSessionMock).toHaveBeenCalledTimes(2);
    expect(navigateMock).toHaveBeenCalledWith("/");
  });

  it("gives up after a bounded number of attempts and still leaves", async () => {
    getSessionMock.mockResolvedValue({ user: { id: "u1" } });

    const done = logout();
    await vi.advanceTimersByTimeAsync(10000);
    await done;

    // Bounded so a session that never settles cannot hang the logout; the user
    // still reaches the landing (no worse than not trying).
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(navigateMock).toHaveBeenCalledWith("/");
  });
});
