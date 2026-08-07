/** Formats a cost as the rulebook does: thousands grouped by non-breaking spaces, e.g. 50000 -> "50 000". */
export function formatRulebookCost(value: number): string {
  return value.toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}
