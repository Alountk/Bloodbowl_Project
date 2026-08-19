import { describe, expect, it, vi } from "vitest";
import { LocalStorageTeamStore } from "./LocalStorageTeamStore";
import type { Team } from "../types";
import { DEFAULT_COACHING } from "../types";

const STORAGE_KEY = "bb_teams_v1";

const makeTeam = (id: string, name = `Team ${id}`): Team => ({
  id,
  name,
  raceId: "human",
  roster: [],
  coaching: { ...DEFAULT_COACHING },
  leagueId: null,
  treasury: 0,
});

/** Returns a minimal localStorage stub without touching real jsdom localStorage. */
function makeStorageStub(initial?: string | null) {
  let stored: string | null = initial ?? null;
  return {
    getItem: vi.fn(() => stored),
    setItem: vi.fn((_k: string, value: string) => {
      stored = value;
    }),
    removeItem: vi.fn(),
    get _stored() {
      return stored;
    },
  };
}

describe("LocalStorageTeamStore", () => {
  it("list() returns an empty array when storage is empty", async () => {
    const stub = makeStorageStub(null);
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    expect(await store.list()).toEqual([]);
  });

  it("list() returns parsed teams from storage", async () => {
    const teams = [makeTeam("1"), makeTeam("2")];
    const stub = makeStorageStub(JSON.stringify(teams));
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    expect(await store.list()).toEqual(teams);
  });

  it("list() backfills defaults for legacy teams missing coaching/leagueId", async () => {
    const legacy = [{ id: "legacy-1", name: "Legacy Team", raceId: "human", roster: [] }];
    const stub = makeStorageStub(JSON.stringify(legacy));
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    const listed = await store.list();
    expect(listed).toEqual([
      {
        ...legacy[0],
        coaching: { ...DEFAULT_COACHING },
        leagueId: null,
        treasury: 0,
      },
    ]);
  });

  it("save() reads normalized teams so upserts keep defaults", async () => {
    const legacy = [{ id: "a", name: "Legacy", raceId: "human", roster: [] }];
    const stub = makeStorageStub(JSON.stringify(legacy));
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    await store.save({ ...makeTeam("a"), name: "Updated" });
    const parsed = JSON.parse(stub._stored!) as Team[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Updated");
    expect(parsed[0].coaching).toEqual(DEFAULT_COACHING);
    expect(parsed[0].leagueId).toBeNull();
  });

  it("list() returns [] and does NOT throw on corrupt JSON", async () => {
    const stub = makeStorageStub("not-valid-json{{");
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    await expect(store.list()).resolves.toEqual([]);
  });

  it("save() writes the team to storage", async () => {
    const stub = makeStorageStub();
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    const team = makeTeam("a");
    const saved = await store.save(team);
    expect(saved).toEqual(team);
    expect(stub.setItem).toHaveBeenCalledWith(STORAGE_KEY, JSON.stringify([team]));
  });

  it("save() upserts an existing team by id", async () => {
    const team = makeTeam("a", "Original");
    const stub = makeStorageStub(JSON.stringify([team]));
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    await store.save({ ...team, name: "Updated" });
    const parsed = JSON.parse(stub._stored!) as Team[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].name).toBe("Updated");
  });

  it("remove() removes the team from storage", async () => {
    const teams = [makeTeam("a"), makeTeam("b")];
    const stub = makeStorageStub(JSON.stringify(teams));
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    await store.remove("a");
    const parsed = JSON.parse(stub._stored!) as Team[];
    expect(parsed).toHaveLength(1);
    expect(parsed[0].id).toBe("b");
  });

  it("remove() is idempotent (no throw when id is absent)", async () => {
    const stub = makeStorageStub(null);
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    await expect(store.remove("nonexistent")).resolves.toBeUndefined();
  });

  it("save() on QuotaExceededError warns and does NOT throw", async () => {
    const stub = makeStorageStub();
    stub.setItem.mockImplementation(() => {
      const err = new DOMException("QuotaExceededError", "QuotaExceededError");
      throw err;
    });
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const store = new LocalStorageTeamStore(stub as unknown as Storage);
    await expect(store.save(makeTeam("x"))).resolves.toEqual(makeTeam("x"));
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining("QuotaExceededError"),
      expect.anything(),
    );
    warnSpy.mockRestore();
  });

  it("does NOT access localStorage at construction time", () => {
    const stub = makeStorageStub();
    new LocalStorageTeamStore(stub as unknown as Storage);
    expect(stub.getItem).not.toHaveBeenCalled();
    expect(stub.setItem).not.toHaveBeenCalled();
  });
});
