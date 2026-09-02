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

import { DEFAULT_LOCALE, t as translate } from "@/lib/i18n/dictionaries";
import type { IconName } from "./icons";

/** The translator shape used by the label functions (es default fallback). */
export type TFunc = (key: string, params?: Record<string, string | number>) => string;

/** The es-default translator used when a caller passes no `t` (test/audit). */
const esT: TFunc = (key, params) => translate(DEFAULT_LOCALE, key, params);

export interface LiveEventLabelInput {
  kind: string;
  half: number;
  turnNumber: number;
  payload: Record<string, unknown>;
}

/**
 * Resolves a cause code to its display label. `t` carries the active locale;
 * unknown causes fall back to the Spanish map index (never throws). The
 * `match.cause.*` keys mirror the `CAUSE_LABELS` es map byte-for-byte.
 */
export function causeLabel(cause: string, fn: TFunc = esT): string {
  const key = `match.cause.${cause}`;
  const translated = fn(key);
  return translated === key ? CAUSE_LABELS[cause] ?? cause : translated;
}

/**
 * Resolves a kickoff expensive-mistake outcome code to its display label. `t`
 * carries the active locale; unknown outcomes fall back to the Spanish map
 * index (never throws). Mirrors `KICKOFF_OUTCOME_LABELS`.
 */
export function outcomeLabel(outcome: string, fn: TFunc = esT): string {
  const key = `match.outcome.${outcome}`;
  const translated = fn(key);
  return translated === key ? KICKOFF_OUTCOME_LABELS[outcome] ?? outcome : translated;
}

/**
 * The five casualty causes mapped to their display labels (MVT-5): `blitz` →
 * "Blitz", `foul` → "Falta", `dodge` → "Esquivando — se cayó", `crowd` → "El
 * público", `block` → "Bloqueo". `penetration` was folded into `blitz` (RAU-41).
 * Callers map an unknown cause through the index so it never throws (bare value
 * fallback).
 */
export const CAUSE_LABELS: Record<string, string> = {
  blitz: "Blitz",
  foul: "Falta",
  dodge: "Esquivando — se cayó",
  crowd: "El público",
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
  concede: "flag-variant",
  expensive_mistake: "money-bag",
  fan_factor: "account-group",
  turnStart: "hand",
  people: "account-group",
  journeyman: "shirt",
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
 * LM-12/D1: reads the additive `bothDown` marker off a casualty payload. The
 * non-active coach's both-down record (the fallen blocker's card) carries
 * `bothDown: true`; a plain block defender record carries NO marker. Pure and
 * strict: only a literal `true` counts — absent, `false` or a stray/type
 * mismatch all read false (the server bound-checks the marker, D1).
 */
export function isBothDownCasualty(payload: Record<string, unknown>): boolean {
  return payload.bothDown === true;
}

/**
 * b5: the localized "(Ambos derribados)" marker copy for a both-down casualty.
 * Returns null for a casualty that is NOT both-down (the marker only renders on
 * the non-active coach's own block record — D1). Falls back to the Spanish copy
 * when the active locale lacks `match.event.bothDown` (slice c wires the EN key).
 */
export function bothDownMarkerLabel(payload: Record<string, unknown>, fn: TFunc = esT): string | null {
  if (!isBothDownCasualty(payload)) return null;
  const key = "match.event.bothDown";
  const translated = fn(key);
  return translated === key ? "Ambos derribados" : translated;
}

/**
 * The casualty band sub-line rendered under the label (v7): "¡Muerto!" for a
 * death, "Se pierde el próximo partido" for every lasting non-dead band, and
 * "Lesión molesta" for a bruise. Unknown/missing bands → null (no sub-line).
 */
export function bandSubLabel(payload: Record<string, unknown>, fn: TFunc = esT): string | null {
  const band = typeof payload.band === "string" ? payload.band : null;
  switch (band) {
    case "dead":
      return fn("match.band.dead");
    case "bruise":
      return fn("match.band.bruise");
    case "apaleado":
    case "grave":
    case "permanent":
      return fn("match.band.lasting");
    default:
      return null;
  }
}

/**
 * RAU-39: the rulebook Spanish label for an injury band (1D16 table), used by
 * the feed's roll sub-lines ("Tirada 1D16: 13 · Permanente"). Mirrors the
 * result-summary `casualtyKindLabel` mapping; unknown bands pass through.
 */
