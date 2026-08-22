import { describe, expect, it } from "vitest";
import type { UpcomingFixture } from "./selectUpcomingFixtures";
import { groupUpcomingFixtures } from "./groupUpcomingFixtures";

/**
 * Pure date grouping (Design B): partitions upcoming fixtures into ordered
 * date buckets — today's fixtures, one bucket per distinct future date (in
 * ascending order), and a final "undated" bucket for fixtures with no
 * `scheduledAt`. The component maps each bucket: `{ group: 'today' }` →
 * "Hoy", `{ group: 'date', date }` → the formatted date, `{ group: null }` →
 * "Sin programar". Buckets with a `date` carry the localized `dayLabel` so the
 * production code (and the component) never re-derive i18n-unaware comparisons.
 */

function fixture(overrides: Partial<UpcomingFixture> & { id: string }): UpcomingFixture {
  return {
    leagueId: "l1",
    leagueName: "Liga",
    round: 1,
    homeTeamId: "h",
    awayTeamId: "a",
    homeTeamName: "Home",
    awayTeamName: "Away",
    createdAt: "2026-02-01",
    scheduledAt: null,
    winnerId: null,
    homeScore: null,
    awayScore: null,
    status: "pending",
    homeOwner: { id: "u", name: "Me" },
    awayOwner: { id: "o", name: "Other" },
    proposals: [],
    live: null,
    ...overrides,
  };
}

/** Fixes "now" so date-edge tests are deterministic. */
const NOW = new Date("2026-08-22T12:00:00Z");

describe("groupUpcomingFixtures", () => {
  it("puts today's fixtures first in the today bucket", () => {
    const today = "2026-08-22T09:00:00Z";
    const sections = groupUpcomingFixtures([fixture({ id: "f", scheduledAt: today })], NOW);
    expect(sections).toHaveLength(1);
    expect(sections[0].fixtures.map((f) => f.id)).toEqual(["f"]);
    expect(sections[0]).toMatchObject({ group: "today" });
  });

  it("groups future fixtures by distinct date following the sorted input order", () => {
    // Input is pre-sorted by the selector (date asc, undated last): grouping is
    // order-preserving, so buckets come back in the same relative order.
    const later = "2026-08-25T09:00:00Z";
    const earlier = "2026-08-23T09:00:00Z";
    const sections = groupUpcomingFixtures(
      [fixture({ id: "f-earlier", scheduledAt: earlier }), fixture({ id: "f-later", scheduledAt: later })],
      NOW,
    );
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.group)).toEqual(["date", "date"]);
    const first = sections[0];
    const second = sections[1];
    if (first.group !== "date" || second.group !== "date") throw new Error("expected date buckets");
    expect(first.dayLabel).toBe("23/08/2026");
    expect(first.fixtures.map((f) => f.id)).toEqual(["f-earlier"]);
    expect(second.dayLabel).toBe("25/08/2026");
  });

  it("collects undated fixtures into a final undated bucket after dated ones", () => {
    // Selector-sorted input: dated before undated.
    const tomorrow = "2026-08-23T09:00:00Z";
    const sections = groupUpcomingFixtures(
      [fixture({ id: "f-dated", scheduledAt: tomorrow }), fixture({ id: "f-undated", scheduledAt: null })],
      NOW,
    );
    expect(sections).toHaveLength(2);
    expect(sections.map((s) => s.group)).toEqual(["date", null]);
    expect(sections[0].fixtures.map((f) => f.id)).toEqual(["f-dated"]);
    expect(sections[1].fixtures.map((f) => f.id)).toEqual(["f-undated"]);
  });

  it("preserves the selector's intra-bucket order (date asc, round asc) within a same-day bucket", () => {
    const sameDay = "2026-08-23T09:00:00Z";
    const laterDay = "2026-08-24T12:00:00Z";
    // Pre-sorted: f-r3 (round 2) before f-r1 (round 3) on the same day.
    const sections = groupUpcomingFixtures(
      [
        fixture({ id: "f-r3", scheduledAt: sameDay, round: 2 }),
        fixture({ id: "f-r1", scheduledAt: sameDay, round: 3 }),
        fixture({ id: "f-r2", scheduledAt: laterDay, round: 5 }),
      ],
      NOW,
    );
    const undated = sections.find((s) => s.group === null);
    expect(undated).toBeUndefined();
    expect(sections).toHaveLength(2);
    // The same-day bucket preserves the selector's round ordering.
    expect(sections[0].fixtures.map((f) => f.id)).toEqual(["f-r3", "f-r1"]);
    expect(sections[1].fixtures.map((f) => f.id)).toEqual(["f-r2"]);
  });
});
