/**
 * Spanish labels for the live event timeline (LM-10, MV-7) plus the band→display
 * and SPP derivations (LM-18/LM-19). Pure functions — event payloads stay
 * structured server-side; only the client maps kind+payload to a human label.
 * The minimum taxonomy: start, turn, touchdown, completion, casualty (with the
 * Design-A band bucket), foul, mvp, end of half, end of match, plus the kickoff
 * kinds expensive_mistake/fan_factor (LM-24). Unknown kinds pass through unchanged.
 * `turn` and `turnStart` labels are AUDIT labels (LM-16): the feed never renders
 * the `turn` row, and the `turnStart` card overrides this label with the
 * team-specific "Turno {team}" text (RAU-36/37).
 */

import type { IconName } from "./icons";

export interface LiveEventLabelInput {
  kind: string;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
}

/**
 * The six casualty causes mapped to their display labels (MVT-5): `blitz` →
 * "Blitz", `foul` → "Falta", `dodge` → "Esquivando — se cayó", `crowd` → "El
 * público", `penetration` → "Penetración", `block` → "Bloqueo". Callers map an
 * unknown cause through the index so it never throws (bare value fallback).
 */
export const CAUSE_LABELS: Record<string, string> = {
  blitz: "Blitz",
  foul: "Falta",
  dodge: "Esquivando — se cayó",
  crowd: "El público",
  penetration: "Penetración",
  block: "Bloqueo",
};

/**
 * Design-A per-kind inline SVG icon name (rulebook-light, no icon library,
 * MV-7): the kind maps to a Material-Design-Icons-style path in `./icons`.
 * The casualty sub-buckets are resolved by `casualtyIcon` (grave for a death,
 * helmet for a lasting Baja, hospital for a bruise Herida) at the render site;
 * unknown kinds fall back to the football glyph (never throws).
 */
export const EVENT_GLYPH: Record<string, IconName> = {
  start: "timer",
  td: "football",
  completion: "hand",
  foul: "cleat",
  mvp: "trophy",
  endHalf: "timer",
  endMatch: "flag",
  expensive_mistake: "money-bag",
  fan_factor: "account-group",
  turnStart: "hand",
  people: "account-group",
};

/**
 * The casualty band → inline SVG icon trio (MVT-5/v7): a `dead` band renders
 * the grave, a `bruise` the hospital (Herida), and every other lasting band
 * (apaleado/grave/permanent) — plus unknown/missing — the helmet (Baja).
 */
export function casualtyIcon(payload: Record<string, unknown>): IconName {
  const band = typeof payload.band === "string" ? payload.band : null;
  if (band === "dead") return "grave";
  if (band === "bruise") return "hospital";
  return "helmet";
}

/**
 * The casualty band sub-line rendered under the label (v7): "¡Muerto!" for a
 * death, "Se pierde el próximo partido" for every lasting non-dead band, and
 * "Lesión molesta" for a bruise. Unknown/missing bands → null (no sub-line).
 */
export function bandSubLabel(payload: Record<string, unknown>): string | null {
  const band = typeof payload.band === "string" ? payload.band : null;
  switch (band) {
    case "dead":
      return "¡Muerto!";
    case "bruise":
      return "Lesión molesta";
    case "apaleado":
    case "grave":
    case "permanent":
      return "Se pierde el próximo partido";
    default:
      return null;
  }
}

/**
 * The kickoff expensive-mistake outcome → Spanish display label (LM-24):
 * "Crisis evitada" | "Incidente menor" | "Incidente grave" | "Catástrofe".
 * The card maps an outcome through the index so an unknown outcome never
 * throws (bare value fallback, forward-compatible).
 */
export const KICKOFF_OUTCOME_LABELS: Record<string, string> = {
  "crisis-evaded": "Crisis evitada",
  "minor-incident": "Incidente menor",
  "serious-incident": "Incidente grave",
  catastrophe: "Catástrofe",
};

/**
 * Formats a treasury value in the es-ES style: dot-thousands plus a literal
 * " M.O." (LM-24). Pure — callers decide whether a missing field renders the
 * line at all.
 */
export function formatTreasury(value: number): string {
  return `${new Intl.NumberFormat("es-ES").format(value)} M.O.`;
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
      // LM-18: the Design-A bucket label — a bruise renders "Herida", every
      // lasting band (apaleado|grave|permanent|dead) renders "Baja".
      const band = typeof event.payload.band === "string" ? event.payload.band : null;
      return band ? bandToDisplay(band).label : "Baja";
    }
    case "foul":
      return "Falta";
    case "expensive_mistake":
      return "Error costoso";
    case "fan_factor":
      return "Factor de aficionados";
    case "endHalf":
      return "Fin de la mitad";
    case "endMatch":
      return "Fin del partido";
    default:
      return event.kind;
  }
}
