import { describe, expect, it, vi, afterEach } from "vitest";
import type { ImproveBody } from "@/lib/progression";
import {
  fetchTeamProgression,
  improvePlayer,
  renamePlayer,
  hirePlayer,
  firePlayer,
  uploadTeamShield,
  removeTeamShield,
} from "./api";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("fetchTeamProgression", () => {
  it("maps the progression route payload to PlayerProgressionCore[] (array passthrough)", async () => {
    const rows = [
      {
        rosterPlayerId: "pl1",
        pe: 6,
        skills: ["block"],
        injuries: ["cabeza rota"],
        valueBonus: 10000,
        alive: true,
        improvements: 1,
      },
      {
        rosterPlayerId: "pl2",
        pe: 0,
        skills: [],
        injuries: [],
        valueBonus: 0,
        alive: true,
        improvements: 0,
      },
    ];
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(rows) }),
    );

    const result = await fetchTeamProgression("t1");
    expect(result).toEqual(rows);
    expect(fetch).toHaveBeenCalledWith("/api/teams/t1/progression");
  });

  it("throws with the server error message when the response is not ok", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Not found" }),
      }),
    );
    await expect(fetchTeamProgression("t1")).rejects.toThrow("Not found");
  });
});

describe("improvePlayer", () => {
  it("POSTs the improve body to the improve route and resolves the JSON payload", async () => {
    const response = { skill: "block", skillDisplay: "Placar", elite: true, peRemaining: 4, valueBonus: 20000 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(response) }),
    );

    const body: ImproveBody = { type: "primary", skillId: "block" };
    const result = await improvePlayer("t1", "pl1", body);
    expect(result).toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      "/api/teams/t1/players/pl1/improve",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
      }),
    );
  });

  it("throws with the server error message on a rejected spend", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Not enough PE" }),
      }),
    );
    await expect(
      improvePlayer("t1", "pl1", { type: "random-roll", category: "G" }),
    ).rejects.toThrow("Not enough PE");
  });
});

describe("renamePlayer", () => {
  it("PATCHes the name to the player route and resolves the updated name", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve({ name: "Aldric" }) }),
    );

    const result = await renamePlayer("t1", "pl1", "Aldric");
    expect(result).toEqual({ name: "Aldric" });
    expect(fetch).toHaveBeenCalledWith(
      "/api/teams/t1/players/pl1",
      expect.objectContaining({
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: "Aldric" }),
      }),
    );
  });

  it("throws with the server error message when the rename is rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Name must be between 1 and 50 characters" }),
      }),
    );
    await expect(renamePlayer("t1", "pl1", "")).rejects.toThrow(
      "Name must be between 1 and 50 characters",
    );
  });
});

describe("hirePlayer", () => {
  it("POSTs the positionalKey to the hire route and resolves roster + treasury", async () => {
    const response = {
      roster: [{ id: "p1", name: "Marty", positionalKey: "blitzer" }],
      treasury: 850_000,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(response) }),
    );

    const result = await hirePlayer("t1", "blitzer");
    expect(result).toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      "/api/teams/t1/players",
      expect.objectContaining({
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ positionalKey: "blitzer" }),
      }),
    );
  });

  it("throws the server error on an over-budget hire (409)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "Not enough treasury to hire this player" }),
      }),
    );
    await expect(hirePlayer("t1", "ogre")).rejects.toThrow(
      "Not enough treasury to hire this player",
    );
  });
});

describe("firePlayer", () => {
  it("DELETEs the player and resolves roster + treasury", async () => {
    const response = { roster: [], treasury: 115_000 };
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 200, json: () => Promise.resolve(response) }),
    );

    const result = await firePlayer("t1", "pl1");
    expect(result).toEqual(response);
    expect(fetch).toHaveBeenCalledWith(
      "/api/teams/t1/players/pl1",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("throws the server error when firing below the 11-player minimum", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 409,
        json: () => Promise.resolve({ error: "A team cannot drop below 11 players" }),
      }),
    );
    await expect(firePlayer("t1", "pl1")).rejects.toThrow(
      "A team cannot drop below 11 players",
    );
  });
});

describe("uploadTeamShield", () => {
  it("POSTs the image blob as the `shield` multipart field and resolves the issued emblem", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ emblem: "/uploads/shields/t1-a.webp" }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const blob = new File(["fake-webp"], "shield.png", { type: "image/png" });
    const result = await uploadTeamShield("t1", blob);

    expect(result).toEqual({ emblem: "/uploads/shields/t1-a.webp" });
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/teams/t1/shield");
    expect(init.method).toBe("POST");
    // Multipart bodies never set an explicit content-type: the browser derives
    // the boundary. The blob must ride the `shield` field (TS-1) with a webp
    // filename mirroring the avatar client.
    expect(init.headers).toBeUndefined();
    const body = init.body as FormData;
    const file = body.get("shield") as File;
    expect(file.name).toBe("shield.webp");
    expect(file.type).toBe("image/png");
  });

  it("throws the server error when the upload is rejected (oversize/wrong-kind/foreign)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: () => Promise.resolve({ error: "Invalid image" }),
      }),
    );
    await expect(uploadTeamShield("t1", new Blob(["x"]))).rejects.toThrow("Invalid image");
  });
});

describe("removeTeamShield", () => {
  it("DELETEs the shield route and resolves emblem null when the server returns 200", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ emblem: null }),
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await removeTeamShield("t1");

    expect(result).toEqual({ emblem: null });
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/teams/t1/shield",
      expect.objectContaining({ method: "DELETE" }),
    );
  });

  it("treats a 204 no-op removal (no shield stored) as success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({ ok: true, status: 204, json: () => Promise.reject(new Error("no body")) }),
    );

    const result = await removeTeamShield("t1");

    expect(result).toEqual({ emblem: null });
  });

  it("throws the server error on a denied removal (404 foreign team)", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: "Not found" }),
      }),
    );
    await expect(removeTeamShield("t1")).rejects.toThrow("Not found");
  });
});
