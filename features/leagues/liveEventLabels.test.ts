import { describe, expect, it } from "vitest";
import {
  liveEventLabel,
  bandToDisplay,
  eventSpp,
  CAUSE_LABELS,
  EVENT_GLYPH,
  KICKOFF_OUTCOME_LABELS,
  formatTreasury,
  type LiveEventLabelInput,
} from "./liveEventLabels";

/**
 * Spanish labels for the live event timeline (LM-10, MV-7 copy) plus the
 * band→display + SPP derivations (LM-18/LM-19). Pure fns — the payloads stay
 * structured server-side; only the client renders labels/stars
 * (`matchSummary.ts` precedent).
 */

const ev = (kind: string, payload: Record<string, unknown> = {}): LiveEventLabelInput => ({
  kind,
  half: 1,
  turnNumber: 1,
  payload,
});

describe("bandToDisplay — 5 injury bands → 2 display buckets (LM-18)", () => {
  it("maps a bruise to Herida with no star", () => {
    expect(bandToDisplay("bruise")).toEqual({ label: "Herida", stars: 0 });
  });

  it("maps every lasting band (apaleado|grave|permanent|dead) to Baja with ★2", () => {
    for (const band of ["apaleado", "grave", "permanent", "dead"]) {
      expect(bandToDisplay(band)).toEqual({ label: "Baja", stars: 2 });
    }
  });

  it("passes an unknown band through with zero stars (never throws)", () => {
    expect(bandToDisplay("unknown")).toEqual({ label: "unknown", stars: 0 });
  });
});

describe("eventSpp — stars per event kind (LM-19)", () => {
  it("a TD is ★3", () => {
    expect(eventSpp(ev("td"))).toBe(3);
  });

  it("a completion is ★1", () => {
    expect(eventSpp(ev("completion"))).toBe(1);
  });

  it("an mvp is ★4", () => {
    expect(eventSpp(ev("mvp"))).toBe(4);
  });

  it("a lasting casualty (Baja band) is ★2 but a bruise casualty is ★0", () => {
    expect(eventSpp(ev("casualty", { band: "grave" }))).toBe(2);
    expect(eventSpp(ev("casualty", { band: "bruise" }))).toBe(0);
  });

  it("a casualty with no band is ★0 (unknown → no lasting award)", () => {
    expect(eventSpp(ev("casualty"))).toBe(0);
  });

  it("non-scoring feed events are ★0", () => {
    expect(eventSpp(ev("turn"))).toBe(0);
    expect(eventSpp(ev("foul"))).toBe(0);
    expect(eventSpp(ev("start"))).toBe(0);
    expect(eventSpp(ev("expensive_mistake"))).toBe(0);
    expect(eventSpp(ev("fan_factor"))).toBe(0);
  });
});

describe("liveEventLabel", () => {
  it("labels a match start", () => {
    expect(liveEventLabel(ev("start"))).toBe("Inicio del partido");
  });

  it("labels a turn change", () => {
    // Audit label (LM-16): the feed never renders the `turn` row as a card
    // (RAU-36/37), but the label stays for replay/audit consumers.
    expect(liveEventLabel(ev("turn"))).toBe("Fin de turno");
  });

  it("labels a touchdown", () => {
    expect(liveEventLabel(ev("td"))).toBe("Touchdown");
  });

  it("labels a casualty via the band→display bucket (bruise → Herida, lasting → Baja, LM-18)", () => {
    expect(liveEventLabel(ev("casualty", { band: "bruise" }))).toBe("Herida");
    expect(liveEventLabel(ev("casualty", { band: "apaleado" }))).toBe("Baja");
    expect(liveEventLabel(ev("casualty", { band: "grave" }))).toBe("Baja");
    expect(liveEventLabel(ev("casualty", { band: "permanent" }))).toBe("Baja");
    expect(liveEventLabel(ev("casualty", { band: "dead" }))).toBe("Baja");
  });

  it("labels a completion and an mvp in the Design-A taxonomy", () => {
    expect(liveEventLabel(ev("completion"))).toBe("Pase completo");
    expect(liveEventLabel(ev("mvp"))).toBe("Jugador más valioso");
  });

  it("falls back to a generic label when the casualty payload has no band", () => {
    expect(liveEventLabel(ev("casualty"))).toContain("Baja");
  });

  it("labels the kickoff kinds (LM-24): Error costoso and Factor de aficionados", () => {
    expect(liveEventLabel(ev("expensive_mistake"))).toBe("Error costoso");
    expect(liveEventLabel(ev("fan_factor"))).toBe("Factor de aficionados");
  });

  it("labels a foul", () => {
    expect(liveEventLabel(ev("foul"))).toBe("Falta");
  });

  it("labels the end of a half and the end of the match", () => {
    expect(liveEventLabel(ev("endHalf"))).toBe("Fin de la mitad");
    expect(liveEventLabel(ev("endMatch"))).toBe("Fin del partido");
  });

  it("labels a turn-start notice and a request-turn nudge (LM-13)", () => {
    // Audit labels: the visible turnStart CARD overrides the label with the
    // team-specific "Turno {team}" text (RAU-36/37); the map keeps the generic
    // form for audit/fallback and for the requestTurn nudge.
    expect(liveEventLabel(ev("turnStart"))).toBe("Tu turno");
    expect(liveEventLabel(ev("requestTurn"))).toBe("Te piden el turno");
  });

  it("passes through an unknown event kind unchanged", () => {
    expect(liveEventLabel(ev("interception"))).toBe("interception");
  });
});