export function casualtyBandLabel(band: string, fn: TFunc = esT): string {
  switch (band) {
    case "bruise":
      return fn("match.casualty.bruise");
    case "apaleado":
      return fn("match.casualty.apaleado");
    case "grave":
      return fn("match.casualty.grave");
    case "permanent":
      return fn("match.casualty.permanent");
    case "dead":
      return fn("match.casualty.dead");
    default:
      return band;
  }
}

/**
 * RAU-39: the roll sub-line for the INJURY card — "Tirada 1D16: {roll16}" (the
 * band is already conveyed by the label + band sub-line). Missing/non-numeric
 * rolls → null (legacy payloads keep the bare card, never throw).
 */
export function casualtyRollLine(payload: Record<string, unknown>, fn: TFunc = esT): string | null {
  const roll16 = payload.roll16;
  if (typeof roll16 !== "number") return null;
  return fn("match.roll16", { roll: roll16 });
}

/**
 * RAU-39: the sub-line for the DERIVED ACTION card on the CAUSER's side —
 * "{causer} hace una herida a {victim}" (the causer earns the SPP; the roll and
 * band belong to the INJURY card on the victim's side). Either name missing →
 * null (the bare cause label renders, never throws).
 */
export function casualtyActionLine(
  payload: Record<string, unknown>,
  causerName: string,
  victimName: string,
  fn: TFunc = esT,
): string | null {
  if (!causerName || !victimName) return null;
  return fn("match.casualty.doesInjury", { causer: causerName, victim: victimName });
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
export function formatTreasury(value: number, fn: TFunc = esT): string {
  return `${new Intl.NumberFormat("es-ES").format(value)}${fn("match.treasuryUnit")}`;
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
export function bandToDisplay(band: string, fn: TFunc = esT): BandDisplay {
  switch (band) {
    case "bruise":
      return { label: fn("match.event.casualty.bruise"), stars: 0 };
    case "apaleado":
    case "grave":
    case "permanent":
    case "dead":
      return { label: fn("match.event.casualty.lasting"), stars: 2 };
    default:
      return { label: band, stars: 0 };
  }
}

/**
 * RAU-13: the journeyman join line for the timeline card — "{name} se une como
 * novato" (one novato) or "{name} se unen como novatos" (several), where
 * {name} is the per-side names list joined. A payload without a non-empty
 * `names` array → null (defensive — the card then falls back to the kind label).
 */
export function journeymanJoinLabel(
  payload: Record<string, unknown>,
  fn: TFunc = esT,
): string | null {
  const names = payload.names;
  if (!Array.isArray(names) || names.length === 0 || typeof names[0] !== "string") return null;
  const name = names.join(", ");
  const key = names.length === 1 ? "match.event.journeymanJoin" : "match.event.journeymanJoinMany";
  return fn(key, { name });
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
export function liveEventLabel(event: LiveEventLabelInput, fn: TFunc = esT): string {
  switch (event.kind) {
    case "start":
      return fn("match.event.start");
    case "turn":
      return fn("match.event.turn");
    case "turnStart":
      return fn("match.event.turnStart");
    case "requestTurn":
      return fn("match.event.requestTurn");
    case "td":
      return fn("match.event.td");
    case "completion":
      return fn("match.event.completion");
    case "mvp":
      return fn("match.event.mvp");
    case "casualty": {
      // LM-18: the Design-A bucket label — a bruise renders "Herida", every
      // lasting band (apaleado|grave|permanent|dead) renders "Baja".
      const band = typeof event.payload.band === "string" ? event.payload.band : null;
      return band ? bandToDisplay(band, fn).label : fn("match.event.casualty.lasting");
    }
    case "foul":
      return fn("match.event.foul");
    case "expensive_mistake":
      return fn("match.event.expensiveMistake");
    case "fan_factor":
      return fn("match.event.fanFactor");
    case "endHalf":
      return fn("match.event.endHalf");
    case "endMatch":
      return fn("match.event.endMatch");
    case "concede":
      return fn("match.event.concede");
    case "journeyman":
      return fn("match.event.journeyman");
    default:
      return event.kind;
  }
}
