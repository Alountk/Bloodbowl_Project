import { describe, expect, it } from "vitest";
import { buildInducementSnapshot } from "./liveStore";

/**
 * LM-30/S3: unit tests for the shared close-time inducement snapshot builder
 * `buildInducementSnapshot(row, homeTeam, awayTeam)` — the ONE helper the three
 * close paths (result POST, `resolveLiveMatch`, `runWizardClose`) call so they
 * persist the IDENTICAL `scores.home|away.inducements` shape (parity by
 * construction, IND-4/IND-2). Given the persisted per-side cart (id+count) and
 * the two team rows it produces per-side `{ budget, cards: [{name, count}] }`
 * with ES display names RESOLVED from the catalog at close time (snapshot
 * standalone). Only the side that actually carries a non-empty cart gets a
 * snapshot; an absent/empty/malformed cart yields null on both sides.
 */

const coaching = {
  rerolls: 0,
  dedicatedFans: 1,
  assistantCoaches: 0,
  cheerleaders: 0,
  apothecary: false,
};

/** A team row shaped like the store/route loads: raceId + roster PlayerEntry[]
 * + coaching JSON + players (value bonuses). Empty roster keeps the TV math
 * equal to the value-bonus sum only (deterministic in these tests). */
function teamRow(raceId: string, valueBonus: number) {
  return {
    raceId,
    roster: [],
    coaching,
    players: valueBonus > 0 ? [{ valueBonus }] : [],
  };
}

const rowOf = (inducements: unknown) => ({ inducements: inducements as never });

describe("buildInducementSnapshot (LM-30/S3)", () => {
  it("produces the lower-TV side's {budget, cards} with ES names resolved from the catalog", () => {
    // Home carries +150k value bonus → home TV 150k, away TV 0 → away is the
    // lower side with a 150k budget. Away's cart: 1× bribes + 1× team-mascot
    // (100k + 25k ≤ 150k — a realistic purchase).
    const snap = buildInducementSnapshot(
      rowOf({
        home: [],
        away: [
          { id: "bribes", count: 1 },
          { id: "team-mascot", count: 1 },
        ],
      }),
      teamRow("human", 150_000),
      teamRow("human", 0),
    );
    expect(snap.home).toBeNull();
    expect(snap.away).toEqual({
      budget: 150_000,
      cards: [
        { name: "Sobornos", count: 1 },
        { name: "Mascota del Equipo", count: 1 },
      ],
    });
  });

  it("resolves to the HOME side when the away team is the richer one", () => {
    const snap = buildInducementSnapshot(
      rowOf({
        home: [{ id: "wizard", count: 1 }],
        away: [],
      }),
      teamRow("human", 0),
      teamRow("human", 150_000),
    );
    expect(snap.away).toBeNull();
    expect(snap.home).toEqual({
      budget: 150_000,
      cards: [{ name: "Mago", count: 1 }],
    });
  });

  it("returns null for both sides when no cart is persisted (absent)", () => {
    expect(buildInducementSnapshot(rowOf(null), teamRow("human", 150_000), teamRow("human", 0))).toEqual({
      home: null,
      away: null,
    });
  });

  it("returns null for both sides when both cart lists are empty (cleared)", () => {
    expect(
      buildInducementSnapshot(
        rowOf({ home: [], away: [] }),
        teamRow("human", 150_000),
        teamRow("human", 0),
      ),
    ).toEqual({ home: null, away: null });
  });

  it("handles a cart on a zero-budget side defensively: budget 0, names still resolved", () => {
    // Equal TVs (both 0) → no eligible side → the (foreign/legacy) cart side
    // snapshots with budget 0 instead of crashing.
    const snap = buildInducementSnapshot(
      rowOf({ home: [{ id: "biased-referee", count: 1 }], away: [] }),
      teamRow("human", 0),
      teamRow("human", 0),
    );
    expect(snap.home).toEqual({
      budget: 0,
      cards: [{ name: "Árbitro Sobornado", count: 1 }],
    });
    expect(snap.away).toBeNull();
  });

  it("falls back gracefully for an unknown race (value-bonus-only TV) and an unknown cart id (raw id as name)", () => {
    const snap = buildInducementSnapshot(
      rowOf({ home: [], away: [{ id: "ghost-inducement", count: 2 }] }),
      teamRow("mystery-race", 100_000),
      teamRow("mystery-race", 0),
    );
    expect(snap.away).toEqual({
      budget: 100_000,
      cards: [{ name: "ghost-inducement", count: 2 }],
    });
  });

  it("returns null for a malformed persisted cart (never crashes)", () => {
    expect(
      buildInducementSnapshot(rowOf("not-an-object"), teamRow("human", 150_000), teamRow("human", 0)),
    ).toEqual({ home: null, away: null });
    expect(
      buildInducementSnapshot(rowOf({ home: "bad", away: [] }), teamRow("human", 150_000), teamRow("human", 0)),
    ).toEqual({ home: null, away: null });
  });
});
