import { describe, expect, it } from "vitest";

import {
  COMMON_INDUCEMENTS,
  INDUCEMENT_CATEGORIES,
  STAR_MAX_PER_MATCH,
  displayNameOf,
  fundsForSide,
  getStarPlayer,
  listInducements,
  standardCartCost,
  starPlayerEntry,
  validateCart,
} from "@/lib/rules/inducements";
import { STAR_PLAYERS } from "@/lib/rules/starPlayers";

/**
 * S8 · U9 (ODD T7) — the three gaps the redesign closed, unit level:
 *  - §D «Caja menor» money: disponible/gastado/restante for either side;
 *  - the 6-section taxonomy (01-04 common + 05 Star Players + 06 Mercenarios);
 *  - the verified Season-3 Star Player roster with minimal stats + skills.
 */

const AGUILAS = { value: 1_240_000, treasury: 1_000_000 };
const COLMILLOS = { value: 1_160_000, treasury: 10_000 };

describe("fundsForSide (§D · caja menor)", () => {
  it("minor-VAE side: ΔVE + rival treasury spend + up to 50k own treasury (worked example = 140.000)", () => {
    const funds = fundsForSide({
      own: COLMILLOS,
      rival: AGUILAS,
      rivalSpend: 50_000,
      ownSpend: 95_000,
    });
    expect(funds).toEqual({
      kind: "menor",
      delta: 80_000,
      rivalSpend: 50_000,
      treasuryUsed: 10_000,
      potencial: 140_000,
      spent: 95_000,
      restante: 45_000,
    });
  });

  it("minor-VAE side with a rival that has not bought yet: rivalSpend 0 (80k + 0 + 50k = 130k)", () => {
    const funds = fundsForSide({
      own: { value: 1_160_000, treasury: 50_000 },
      rival: AGUILAS,
      rivalSpend: 0,
      ownSpend: 0,
    });
    expect(funds.kind).toBe("menor");
    expect(funds.potencial).toBe(130_000);
    expect(funds.restante).toBe(130_000);
  });

  it("the own-treasury top-up is capped by BOTH 50.000 and the real treasury", () => {
    const poor = fundsForSide({
      own: { value: 1_160_000, treasury: 20_000 },
      rival: AGUILAS,
      rivalSpend: 0,
      ownSpend: 0,
    });
    expect(poor.kind).toBe("menor");
    if (poor.kind === "menor") expect(poor.treasuryUsed).toBe(20_000);
    expect(poor.potencial).toBe(100_000);
  });

  it("major-VAE side: spends its own treasury (design chip: 1.000.000 − 50.000 = 950.000)", () => {
    const funds = fundsForSide({
      own: AGUILAS,
      rival: COLMILLOS,
      rivalSpend: 0,
      ownSpend: 50_000,
    });
    expect(funds).toEqual({
      kind: "mayor",
      potencial: 1_000_000,
      spent: 50_000,
      restante: 950_000,
    });
  });

  it("equal VAE: nobody spends treasury — potencial 0, restante 0", () => {
    const funds = fundsForSide({
      own: COLMILLOS,
      rival: { value: 1_160_000, treasury: 900_000 },
      rivalSpend: 70_000,
      ownSpend: 0,
    });
    expect(funds).toEqual({ kind: "empate", potencial: 0, spent: 0, restante: 0 });
  });

  it("restante never goes negative (over-spend shows as 0)", () => {
    const funds = fundsForSide({
      own: COLMILLOS,
      rival: AGUILAS,
      rivalSpend: 50_000,
      ownSpend: 999_000,
    });
    expect(funds.restante).toBe(0);
  });
});

describe("INDUCEMENT_CATEGORIES (taxonomy · design A')", () => {
  it("orders the six sections 01-04 + 06 (05 Star Players is its own section)", () => {
    expect(INDUCEMENT_CATEGORIES.map((c) => c.num)).toEqual([
      "01",
      "02",
      "03",
      "04",
      "06",
    ]);
    expect(INDUCEMENT_CATEGORIES.map((c) => c.id)).toEqual([
      "aficion",
      "arbitro",
      "salud",
      "magia",
      "plantilla",
    ]);
  });

  it("titles match the chosen design", () => {
    const byId = Object.fromEntries(
      INDUCEMENT_CATEGORIES.map((c) => [c.id, c.title]),
    );
    expect(byId.aficion).toBe("Afición y banquillo");
    expect(byId.arbitro).toBe("Árbitro y suerte");
    expect(byId.salud).toBe("Salud del plantil");
    expect(byId.magia).toBe("Magia y preparación");
    expect(byId.plantilla).toBe("Plantilla — Mercenarios");
  });

  it("every catalog entry belongs to a declared category, with the design's distribution", () => {
    const known = new Set(INDUCEMENT_CATEGORIES.map((c) => c.id));
    for (const entry of COMMON_INDUCEMENTS) {
      expect(known.has(entry.category)).toBe(true);
    }
    const count = (id: string) =>
      COMMON_INDUCEMENTS.filter((e) => e.category === id).length;
    expect(count("aficion")).toBe(5);
    expect(count("arbitro")).toBe(3);
    expect(count("salud")).toBe(3);
    expect(count("magia")).toBe(4);
    // 06 · Plantilla holds ONLY the mercenarios row.
    expect(count("plantilla")).toBe(1);
    expect(
      COMMON_INDUCEMENTS.filter((e) => e.category === "plantilla").map(
        (e) => e.id,
      ),
    ).toEqual(["mercenaries"]);
  });

  it("Star Players are NOT in the purchasable common list (own section 05)", () => {
    const purchasable = listInducements();
    expect(purchasable).toHaveLength(15);
    for (const star of STAR_PLAYERS) {
      expect(purchasable.some((e) => e.id === star.id)).toBe(false);
    }
  });
});

