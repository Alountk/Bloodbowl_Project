import { casualtyKindLabel } from "./matchSummary";

/**
 * Spanish labels for the live event timeline (LM-10, MV-7). A pure function —
 * event payloads stay structured server-side; only the client maps kind+payload
 * to a human label (`matchSummary.ts` precedent). The minimum taxonomy: start,
 * turn, touchdown, casualty (with the coach-reported band), foul, end of half,
 * end of match. Unknown kinds pass through unchanged.
 */

export interface LiveEventLabelInput {
  kind: string;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
}

/** A label for a single live event; casualty payloads reuse the rulebook band. */
export function liveEventLabel(event: LiveEventLabelInput): string {
  switch (event.kind) {
    case "start":
      return "Inicio del partido";
    case "turn":
      return "Fin de turno";
    case "td":
      return "Touchdown";
    case "casualty": {
      const band = typeof event.payload.band === "string" ? event.payload.band : null;
      return band ? `Baja · ${casualtyKindLabel(band)}` : "Baja";
    }
    case "foul":
      return "Falta";
    case "endHalf":
      return "Fin de la mitad";
    case "endMatch":
      return "Fin del partido";
    default:
      return event.kind;
  }
}
