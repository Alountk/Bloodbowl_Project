import type { PlayerAttribute } from "@/lib/rules/improvements";

/** A positional base characteristic value (MA/ST numeric, AG/PA/AV "X+" targets). */
export type BaseAttributeValue = number | string;

function parseTarget(value: BaseAttributeValue): number | null {
  const n = typeof value === "number" ? value : parseInt(value as string, 10);
  return Number.isNaN(n) ? null : n;
}

/**
 * Renders an attribute value after `increases` increments. MA/ST and AV targets
 * rise with an increase (6→7, 8+→9+); AG/PA targets drop (3+→2+). An
 * unincrementable base ("—") passes through unchanged.
 */
export function applyAttributeIncreases(
  attribute: PlayerAttribute,
  base: BaseAttributeValue,
  increases: number,
): string {
  if (increases <= 0) return String(base);
  const baseNum = parseTarget(base);
  if (baseNum === null) return String(base);
  if (attribute === "ma" || attribute === "st") return String(baseNum + increases);
  const delta = attribute === "ag" || attribute === "pa" ? -increases : increases;
  return `${baseNum + delta}+`;
}

/** True when `display` is an improvement over `base` (ma/st/av rise, ag/pa drop). */
export function isAttributeBetter(
  attribute: PlayerAttribute,
  base: BaseAttributeValue,
  display: string,
): boolean {
  const baseNum = parseTarget(base);
  const displayNum = parseTarget(display);
  if (baseNum === null || displayNum === null) return false;
  if (attribute === "ag" || attribute === "pa") return displayNum < baseNum;
  return displayNum > baseNum;
}