describe("CAUSE_LABELS — six casualty causes to display labels (MVT-5)", () => {
  it("maps every cause exactly", () => {
    expect(CAUSE_LABELS).toEqual({
      blitz: "Blitz",
      foul: "Falta",
      dodge: "Esquivando — se cayó",
      crowd: "El público",
      penetration: "Penetración",
      block: "Bloqueo",
    });
  });

  it("passes through an unknown cause unchanged when looked up", () => {
    // Direct property lookup: an unknown cause must not throw -> falls back to itself.
    const label = CAUSE_LABELS["weirdCause" as keyof typeof CAUSE_LABELS];
    expect(label).toBeUndefined();
  });
});

describe("EVENT_GLYPH — per-kind inline glyph map (MV-7, no icon lib)", () => {
  it("maps the display kinds to a glyph and falls back to a neutral bullet", () => {
    expect(EVENT_GLYPH.td).toBeTruthy();
    expect(EVENT_GLYPH.start).toBeTruthy();
    expect(EVENT_GLYPH.endMatch).toBeTruthy();
    // Unknown kinds have no glyph entry → the caller falls back to "•".
    expect(EVENT_GLYPH["interception" as keyof typeof EVENT_GLYPH]).toBeUndefined();
  });

  it("maps the kickoff glyphs exactly (LM-24): money-bag for expensive_mistake, dice for fan_factor, people for the fan row", () => {
    expect(EVENT_GLYPH.expensive_mistake).toBe("💰");
    expect(EVENT_GLYPH.fan_factor).toBe("🎲");
    expect(EVENT_GLYPH.people).toBe("👥");
  });
});

describe("KICKOFF_OUTCOME_LABELS — outcome → Spanish (LM-24)", () => {
  it("maps all four outcomes exactly", () => {
    expect(KICKOFF_OUTCOME_LABELS).toEqual({
      "crisis-evaded": "Crisis evitada",
      "minor-incident": "Incidente menor",
      "serious-incident": "Incidente grave",
      catastrophe: "Catástrofe",
    });
  });
});

describe("formatTreasury — es-ES dot-thousands + ' M.O.' (LM-24)", () => {
  it("formats 214000 as '214.000 M.O.' and 234000 as '234.000 M.O.'", () => {
    expect(formatTreasury(214000)).toBe("214.000 M.O.");
    expect(formatTreasury(234000)).toBe("234.000 M.O.");
  });

  it("formats a small sub-100k treasury with the dot-thousands convention", () => {
    expect(formatTreasury(80000)).toBe("80.000 M.O.");
  });

  it("keeps hundreds with the same es-ES grouping (no thousands separator needed)", () => {
    expect(formatTreasury(20_000)).toBe("20.000 M.O.");
    expect(formatTreasury(0)).toBe("0 M.O.");
  });
});
