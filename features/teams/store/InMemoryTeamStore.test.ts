import { describe, expect, it, beforeEach, vi } from "vitest";
import { InMemoryTeamStore } from "./InMemoryTeamStore";
import type { Team } from "../types";
import { DEFAULT_COACHING } from "../types";

const makeTeam = (id: string, name = `Team ${id}`): Team => ({
  id,
  name,
  raceId: "human",
  roster: [],
  coaching: { ...DEFAULT_COACHING },
  leagueId: null,
  treasury: 0,
});

describe("InMemoryTeamStore", () => {
  let store: InMemoryTeamStore;

  beforeEach(() => {
    store = new InMemoryTeamStore();
  });

  it("list() returns an empty array when no teams are seeded", async () => {
    expect(await store.list()).toEqual([]);
  });

  it("list() returns seeded teams in insertion order", async () => {
    const teams = [makeTeam("a"), makeTeam("b")];
    store = new InMemoryTeamStore(teams);
    expect(await store.list()).toEqual(teams);
  });

  it("save() appends a new team and list() returns it", async () => {
    const team = makeTeam("1");
    const saved = await store.save(team);
    expect(saved).toEqual(team);
    expect(await store.list()).toEqual([team]);
  });

  it("normalizes a team saved without coaching/leagueId", async () => {
    const team = (
      {
        id: "legacy-1",
        name: "Legacy Team",
        raceId: "human",
        roster: [],
      } as Partial<Team>
    ) as Team;
    const saved = await store.save(team);
    expect(saved.coaching).toEqual(DEFAULT_COACHING);
    expect(saved.leagueId).toBeNull();
    expect(saved.treasury).toBe(0);
    const listed = await store.list();
    expect(listed).toEqual([
      { ...team, coaching: DEFAULT_COACHING, leagueId: null, treasury: 0 },
    ]);
  });

  it("normalizes legacy seeded teams on construction", async () => {
    const legacy = ({ id: "seed-1", name: "Seed", raceId: "orc", roster: [] } as Partial<Team>) as Team;
    store = new InMemoryTeamStore([legacy]);
    const listed = await store.list();
    expect(listed).toEqual([
      { ...legacy, coaching: { ...DEFAULT_COACHING }, leagueId: null, treasury: 0 },
    ]);
  });

  it("save() upserts an existing team by id", async () => {
    const team = makeTeam("1", "Original");
    await store.save(team);
    const updated = { ...team, name: "Updated" };
    await store.save(updated);
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].name).toBe("Updated");
  });

  it("save() preserves insertion order for existing entries on upsert", async () => {
    await store.save(makeTeam("a"));
    await store.save(makeTeam("b"));
    await store.save(makeTeam("c"));
    await store.save({ ...makeTeam("b"), name: "B Updated" });
    const ids = (await store.list()).map((t) => t.id);
    expect(ids).toEqual(["a", "b", "c"]);
  });

  it("remove() deletes a team by id", async () => {
    await store.save(makeTeam("1"));
    await store.save(makeTeam("2"));
    await store.remove("1");
    const list = await store.list();
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe("2");
  });

  it("remove() is idempotent (no error on unknown id)", async () => {
    await expect(store.remove("nonexistent")).resolves.toBeUndefined();
  });

  it("does NOT touch localStorage", async () => {
    const spy = vi.spyOn(window, "localStorage", "get");
    await store.save(makeTeam("x"));
    await store.list();
    await store.remove("x");
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
