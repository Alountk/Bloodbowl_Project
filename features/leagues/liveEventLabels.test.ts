import { describe, expect, it } from "vitest";
import { liveEventLabel, type LiveEventLabelInput } from "./liveEventLabels";

/**
 * Spanish labels for the live event timeline (LM-10, MV-7 copy). Pure fn — the
 * payloads stay structured server-side; only the client renders labels
 * (`matchSummary.ts` precedent).
 */

const ev = (kind: string, payload: Record<string, unknown> = {}): LiveEventLabelInput => ({
  kind,
  half: 1,
  turnNumber: 1,
  payload,
});

describe("liveEventLabel", () => {
  it("labels a match start", () => {
    expect(liveEventLabel(ev("start"))).toBe("Inicio del partido");
  });

  it("labels a turn change", () => {
    expect(liveEventLabel(ev("turn"))).toBe("Fin de turno");
  });

  it("labels a touchdown", () => {
    expect(liveEventLabel(ev("td"))).toBe("Touchdown");
  });

  it("labels a casualty and reuses the rulebook band label from its payload band", () => {
    expect(liveEventLabel(ev("casualty", { band: "grave" }))).toContain("Herida grave");
    expect(liveEventLabel(ev("casualty", { band: "permanent" }))).toContain("Permanente");
    expect(liveEventLabel(ev("casualty", { band: "dead" }))).toContain("Muerto");
  });

  it("falls back to a generic label when the casualty payload has no band", () => {
    expect(liveEventLabel(ev("casualty"))).toContain("Baja");
  });

  it("labels a foul", () => {
    expect(liveEventLabel(ev("foul"))).toBe("Falta");
  });

  it("labels the end of a half and the end of the match", () => {
    expect(liveEventLabel(ev("endHalf"))).toBe("Fin de la mitad");
    expect(liveEventLabel(ev("endMatch"))).toBe("Fin del partido");
  });

  it("passes through an unknown event kind unchanged", () => {
    expect(liveEventLabel(ev("interception"))).toBe("interception");
  });
});
