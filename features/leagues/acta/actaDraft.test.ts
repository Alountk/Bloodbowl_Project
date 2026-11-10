import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  actaDraftKey,
  clearActaDraft,
  collectActaInputs,
  collectClosureInputs,
  readActaDraft,
  restoreActaInputs,
  restoreClosureInputs,
  writeActaDraft,
  type ActaInputsDraft,
  type ActaDraftRosters,
} from "./actaDraft";
import {
  emptyActaState,
  type ActaActionLine,
  type ActaState,
  type ActaTeamDraft,
} from "./actaState";

/**
 * T6 · G1 — the acta draft layer (autosave): per-fixture localStorage drafts
 * that hold ONLY user-entered form input (never business state). The suite pins
 * the four degradation contracts: storage disabled (throws) → the form keeps
 * working in memory; corrupted JSON → discarded silently; unexpected/stale
 * shape → discarded or filtered so a vanished field never leaks into the form.
 *
 * Assertions use toEqual/textContent-style checks — this repo has no jest-dom.
 */

const homeRoster = [
  { id: "h1", name: "Khalid" },
  { id: "h2", name: "Ushtep" },
];
const awayRoster = [
  { id: "a1", name: "Grishnak" },
  { id: "a2", name: "Durburz" },
];
const rosters: ActaDraftRosters = { home: homeRoster, away: awayRoster };

function teamDraft(overrides: Partial<ActaTeamDraft> = {}): ActaTeamDraft {
  return {
    neverHeld: false,
    inducements: 0,
    score: 0,
    mvpGrantee: "",
    actions: [],
    fanRoll: null,
    injuryRoll: [],
    permanentRoll: [],
    ...overrides,
  };
}

function casualtyLine(
  id: string,
  rosterPlayerId: string,
  victimRosterPlayerId: string,
): ActaActionLine {
  return {
    id,
    rosterPlayerId,
    kind: "casualty",
    quantity: 1,
    victimTeam: "away",
    victimRosterPlayerId,
  };
}

