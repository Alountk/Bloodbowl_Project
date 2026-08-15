import { describe, expect, it } from "vitest";
import {
  deriveMinute,
  turnTag,
  deriveTeamStats,
  derivePartialScore,
  timelinePercent,
  playerRef,
  type FeedEvent,
  type FeedPlayers,
} from "./liveFeed";

/**
 * Pure display derivations for the Design-A feed (LM-17/LM-19, D22/D23):
 * minute, global turn tag, dorsal map, and per-team stats. Zero mocks — the
 * feed row renders straight from these.
 */

const ev = (
  kind: string,
  side: "home" | "away" | null,
  payload: Record<string, unknown> = {},
  half = 1,
  turnNumber = 1,
  seq?: number,
  at = 0,
): FeedEvent => ({ kind, side, payload, half, turnNumber, seq, at });

describe("deriveMinute — match minute from event at vs kickoff (LM-17)", () => {
  it("returns the floored minute since startedAt with a trailing apostrophe", () => {
    // startedAt 0, event at 199*60k ms = 199 minutes → "199'"
    expect(deriveMinute(199 * 60_000, 0)).toBe("199'");
    expect(deriveMinute(5 * 60_000, 0)).toBe("5'");
  });

  it("floors sub-minute elapsed and clamps before kickoff to 0'", () => {
    expect(deriveMinute(30_000, 0)).toBe("0'");
    expect(deriveMinute(1000, 5000)).toBe("0'"); // before start → clamped
  });

  it("handles a real kickoff offset (at and startedAt both absolute ms)", () => {
    const startedAt = Date.UTC(2026, 0, 1, 20, 0, 0);
    const at = Date.UTC(2026, 0, 1, 23, 19, 0); // +199 minutes
    expect(deriveMinute(at, startedAt)).toBe("199'");
  });
});

describe("turnTag — global turn number with half offset (LM-17)", () => {
  it("uses the raw turn number in half 1", () => {
    expect(turnTag(1, 1)).toBe("T1");
    expect(turnTag(1, 8)).toBe("T8");
  });

  it("adds 8 in half 2 (global turn continues from half 1's 8 turns)", () => {
    expect(turnTag(2, 1)).toBe("T9");
    expect(turnTag(2, 8)).toBe("T16");
  });
});

describe("playerRef — dorsal map = roster index + 1 (D21)", () => {
  it("assigns dorsal 1..n in roster order", () => {
    const players: FeedPlayers = [
      { rosterPlayerId: "a" },
      { rosterPlayerId: "b" },
      { rosterPlayerId: "c" },
    ];
    const map = playerRef(players);
    expect(map.get("a")).toBe(1);
    expect(map.get("b")).toBe(2);
    expect(map.get("c")).toBe(3);
  });

  it("returns an empty map for an empty roster", () => {
    expect(playerRef([]).size).toBe(0);
  });
});

