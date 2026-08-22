import { describe, expect, it } from "vitest";
import { getLocalTeamStore } from "./localTeamStore";
import type { Team } from "../types";
import { DEFAULT_COACHING } from "../types";

const makeTeam = (id: string): Team => ({
  id,
  name: `Team ${id}`,
  raceId: "human",
  roster: [],
  coaching: { ...DEFAULT_COACHING },
  leagueId: null,
  treasury: 0,
});

describe("getLocalTeamStore", () => {
  it("returns a single shared in-memory instance across calls", () => {
    expect(getLocalTeamStore()).toBe(getLocalTeamStore());
  });

  it("starts empty and retains saved teams in memory (no persistence)", async () => {
    const store = getLocalTeamStore();
    expect(await store.list()).toEqual([]);

    await store.save(makeTeam("t1"));
    const teams = await store.list();
    expect(teams).toHaveLength(1);
    expect(teams[0].name).toBe("Team t1");
  });
});
