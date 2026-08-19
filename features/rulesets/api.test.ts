import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createRuleset,
  formatGold,
  formatTvCap,
  listRulesets,
  updateRuleset,
} from "./api";

const stubFetch = (res: Partial<Response>) => {
  const fetchMock = vi.fn(() =>
    Promise.resolve({
      ok: true,
      status: 200,
      json: () => Promise.resolve({}),
      ...res,
    } as Response),
  );
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
};

afterEach(() => vi.unstubAllGlobals());

describe("rulesets client api", () => {
  it("lists rulesets from the developer endpoint", async () => {
    const fetchMock = stubFetch({
      json: () => Promise.resolve([{ id: "r1", name: "Estándar BB2025", races: ["human"] }]),
    });
    const list = await listRulesets();
    expect(list).toHaveLength(1);
    expect(fetchMock).toHaveBeenCalledWith("/api/dev/rulesets");
  });

  it("creates a ruleset via POST with the draft payload", async () => {
    const fetchMock = stubFetch({
      status: 201,
      json: () => Promise.resolve({ id: "r2", name: "Liga Tier 1" }),
    });
    const draft = {
      name: "Liga Tier 1",
      description: null,
      races: ["human", "orc"],
      startingTreasury: 1000000,
      tvCap: null,
      minPlayers: 11,
      maxPlayers: 16,
      hireFire: "between-jornadas" as const,
      seasonReform: true,
      mercenaries: false,
      active: true,
    };
    const saved = await createRuleset(draft);
    expect(saved.name).toBe("Liga Tier 1");
    expect(fetchMock).toHaveBeenCalledWith("/api/dev/rulesets", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(draft),
    });
  });

  it("updates a ruleset via PATCH with a partial payload", async () => {
    const fetchMock = stubFetch({ json: () => Promise.resolve({ id: "r1", active: false }) });
    await updateRuleset("r1", { active: false });
    expect(fetchMock).toHaveBeenCalledWith("/api/dev/rulesets/r1", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ active: false }),
    });
  });

  it("throws a statused error when the list request fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve({ error: "Forbidden" }),
        } as Response),
      ),
    );
    await expect(listRulesets()).rejects.toMatchObject({ status: 403 });
  });
});

describe("ruleset chip formatters", () => {
  it("formats gold in the short M style", () => {
    expect(formatGold(1000000)).toBe("1M");
    expect(formatGold(1100000)).toBe("1,1M");
    expect(formatGold(1150000)).toBe("1,15M");
    expect(formatGold(50000)).toBe("50.000");
  });

  it("formats the TV cap with ∞ for no cap", () => {
    expect(formatTvCap(null)).toBe("∞");
    expect(formatTvCap(1150000)).toBe("1,15M");
  });
});