describe("STAR_PLAYERS roster (verified Season-3 data · L25)", () => {
  it("carries the two verified demo stars under the reserved star-player-* namespace", () => {
    expect(STAR_PLAYERS.length).toBeGreaterThanOrEqual(2);
    for (const star of STAR_PLAYERS) {
      expect(star.id.startsWith("star-player-")).toBe(true);
      expect(star.costGp).toBeGreaterThan(0);
      expect(star.skills.length).toBeGreaterThan(0);
      expect(star.playsFor.length).toBeGreaterThan(0);
    }
  });

  it("Griff Oberwald: 300k · 7/4/2+/3+/9+ · Block/Dodge/Fend/Sprint/Sure Feet/Loner (3+)", () => {
    const griff = getStarPlayer("star-player-griff-oberwald");
    expect(griff).toBeTruthy();
    expect(griff!.displayName).toBe("Griff Oberwald");
    expect(griff!.costGp).toBe(300_000);
    expect(griff!.stats).toEqual({
      ma: 7,
      st: 4,
      ag: "2+",
      pa: "3+",
      av: "9+",
    });
    expect(griff!.skills).toEqual([
      "Block",
      "Dodge",
      "Fend",
      "Sprint",
      "Sure Feet",
      "Loner (3+)",
    ]);
    expect(griff!.special.name).toBe("Consummate Professional");
    expect(griff!.position).toBe("Humano · Blitzer");
    expect(griff!.playsFor).toContain("Old World Classic");
  });

  it("H'thark the Unstoppable: 300k · 6/6/4+/6+/10+ · core skills + Unstoppable Momentum", () => {
    const hthark = getStarPlayer("star-player-hthark-the-unstoppable");
    expect(hthark).toBeTruthy();
    expect(hthark!.displayName).toBe("H'thark the Unstoppable");
    expect(hthark!.costGp).toBe(300_000);
    expect(hthark!.stats).toEqual({
      ma: 6,
      st: 6,
      ag: "4+",
      pa: "6+",
      av: "10+",
    });
    expect(hthark!.skills).toContain("Block");
    expect(hthark!.skills).toContain("Break Tackle");
    expect(hthark!.skills).toContain("Thick Skull");
    expect(hthark!.skills).toContain("Loner (4+)");
    expect(hthark!.special.name).toBe("Unstoppable Momentum");
    expect(hthark!.playsFor).toContain("Favoured of Hashut");
  });

  it("0-2 stars per match: entry cap 1 each, global cap 2", () => {
    expect(STAR_MAX_PER_MATCH).toBe(2);
    const entry = starPlayerEntry(getStarPlayer("star-player-griff-oberwald")!);
    expect(entry.maxPerMatch).toBe(1);
    expect(entry.max).toBe(1);
    expect(entry.price).toBe(300_000);
    expect(getStarPlayer("star-player-nobody")).toBeUndefined();
  });

  it("cart helpers price star lines and resolve their display names", () => {
    expect(
      standardCartCost([
        { id: "star-player-griff-oberwald", count: 1 },
        { id: "prayers-to-nuffle", count: 2 },
      ]),
    ).toBe(320_000);
    expect(displayNameOf("star-player-griff-oberwald")).toBe("Griff Oberwald");
    expect(displayNameOf("bribes")).toBe("Sobornos");
    expect(displayNameOf("star-player-unknown")).toBe("star-player-unknown");
  });

  it("keeps star ids OUT of the server cart validator until eligibility ships (demo path enforces its own caps)", () => {
    const star = validateCart({
      items: [{ id: "star-player-griff-oberwald", count: 1 }],
      raceId: "orc",
      budget: 900_000,
    });
    expect(star.ok).toBe(false);
  });
});

describe("standardCartCost (demo display, standard prices)", () => {
  it("prices the design's example cart = 95.000", () => {
    expect(
      standardCartCost([
        { id: "prayers-to-nuffle", count: 2 },
        { id: "team-mascot", count: 1 },
        { id: "bloodweiser-kegs", count: 1 },
      ]),
    ).toBe(95_000);
  });

  it("skips unknown and reserved dynamic-cost ids (mercenarios never count)", () => {
    expect(
      standardCartCost([
        { id: "mercenaries", count: 3 },
        { id: "not-an-id", count: 1 },
      ]),
    ).toBe(0);
  });
});