beforeEach(() => {
  window.localStorage.clear();
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe("actaDraft · storage envelope", () => {
  it("keys drafts per fixture under the bb-acta-draft namespace, one per surface", () => {
    expect(actaDraftKey("acta", "fx1")).toBe("bb-acta-draft:acta:fx1");
    expect(actaDraftKey("cierre", "fx1")).toBe("bb-acta-draft:cierre:fx1");
  });

  it("round-trips a written draft", () => {
    const key = actaDraftKey("acta", "fx-round");
    const draft: ActaInputsDraft = {
      v: 1,
      form: "acta",
      mode: "load",
      duration: 90,
      home: { ff: 5, mvpGrantee: "h1" },
      away: { fanRoll: 2 },
      rolls: [
        { victimTeam: "away", victimRosterPlayerId: "a1", occurrence: 0, injuryRoll: 8 },
      ],
    };
    writeActaDraft(key, draft);
    expect(readActaDraft(key, "acta", "load")).toEqual(draft);
  });

  it("discards corrupted JSON silently and removes the key", () => {
    const key = actaDraftKey("acta", "fx-corrupt");
    window.localStorage.setItem(key, "{definitely not json");
    expect(readActaDraft(key, "acta", "load")).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("discards an unexpected envelope (wrong version / not an object)", () => {
    const key = actaDraftKey("acta", "fx-version");
    window.localStorage.setItem(key, JSON.stringify({ v: 99, form: "acta", rolls: [] }));
    expect(readActaDraft(key, "acta", "load")).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();

    window.localStorage.setItem(key, JSON.stringify("a string"));
    expect(readActaDraft(key, "acta", "load")).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("discards a draft written for another surface or wizard mode", () => {
    const key = actaDraftKey("acta", "fx-mismatch");
    writeActaDraft(key, { v: 1, form: "acta", mode: "load", rolls: [], home: { ff: 5 } });
    expect(readActaDraft(key, "cierre")).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();

    writeActaDraft(key, { v: 1, form: "acta", mode: "load", rolls: [], home: { ff: 5 } });
    expect(readActaDraft(key, "acta", "correct")).toBeNull();
    expect(window.localStorage.getItem(key)).toBeNull();
  });

  it("never throws when storage is disabled or denied", () => {
    const key = actaDraftKey("acta", "fx-throws");
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("quota");
    });
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("denied");
    });
    vi.spyOn(Storage.prototype, "removeItem").mockImplementation(() => {
      throw new Error("denied");
    });
    expect(() =>
      writeActaDraft(key, { v: 1, form: "acta", mode: "load", rolls: [], home: { ff: 5 } }),
    ).not.toThrow();
    expect(readActaDraft(key, "acta", "load")).toBeNull();
    expect(() => clearActaDraft(key)).not.toThrow();
  });

  it("writing a draft with no recorded input clears the key instead", () => {
    const key = actaDraftKey("acta", "fx-empty");
    writeActaDraft(key, { v: 1, form: "acta", mode: "load", rolls: [], home: { ff: 5 } });
    expect(window.localStorage.getItem(key)).toBeTruthy();
    writeActaDraft(key, { v: 1, form: "acta", mode: "load", rolls: [], away: {} });
    expect(window.localStorage.getItem(key)).toBeNull();
  });
});

describe("actaDraft · wizard inputs (collect + restore)", () => {
  it("records ONLY the fields the user changed — untouched seed values never enter the draft", () => {
    const seed: ActaState = {
      ...emptyActaState(),
      home: teamDraft({ score: 2, ff: 4 }),
    };
    const current: ActaState = {
      ...seed,
      duration: 90,
      home: teamDraft({ score: 2, ff: 5 }),
    };
    const draft = collectActaInputs(seed, current, "load");
    expect(draft.duration).toBe(90);
    expect(draft.home).toEqual({ ff: 5 });
  });

  it("restores changed inputs and drops invalid values back to the seed", () => {
    const seed: ActaState = { ...emptyActaState(), home: teamDraft({ ff: 4 }) };
    const draft: ActaInputsDraft = {
      v: 1,
      form: "acta",
      mode: "load",
      weather: "Tormenta",
      duration: -3,
      home: { ff: 99, fanRoll: 9, score: -1, neverHeld: true },
      away: {},
      rolls: [],
    };
    const restored = restoreActaInputs(draft, seed, rosters);
    // "Tormenta" is not a weather option, ff 99 is out of range, fanRoll 9 is
    // not a 1D6 and a negative score is impossible — all dropped as stale.
    expect(restored.weather).toBe("Perfecto");
    expect(restored.duration).toBeUndefined();
    expect(restored.home.ff).toBe(4);
    expect(restored.home.fanRoll).toBeNull();
    expect(restored.home.score).toBe(0);
    // A valid boolean edit IS restored (mixed case: drops + restores).
    expect(restored.home.neverHeld).toBe(true);
  });

  it("restores a valid MVP grantee but drops vanished players and journeymen", () => {
    const seed = emptyActaState();
    const draft: ActaInputsDraft = {
      v: 1,
      form: "acta",
      mode: "load",
      home: { mvpGrantee: "h1" },
      away: { mvpGrantee: "a9" },
      rolls: [],
    };
    expect(restoreActaInputs(draft, seed, rosters).home.mvpGrantee).toBe("h1");

    const stale = restoreActaInputs(draft, seed, rosters).away.mvpGrantee;
    expect(stale).toBe("");

    const journeyman = restoreActaInputs(
      { ...draft, away: { mvpGrantee: "journeyman-t2-1" } },
      seed,
      rosters,
    ).away.mvpGrantee;
    expect(journeyman).toBe("");
  });

  it("restores user-edited action lines but drops lines naming vanished players", () => {
    const seed = emptyActaState();
    const draft: ActaInputsDraft = {
      v: 1,
      form: "acta",
      mode: "load",
      home: {
        actions: [
          { id: "ok", rosterPlayerId: "h1", kind: "td", quantity: 2 },
          { id: "gone", rosterPlayerId: "h9", kind: "td", quantity: 1 },
          casualtyLine("vic-gone", "h1", "a9"),
        ],
      },
      away: {},
      rolls: [],
    };
    const restored = restoreActaInputs(draft, seed, rosters);
    expect(restored.home.actions).toEqual([
      { id: "ok", rosterPlayerId: "h1", kind: "td", quantity: 2 },
    ]);
  });

  it("keeps the seed actions when every drafted line is stale, but honors a deliberate clear", () => {
    const seed: ActaState = {
      ...emptyActaState(),
      home: teamDraft({
        actions: [{ id: "k", rosterPlayerId: "h1", kind: "td", quantity: 1 }],
      }),
    };
    // Every drafted line names a vanished player → nothing valid to restore →
    // the fresh (re-derived) lines must survive untouched.
    const staleOnly: ActaInputsDraft = {
      v: 1,
      form: "acta",
      mode: "load",
      home: { actions: [{ id: "g", rosterPlayerId: "h9", kind: "td", quantity: 4 }] },
      away: {},
      rolls: [],
    };
    expect(restoreActaInputs(staleOnly, seed, rosters).home.actions).toEqual(
      seed.home.actions,
    );

    // An explicit empty edit is real user input (the user deleted every line).
    const cleared: ActaInputsDraft = {
      v: 1,
      form: "acta",
      mode: "load",
      home: { actions: [] },
      away: {},
      rolls: [],
    };
    expect(restoreActaInputs(cleared, seed, rosters).home.actions).toEqual([]);
  });

  it("a roll edit follows its victim and a roll for a vanished victim never leaks", () => {
    // Seed: two casualty lines caused by home against a1 and a2 (a1 rolled 5).
    const seed: ActaState = {
      ...emptyActaState(),
      home: teamDraft({
        actions: [casualtyLine("c1", "h1", "a1"), casualtyLine("c2", "h2", "a2")],
        injuryRoll: [5, 9],
      }),
    };
    // The user re-rolls the a2 casualty to 12.
    const current: ActaState = {
      ...seed,
      home: teamDraft({
        actions: seed.home.actions,
        injuryRoll: [5, 12],
      }),
    };
    const draft = collectActaInputs(seed, current, "load");
    expect(draft.rolls).toEqual([
      { victimTeam: "away", victimRosterPlayerId: "a2", occurrence: 0, injuryRoll: 12 },
    ]);

    // Restore onto a FRESH derivation where the a2 casualty no longer exists:
    // the stale roll is dropped, the untouched 5 stays derived.
    const fresh: ActaState = {
      ...emptyActaState(),
      home: teamDraft({
        actions: [casualtyLine("c1", "h1", "a1")],
        injuryRoll: [7],
      }),
    };
    const restored = restoreActaInputs(draft, fresh, rosters);
    expect(restored.home.injuryRoll).toEqual([7]);

    // Restore onto an unchanged derivation: the edit lands on the a2 victim.
    const sameFresh: ActaState = {
      ...emptyActaState(),
      home: teamDraft({
        actions: [casualtyLine("c1", "h1", "a1"), casualtyLine("c2", "h2", "a2")],
        injuryRoll: [5, 9],
      }),
    };
    expect(restoreActaInputs(draft, sameFresh, rosters).home.injuryRoll).toEqual([5, 12]);
  });

  it("a wizard roll edit overrides a seeded (derived) roll — every wizard field is asked", () => {
    const seed: ActaState = {
      ...emptyActaState(),
      home: teamDraft({
        actions: [casualtyLine("c1", "h1", "a1")],
        injuryRoll: [4],
      }),
    };
    const draft: ActaInputsDraft = {
      v: 1,
      form: "acta",
      mode: "load",
      home: {},
      away: {},
      rolls: [
        { victimTeam: "away", victimRosterPlayerId: "a1", occurrence: 0, injuryRoll: 12 },
      ],
    };
    expect(restoreActaInputs(draft, seed, rosters).home.injuryRoll).toEqual([12]);
  });
});

describe("actaDraft · closure inputs (asked-only)", () => {
  function closureSeeds(): {
    seed: ActaState;
    captured: ActaState;
  } {
    const seed: ActaState = {
      ...emptyActaState(),
      home: teamDraft({ score: 2 }),
      away: teamDraft({ score: 1 }),
    };
    return { seed, captured: seed };
  }

  it("collects only the ASKED inputs — derived acta parts never enter the draft", () => {
    const { seed } = closureSeeds();
    const current: ActaState = {
      weather: "Ventisca",
      duration: 45,
      home: teamDraft({
        score: 99,
        neverHeld: true,
        inducements: 7,
        ff: 6,
        fanRoll: 3,
        mvpGrantee: "h1",
      }),
      away: teamDraft({ score: 1 }),
    };
    const draft = collectClosureInputs(seed, current);
    expect(draft.weather).toBeUndefined();
    expect(draft.duration).toBeUndefined();
    expect(draft.home).toEqual({ ff: 6, fanRoll: 3, mvpGrantee: "h1" });
    expect(draft.away).toBeUndefined();
    expect(draft.rolls).toEqual([]);
  });

  it("restores rolls only into still-ASKED (unset) slots — a captured roll is never overridden", () => {
    // Drafted while the casualty was pending: the user answered 8.
    const draft: ActaInputsDraft = {
      v: 1,
      form: "cierre",
      home: { ff: 6, fanRoll: 3, mvpGrantee: "h1" },
      away: { ff: 4 },
      rolls: [
        { victimTeam: "away", victimRosterPlayerId: "a1", occurrence: 0, injuryRoll: 8, permanentRoll: 5 },
      ],
    };
    const base: ActaState = {
      ...emptyActaState(),
      home: teamDraft({
        score: 2,
        actions: [casualtyLine("c1", "h1", "a1")],
      }),
    };
    // The fresh derivation captured the 1D16 meanwhile (13 = Permanente).
    const withCaptured: ActaState = {
      ...base,
      home: teamDraft({
        score: 2,
        actions: base.home.actions,
        injuryRoll: [13],
      }),
    };
    const restored = restoreClosureInputs(draft, withCaptured, rosters);
    expect(restored.home.injuryRoll).toEqual([13]);
    // The 1D6 is still ASKED (unset) → the drafted one restores.
    expect(restored.home.permanentRoll).toEqual([5]);
    // Asked scalars restore.
    expect(restored.home.ff).toBe(6);
    expect(restored.home.fanRoll).toBe(3);
    expect(restored.home.mvpGrantee).toBe("h1");
    expect(restored.away.ff).toBe(4);
  });

  it("drops stale draft values for fields that no longer exist (vanished victim, vanished MVP, junk fields)", () => {
    const draft = {
      v: 1,
      form: "cierre",
      home: { score: 99, neverHeld: true, actions: [], mvpGrantee: "h9", ff: 99 },
      away: { score: 99 },
      rolls: [
        { victimTeam: "away", victimRosterPlayerId: "a9", occurrence: 0, injuryRoll: 8 },
      ],
    } as unknown as ActaInputsDraft;
    const seed: ActaState = {
      ...emptyActaState(),
      home: teamDraft({ score: 2, actions: [casualtyLine("c1", "h1", "a1")] }),
    };
    const restored = restoreClosureInputs(draft, seed, rosters);
    // Derived score/neverHeld/actions are re-derived, never draft-fed.
    expect(restored.home.score).toBe(2);
    expect(restored.home.actions).toEqual(seed.home.actions);
    // The vanished victim's roll and the vanished MVP grantee never leak.
    expect(restored.home.injuryRoll).toEqual([]);
    expect(restored.home.mvpGrantee).toBe("");
    expect(restored.home.ff).toBeUndefined();
  });
});
