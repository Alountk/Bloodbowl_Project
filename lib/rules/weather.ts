/**
 * BB2025 weather — user-validated (bb2025-rules R6, rulebook 2D6):
 *   2 Calor asfixiante · 3 Muy soleado (−1 Pase) · 4-10 Perfecto ·
 *   11 Lluvioso (−1 atrapar/recoger/interceptar) · 12 Ventisca.
 * Full effects are encoded as structured modifiers so route code applies them
 * without duplicating the table.
 */

export type WeatherKind = "heat" | "sunny" | "perfect" | "rain" | "blizzard";

export type PassRangeRestriction = "none" | "quick-short";

export interface WeatherEffect {
  kind: WeatherKind;
  label: string;
  /** appModifier on Pass checks (Muy soleado: -1). */
  passModifier: number;
  /** Modifier on attempts to catch/pick up/intercept a pass (Lluvioso: -1). */
  catchModifier: number;
  /** Extra modifier on forced-march attempts (Ventisca: -1). */
  forcedMarchModifier: number;
  /** When true, only Quick or Short passes may be attempted (Ventisca). */
  passRangeRestriction: PassRangeRestriction;
  /** When true, 1D3 fielded players per drive move to Reserves (Calor). */
  heatFieldedPlayers: boolean;
}

export const WEATHER_KINDS: readonly WeatherKind[] = [
  "heat",
  "sunny",
  "perfect",
  "rain",
  "blizzard",
];

/** Encourages the integer interval to read as `4-10`. */
const WEATHER_PERFECT_MIN = 4;
const WEATHER_PERFECT_MAX = 10;

export function weatherFromRoll(roll2d6: number): WeatherEffect {
  if (roll2d6 === 2) {
    return {
      kind: "heat",
      label: "Calor asfixiante",
      passModifier: 0,
      catchModifier: 0,
      forcedMarchModifier: 0,
      passRangeRestriction: "none",
      heatFieldedPlayers: true,
    };
  }
  if (roll2d6 === 3) {
    return {
      kind: "sunny",
      label: "Muy soleado",
      passModifier: -1,
      catchModifier: 0,
      forcedMarchModifier: 0,
      passRangeRestriction: "none",
      heatFieldedPlayers: false,
    };
  }
  if (roll2d6 >= WEATHER_PERFECT_MIN && roll2d6 <= WEATHER_PERFECT_MAX) {
    return {
      kind: "perfect",
      label: "Perfecto",
      passModifier: 0,
      catchModifier: 0,
      forcedMarchModifier: 0,
      passRangeRestriction: "none",
      heatFieldedPlayers: false,
    };
  }
  if (roll2d6 === 11) {
    return {
      kind: "rain",
      label: "Lluvioso",
      passModifier: 0,
      catchModifier: -1,
      forcedMarchModifier: 0,
      passRangeRestriction: "none",
      heatFieldedPlayers: false,
    };
  }
  // roll2d6 === 12
  return {
    kind: "blizzard",
    label: "Ventisca",
    passModifier: 0,
    catchModifier: 0,
    forcedMarchModifier: -1,
    passRangeRestriction: "quick-short",
    heatFieldedPlayers: false,
  };
}
