import { describe, expect, it } from "vitest";
import {
  liveEventLabel,
  bandToDisplay,
  eventSpp,
  CAUSE_LABELS,
  EVENT_GLYPH,
  KICKOFF_OUTCOME_LABELS,
  formatTreasury,
  casualtyIcon,
  bandSubLabel,
  journeymanJoinLabel,
  isBothDownCasualty,
  bothDownMarkerLabel,
  knockdownLabel,
  eventCategoryTab,
  teamShortName,
  whoLineLabel,
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

  it("the LM-13 scored actions follow the bb2025-rules PE table: interception ★2, throw-team-mate ★1, landed-safe ★1", () => {
    expect(eventSpp(ev("interception"))).toBe(2);
    expect(eventSpp(ev("throwTeamMate"))).toBe(1);
    expect(eventSpp(ev("landedSafe"))).toBe(1);
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

  it("T20 (L70): a casualty carrying only the 1D16 roll derives its SPP from the rulebook table — the demo payloads never carry the server `band`", () => {
    // WHY new (T20, intentional): `eventSpp` keyed casualty stars on
    // `payload.band` alone, but the demo's simulated server records only the
    // roll (`roll16`) and the band is derived from it — the same rulebook
    // table the row text already uses. A row that EARNED SPP must show it.
    expect(eventSpp(ev("casualty", { roll16: 9 }))).toBe(2); // 9-10 → apaleado (lasting)
    expect(eventSpp(ev("casualty", { roll16: 12 }))).toBe(2); // 11-12 → grave (lasting)
    expect(eventSpp(ev("casualty", { roll16: 3 }))).toBe(0); // 1-8 → bruise (★0)
    // The server-derived band still WINS when present (production payloads
    // and every shipped pin stay byte-identical).
    expect(eventSpp(ev("casualty", { roll16: 3, band: "grave" }))).toBe(2);
    expect(eventSpp(ev("casualty", { roll16: 9, band: "bruise" }))).toBe(0);
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

  it("labels a concede event (RAU-38)", () => {
    expect(liveEventLabel(ev("concede"))).toBe("Concesión");
  });

  it("labels a journeyman join (RAU-13)", () => {
    expect(liveEventLabel(ev("journeyman", { count: 1, names: ["Aldric Martillo"] }))).toBe("Novato");
  });

  it("labels a turn-start notice and a request-turn nudge (LM-13)", () => {
    // Audit labels: the visible turnStart CARD overrides the label with the
    // team-specific "Turno {team}" text (RAU-36/37); the map keeps the generic
    // form for audit/fallback and for the requestTurn nudge.
    expect(liveEventLabel(ev("turnStart"))).toBe("Tu turno");
    expect(liveEventLabel(ev("requestTurn"))).toBe("Te piden el turno");
  });

  it("labels the LM-13 acta-vocabulary scored actions (Slice E) in the acta's own words", () => {
    expect(liveEventLabel(ev("interception"))).toBe("Intercepción");
    expect(liveEventLabel(ev("throwTeamMate"))).toBe("Lanzar compañero");
    expect(liveEventLabel(ev("landedSafe"))).toBe("Aterrizar sano");
  });

  it("passes through an unknown event kind unchanged", () => {
    expect(liveEventLabel(ev("someFutureKind"))).toBe("someFutureKind");
  });
});

describe("CAUSE_LABELS — five casualty causes to display labels (MVT-5)", () => {
  it("maps every cause exactly", () => {
    expect(CAUSE_LABELS).toEqual({
      blitz: "Blitz",
      foul: "Falta",
      dodge: "Esquivando — se cayó",
      crowd: "El público",
      block: "Bloqueo",
    });
  });

  it("passes through an unknown cause unchanged when looked up", () => {
    // Direct property lookup: an unknown cause must not throw -> falls back to itself.
    const label = CAUSE_LABELS["weirdCause" as keyof typeof CAUSE_LABELS];
    expect(label).toBeUndefined();
  });
});

describe("EVENT_GLYPH — per-kind inline SVG icon map (MV-7, no icon lib)", () => {
  it("maps the display kinds to an icon name and falls back to the football glyph", () => {
    expect(EVENT_GLYPH.td).toBe("football");
    expect(EVENT_GLYPH.start).toBe("timer");
    expect(EVENT_GLYPH.endMatch).toBe("flag");
    expect(EVENT_GLYPH.completion).toBe("hand");
    expect(EVENT_GLYPH.foul).toBe("cleat");
    expect(EVENT_GLYPH.mvp).toBe("trophy");
    // RAU-38: the concede (white-flag surrender) row uses the flag-variant glyph.
    expect(EVENT_GLYPH.concede).toBe("flag-variant");
    // The LM-13 acta vocabulary (Slice E) maps to existing set glyphs.
    expect(EVENT_GLYPH.interception).toBe("hand");
    expect(EVENT_GLYPH.throwTeamMate).toBe("shirt");
    expect(EVENT_GLYPH.landedSafe).toBe("check");
    // Unknown kinds have no glyph entry → the caller falls back to "football".
    expect(EVENT_GLYPH["someFutureKind" as keyof typeof EVENT_GLYPH]).toBeUndefined();
  });

  it("maps the kickoff icons exactly (v7): money-bag for expensive_mistake, account-group for the fan row", () => {
    expect(EVENT_GLYPH.expensive_mistake).toBe("money-bag");
    expect(EVENT_GLYPH.fan_factor).toBe("account-group");
    expect(EVENT_GLYPH.people).toBe("account-group");
  });

  it("maps a journeyman join to the shirt glyph (RAU-13)", () => {
    expect(EVENT_GLYPH.journeyman).toBe("shirt");
  });
});

describe("journeymanJoinLabel — the '{name} se une como novato' join line (RAU-13)", () => {
  it("renders the singular join line for one novato", () => {
    expect(journeymanJoinLabel({ count: 1, names: ["Aldric Martillo"] })).toBe(
      "Aldric Martillo se une como novato",
    );
  });

  it("renders the plural join line for several novatos (names joined)", () => {
    expect(journeymanJoinLabel({ count: 2, names: ["Sigrun Cuervo", "Lothar Escudo Viejo"] })).toBe(
      "Sigrun Cuervo, Lothar Escudo Viejo se unen como novatos",
    );
  });

  it("returns null for a missing/empty names payload (defensive)", () => {
    expect(journeymanJoinLabel({})).toBeNull();
    expect(journeymanJoinLabel({ count: 0, names: [] })).toBeNull();
  });
});

describe("casualtyIcon — band → SVG trio (v7: grave / helmet / hospital)", () => {
  it("uses the grave for a dead band, the hospital for a bruise and the helmet for every lasting Baja", () => {
    expect(casualtyIcon({ band: "dead" })).toBe("grave");
    expect(casualtyIcon({ band: "bruise" })).toBe("hospital");
    expect(casualtyIcon({ band: "apaleado" })).toBe("helmet");
    expect(casualtyIcon({ band: "grave" })).toBe("helmet");
    expect(casualtyIcon({ band: "permanent" })).toBe("helmet");
  });

  it("defaults to the helmet for a missing/unknown band", () => {
    expect(casualtyIcon({})).toBe("helmet");
    expect(casualtyIcon({ band: "meteorite" })).toBe("helmet");
  });
});

describe("bandSubLabel — band sub-lines under the casualty label (v7)", () => {
  it("maps dead / lasting non-dead / bruise to their sub-lines", () => {
    expect(bandSubLabel({ band: "dead" })).toBe("¡Muerto!");
    expect(bandSubLabel({ band: "apaleado" })).toBe("Se pierde el próximo partido");
    expect(bandSubLabel({ band: "grave" })).toBe("Se pierde el próximo partido");
    expect(bandSubLabel({ band: "permanent" })).toBe("Se pierde el próximo partido");
    expect(bandSubLabel({ band: "bruise" })).toBe("Lesión molesta");
  });

  it("returns null for a missing/unknown band (no sub-line)", () => {
    expect(bandSubLabel({})).toBeNull();
    expect(bandSubLabel({ band: "meteorite" })).toBeNull();
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

describe("isBothDownCasualty — reads the additive bothDown marker (LM-12/D1)", () => {
  it("returns true ONLY when the payload marker is literally true", () => {
    expect(isBothDownCasualty({ victimRosterId: "h1", causerRosterId: "a1", cause: "block", bothDown: true })).toBe(true);
  });

  it("returns false for a plain casualty and for a marker absent or non-true (triangulation)", () => {
    // A plain active-coach `block` defender record (no marker) is NOT both-down.
    expect(isBothDownCasualty({ victimRosterId: "p9", causerRosterId: "p1", cause: "block" })).toBe(false);
    expect(isBothDownCasualty({})).toBe(false);
    expect(isBothDownCasualty({ cause: "block", bothDown: false })).toBe(false);
    expect(isBothDownCasualty({ cause: "block", bothDown: "yes" as unknown })).toBe(false);
  });
});

describe("bothDownMarkerLabel — localized '(Ambos derribados)' marker copy (b5)", () => {
  it("returns the Spanish marker label for a both-down casualty", () => {
    expect(bothDownMarkerLabel({ victimRosterId: "h1", causerRosterId: "a1", cause: "block", bothDown: true })).toBe("Ambos derribados");
  });

  it("returns null for a plain casualty, an absent marker or a non-true marker", () => {
    expect(bothDownMarkerLabel({ victimRosterId: "p9", causerRosterId: "p1", cause: "block" })).toBeNull();
    expect(bothDownMarkerLabel({})).toBeNull();
    expect(bothDownMarkerLabel({ cause: "block", bothDown: false })).toBeNull();
    expect(bothDownMarkerLabel({ cause: "block", bothDown: "yes" as unknown })).toBeNull();
  });
});

describe("kickoff rows — the DEMO kickoff-gate labels (S3 · T4, MVT-6)", () => {
  it("renders the recorded note as the label (the acta registro line)", () => {
    expect(
      liveEventLabel(
        ev("kickoff", {
          phase: "award",
          note: "Kickoff · LOS HINCHAS ANIMAN → beneficio para Águilas (5 vs 3)",
        }),
      ),
    ).toBe("Kickoff · LOS HINCHAS ANIMAN → beneficio para Águilas (5 vs 3)");
  });

  it("falls back to the phase label and then to «Patada inicial»", () => {
    expect(liveEventLabel(ev("kickoff", { phase: "roll" }))).toBe(
      "Patada inicial · Tirada",
    );
    expect(liveEventLabel(ev("kickoff", { phase: "duel" }))).toBe(
      "Patada inicial · Duelo",
    );
    expect(liveEventLabel(ev("kickoff", {}))).toBe("Patada inicial");
  });

  it("maps the kickoff glyph to the dice icon (never the bare football fallback)", () => {
    expect(EVENT_GLYPH.kickoff).toBe("dice");
  });
});

describe("knockdownLabel — the standalone derribo row (T17, S10.2)", () => {
  it("reads «Derribo» for a plain defender knockdown and names WHO falls on the other faces", () => {
    expect(knockdownLabel({})).toBe("Derribo");
    expect(knockdownLabel({ face: "defenderDown" })).toBe("Derribo");
    // Skills are not modelled — a stumble without Dodge is a defender derribo.
    expect(knockdownLabel({ face: "defenderStumbles" })).toBe("Derribo");
    expect(knockdownLabel({ face: "bothDown" })).toBe("Derribo · ambos caen");
    expect(knockdownLabel({ face: "attackerDown" })).toBe(
      "Derribo · cae el atacante",
    );
  });

  it("appends the recorded 2D6 armour line vs the victim AV (rota / aguanta)", () => {
    expect(
      knockdownLabel({
        face: "defenderDown",
        armourRoll: 7,
        victimAv: 9,
        armourBroken: true,
      }),
    ).toBe("Derribo · Ar 7 (9+) rota");
    expect(
      knockdownLabel({
        face: "defenderDown",
        armourRoll: 9,
        victimAv: 9,
        armourBroken: false,
      }),
    ).toBe("Derribo · Ar 9 (9+) aguanta");
    // Unknown AV (fixture positional outside the catalog): the raw roll only.
    expect(knockdownLabel({ armourRoll: 11 })).toBe("Derribo · Ar 11");
  });

  it("liveEventLabel routes the knockdown kind through the composed label (never throws)", () => {
    expect(
      liveEventLabel(
        ev("knockdown", {
          armourRoll: 12,
          victimAv: 10,
          armourBroken: true,
        }),
      ),
    ).toBe("Derribo · Ar 12 (10+) rota");
    expect(liveEventLabel(ev("knockdown", { face: "bothDown" }))).toBe(
      "Derribo · ambos caen",
    );
  });
});

describe("eventCategoryTab — folder-tab acta rows (T18, design/acta-folder-tabs/01)", () => {
  it("names the scored kinds by WHAT HAPPENED — never by their SPP award", () => {
    // L60/L63: the pase row title is «Pase», never «+1 SPP» (SPP is a
    // consequence and lives on the bottom-right tab instead).
    expect(eventCategoryTab(ev("completion"))).toEqual({ label: "Pase" });
    expect(eventCategoryTab(ev("td"))).toEqual({ label: "TD" });
  });

  it("marks ONLY the casualty category as the red tab (goal: navy tabs, red only for Casualty)", () => {
    expect(eventCategoryTab(ev("casualty", { band: "apaleado" }))).toEqual({
      label: "Casualty",
      injury: true,
    });
    expect(eventCategoryTab(ev("completion"))?.injury).toBeUndefined();
    expect(eventCategoryTab(ev("td"))?.injury).toBeUndefined();
  });

  it("shortens the combat chain to its category: Derribo / Ambos derribados (never the long composed label)", () => {
    // The composed «Derribo · Ar 9 (8+) rota» chain stays the row's text;
    // the TAB is the short category (L60: the chip stole more width than the text).
    expect(
      eventCategoryTab(ev("knockdown", { face: "defenderDown", armourRoll: 9 })),
    ).toEqual({ label: "Derribo" });
    expect(eventCategoryTab(ev("knockdown", { face: "defenderStumbles" }))).toEqual({
      label: "Derribo",
    });
    expect(eventCategoryTab(ev("knockdown", { face: "attackerDown" }))).toEqual({
      label: "Derribo",
    });
    expect(eventCategoryTab(ev("knockdown", { face: "bothDown" }))).toEqual({
      label: "Ambos derribados",
    });
  });

  it("returns null for kinds with no combat/scored category — the caller keeps its own label", () => {
    expect(eventCategoryTab(ev("foul"))).toBeNull();
    expect(eventCategoryTab(ev("mvp"))).toBeNull();
    expect(eventCategoryTab(ev("weather"))).toBeNull();
  });
});

describe("whoLineLabel / teamShortName — the mirror-chat who-line (T19, artboard 04)", () => {
  it("strips the trailing «de/del …» qualifier for the short team name («Águilas de Khemri» → «Águilas»)", () => {
    // WHY new (T19, intentional — artboard 04 «Khalid · Águilas»): the who-line
    // is SHORT by design; the demo's «X de/del Y» team names drop the qualifier.
    expect(teamShortName("Águilas de Khemri")).toBe("Águilas");
    expect(teamShortName("Colmillos del Caos")).toBe("Colmillos");
    expect(teamShortName("Brutos de la Vega")).toBe("Brutos");
  });

  it("keeps qualifier-less names whole («Reikland Reavers» / «Gouged Eye» pass through)", () => {
    expect(teamShortName("Reikland Reavers")).toBe("Reikland Reavers");
    expect(teamShortName("Gouged Eye")).toBe("Gouged Eye");
    expect(teamShortName("Dwarves")).toBe("Dwarves");
  });

  it("composes the who-line «Player · Team» (the artboard's «Khalid · Águilas» shape)", () => {
    expect(whoLineLabel("Khalid el Impávido", "Águilas de Khemri")).toBe(
      "Khalid el Impávido · Águilas",
    );
    expect(whoLineLabel("Grishnak Mordaz", "Colmillos del Caos")).toBe(
      "Grishnak Mordaz · Colmillos",
    );
  });

  it("never invents a short form for a single-word team (empty strip falls back to the name)", () => {
    expect(whoLineLabel("Ugluk", "Gouged Eye")).toBe("Ugluk · Gouged Eye");
    expect(whoLineLabel("Neb", "Dwarves")).toBe("Neb · Dwarves");
  });
});
