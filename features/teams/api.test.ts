import { describe, expect, it, vi, afterEach } from "vitest";
import type { ImproveBody } from "@/lib/progression";
import { fetchTeamProgression, improvePlayer, renamePlayer } from "./api";

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
