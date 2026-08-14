import { casualtyKindLabel } from "./matchSummary";

/**
 * Spanish labels for the live event timeline (LM-10, MV-7) plus the band→display
 * and SPP derivations (LM-18/LM-19). Pure functions — event payloads stay
 * structured server-side; only the client maps kind+payload to a human label
 * (`matchSummary.ts` precedent). The minimum taxonomy: start, turn, touchdown,
 * completion, casualty (with the coach-reported band), foul, mvp, end of half,
 * end of match. Unknown kinds pass through unchanged.
 */

export interface LiveEventLabelInput {
  kind: string;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
}

/** A casualty band mapped to its Design-A display bucket (LM-18). */
export interface BandDisplay {
  label: string;
  stars: number;
}

/**
 * Maps the 5 injury bands to the 2 Design-A display buckets (LM-18): a `bruise`
 * renders "Herida" (★0); every lasting band (`apaleado|grave|permanent|dead`)
 * renders "Baja" (★2). Unknown bands pass through with zero stars (never
 * throws, forward-compatible with new bands).
 */
export function bandToDisplay(band: string): BandDisplay {
  switch (band) {
    case "bruise":
      return { label: "Herida", stars: 0 };
    case "apaleado":
    case "grave":
    case "permanent":
    case "dead":
      return { label: "Baja", stars: 2 };
    default:
      return { label: band, stars: 0 };
  }
}

/** The SPP star total for an event (LM-19): TD ★3, Completion ★1, MVP ★4, a
 * lasting casualty ★2 (bruise ★0), and any other kind ★0. */
export function eventSpp(event: LiveEventLabelInput): number {
  switch (event.kind) {
    case "td":
      return 3;
    case "completion":
      return 1;
    case "casualty": {
      const band = typeof event.payload.band === "string" ? event.payload.band : null;
      return band ? bandToDisplay(band).stars : 0;
    }
    case "mvp":
      return 4;
    default:
      return 0;
  }
}

/** A label for a single live event; casualty payloads reuse the rulebook band. */
export function liveEventLabel(event: LiveEventLabelInput): string {
  switch (event.kind) {
    case "start":
      return "Inicio del partido";
    case "turn":
      return "Fin de turno";
    case "turnStart":
      return "Tu turno";
    case "requestTurn":
      return "Te piden el turno";
    case "td":
      return "Touchdown";
    case "completion":
      return "Pase completo";
    case "mvp":
      return "Jugador más valioso";
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
