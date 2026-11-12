import type { LiveMatchEventDto, MatchDetail } from "./api";
import { getInducement } from "@/lib/rules/inducements";

/**
 * Pre-match derivations for the acta header (S1/S4): the weather roll, the
 * per-side fan factor rolls and the per-side inducement list. All of them are
 * READ from data that already exists (kickoff events + the live inducement
 * cart / result snapshot) — never invented; a missing input resolves to null
 * or an empty list and the header omits the line.
 */

export interface FanFactorLine {
  base: number;
  dice: number;
  total: number;
}

function numOf(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** The highest-seq event of one kind (feeds are re-ordered client-side). */
function latestOf(events: readonly LiveMatchEventDto[], kind: string): LiveMatchEventDto | null {
  let best: LiveMatchEventDto | null = null;
  for (const event of events) {
    if (event.kind !== kind) continue;
    if (best === null || event.seq > best.seq) best = event;
  }
  return best;
}

/**
 * The current weather (S4): the latest `weather` event in the feed wins (a
 * kickoff can change it), else the reported result weather. `roll` is the d6
 * that produced it when the event recorded one.
 */
export function latestWeather(
  events: readonly LiveMatchEventDto[],
  resultWeather: string | null,
): { value: string | null; roll: number | null } {
  const event = latestOf(events, "weather");
  if (event != null) {
    const value = typeof event.payload.value === "string" ? event.payload.value : null;
    const roll = numOf(event.payload.roll);
    if (value !== null || roll !== null) return { value: value ?? resultWeather, roll };
  }
  return { value: resultWeather, roll: null };
}

/** The latest `fan_factor` kickoff roll for one side, or null (never invented). */
export function fanFactorOf(
  events: readonly LiveMatchEventDto[],
  side: "home" | "away",
): FanFactorLine | null {
  const event = latestOf(events, "fan_factor");
  if (event == null) return null;
  const raw: unknown = event.payload[side];
  if (typeof raw !== "object" || raw === null) return null;
  const row = raw as Record<string, unknown>;
  const base = numOf(row.base);
  const dice = numOf(row.dice);
  const total = numOf(row.total);
  if (base === null || dice === null || total === null) return null;
  return { base, dice, total };
}

/**
 * The recorded inducements for one side: the live cart (ids mapped to catalog
 * display names) while the match runs, the persisted result snapshot cards
 * once reported, else empty.
 */
export function inducementsOf(
  detail: Pick<MatchDetail, "live" | "result">,
  side: "home" | "away",
): { name: string; count: number }[] {
  const cart = detail.live?.inducements?.[side];
  if (cart != null && cart.length > 0) {
    return cart.map((item) => ({
      name: getInducement(item.id)?.displayName ?? item.id,
      count: item.count,
    }));
  }
  return (
    detail.result?.scores[side].inducements?.cards.map((card) => ({
      name: card.name,
      count: card.count,
    })) ?? []
  );
}