describe("deriveTeamStats — per-team TD/completions/casualties/fouls/★ (LM-19, D22)", () => {
  it("derives 1td+1comp+1lastingcas+1foul → home 1/1/1/1/★6 (LM-19)", () => {
    const events = [
      ev("td", "home"),
      ev("completion", "home"),
      ev("casualty", "home", { band: "grave" }), // lasting → counts casualty + ★2
      ev("foul", "home"),
      ev("td", "away"), // unrelated away event: home stats must stay 1/1/1/1/★6
    ];
    const stats = deriveTeamStats(events);
    expect(stats.home).toEqual({ tds: 1, completions: 1, casualties: 1, fouls: 1, spp: 6 });
    expect(stats.away).toEqual({ tds: 1, completions: 0, casualties: 0, fouls: 0, spp: 3 });
  });

  it("a bruise casualty counts as a casualty but contributes ★0 (only lasting bands award SPP)", () => {
    const events = [ev("casualty", "home", { band: "bruise" })];
    const stats = deriveTeamStats(events);
    expect(stats.home).toEqual({ tds: 0, completions: 0, casualties: 1, fouls: 0, spp: 0 });
  });

  it("zeros every per-team stat when there are no display-worthy events", () => {
    expect(deriveTeamStats([]).home).toEqual({ tds: 0, completions: 0, casualties: 0, fouls: 0, spp: 0 });
    expect(deriveTeamStats([]).away).toEqual({ tds: 0, completions: 0, casualties: 0, fouls: 0, spp: 0 });
  });

  it("spp totals mvp (★4) and completion (★1) and never counts a null-side boundary", () => {
    const events = [
      ev("mvp", "away"),
      ev("mvp", "home"),
      ev("completion", "home"),
      ev("endHalf", null), // boundary rows have no side — ignored
      ev("endMatch", null),
    ];
    const stats = deriveTeamStats(events);
    expect(stats.home).toEqual({ tds: 0, completions: 1, casualties: 0, fouls: 0, spp: 1 + 4 });
    expect(stats.away).toEqual({ tds: 0, completions: 0, casualties: 0, fouls: 0, spp: 4 });
  });
});

describe("derivePartialScore — per-TD partial score by seq (MVT-1/D5)", () => {
  it("accumulates TDs per side in seq order so a home TD then an away TD yields (1-0) then (1-1)", () => {
    const events = [
      ev("start", null, {}, 1, 1, 1, 1000),
      ev("td", "home", {}, 1, 3, 5, 2000),
      ev("casualty", "away", { band: "grave" }, 2, 6, 9, 3000),
      ev("td", "away", {}, 2, 8, 11, 4000),
      ev("endMatch", null, {}, 2, 8, 12, 5000),
    ];
    const scores = derivePartialScore(events);
    expect(scores.get(5)).toEqual({ home: 1, away: 0 });
    expect(scores.get(11)).toEqual({ home: 1, away: 1 });
    // Non-TD events never appear in the partial-score map.
    expect(scores.has(1)).toBe(false);
    expect(scores.has(9)).toBe(false);
    expect(scores.has(12)).toBe(false);
  });

  it("ignores attempts without a seq and returns an empty map for no TDs", () => {
    const noSeq = [ev("td", "home", {})];
    expect(derivePartialScore(noSeq).size).toBe(0);
    expect(derivePartialScore([]).size).toBe(0);
    expect(derivePartialScore([ev("completion", "home", {}, 1, 1, 2, 100)]).size).toBe(0);
  });

  it("accumulates across repeated same-side TDs (home, home → (1-0) then (2-0))", () => {
    const events = [
      ev("td", "home", {}, 1, 3, 5, 2000),
      ev("td", "home", {}, 2, 1, 10, 3000),
    ];
    const scores = derivePartialScore(events);
    expect(scores.get(5)).toEqual({ home: 1, away: 0 });
    expect(scores.get(10)).toEqual({ home: 2, away: 0 });
  });
});

describe("timelinePercent — icon position as elapsed % (MVT-2/D4)", () => {
  it("positions a TD at minute 99 of a 199-minute match at exactly 50%", () => {
    expect(timelinePercent(99 * 60_000, 0, 199 * 60_000)).toBe(50);
  });

  it("clamps to 0 and 100 for events at/before the start or past the end", () => {
    expect(timelinePercent(0, 0, 100)).toBe(0);
    expect(timelinePercent(50, 100, 200)).toBe(0); // before start → clamped 0
    expect(timelinePercent(250, 100, 200)).toBe(100); // past end → clamped 100
  });

  it("rounds to the nearest whole percent and handles a degenerate zero-width window", () => {
    expect(timelinePercent(33 * 60_000, 0, 100 * 60_000)).toBe(33);
    expect(timelinePercent(1, 0, 3)).toBe(33);
    expect(timelinePercent(10, 10, 10)).toBe(0); // end === start → 0, no divide-by-zero
  });
});
