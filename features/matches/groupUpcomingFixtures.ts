import type { UpcomingFixture } from "./selectUpcomingFixtures";

/** A date bucket produced by `groupUpcomingFixtures`. */
export type FixtureBucket =
  | { group: "today"; fixtures: UpcomingFixture[] }
  | { group: "date"; dayLabel: string; fixtures: UpcomingFixture[] }
  | { group: null; fixtures: UpcomingFixture[] };

const leadingZero = (n: number) => String(n).padStart(2, "0");

/** Localized day label (es DD/MM/YYYY) used for a future-date group heading. */
export function formatDayLabel(iso: string): string {
  const d = new Date(iso);
  return `${leadingZero(d.getDate())}/${leadingZero(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/** Calendar-date key (yyyy-mm-dd in local time) used to bucket fixtures. */
function dayKey(date: Date): string {
  return `${date.getFullYear()}-${leadingZero(date.getMonth() + 1)}-${leadingZero(date.getDate())}`;
}

/**
 * Partitions already-sorted upcoming fixtures (Design B) into ordered buckets:
 * today (group `"today"`), one per distinct future date (`group "date"` with a
 * `dayLabel`), and the undated tail (`group null`). "Today" is the local
 * calendar date of `now`. Intra-bucket order is preserved (the selector already
 * sorted by date then round). Buckets with no fixtures are never emitted.
 */
export function groupUpcomingFixtures(
  fixtures: readonly UpcomingFixture[],
  now: Date,
): FixtureBucket[] {
  const todayKey = dayKey(now);

  const buckets: FixtureBucket[] = [];
  const byKey = new Map<string, FixtureBucket>();

  for (const fixture of fixtures) {
    if (!fixture.scheduledAt) {
      const undated = buckets.find((b) => b.group === null);
      if (undated) {
        undated.fixtures.push(fixture);
      } else {
        buckets.push({ group: null, fixtures: [fixture] });
      }
      continue;
    }

    const key = dayKey(new Date(fixture.scheduledAt));
    let bucket = byKey.get(key);
    if (!bucket) {
      if (key === todayKey) {
        bucket = { group: "today", fixtures: [] };
      } else {
        bucket = { group: "date", dayLabel: formatDayLabel(fixture.scheduledAt), fixtures: [] };
      }
      byKey.set(key, bucket);
      buckets.push(bucket);
    }
    bucket.fixtures.push(fixture);
  }

  return buckets;
}
