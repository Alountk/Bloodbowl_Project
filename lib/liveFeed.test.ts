import { describe, expect, it } from "vitest";
import {
  deriveMinute,
  turnTag,
  deriveTeamStats,
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
): FeedEvent => ({ kind, side, payload, half, turnNumber });

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
