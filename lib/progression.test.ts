import { describe, expect, it } from "vitest";
import { accessLetterForCategory, skillDisplayName, skillElite, skillKey } from "./progression";

describe("access-letter category mapping (rulebook columns A/F/G/M/P/T)", () => {
  it("maps the five trainable catalog categories to their access letter", () => {
    expect(accessLetterForCategory("general")).toBe("G");
    expect(accessLetterForCategory("agility")).toBe("A");
    expect(accessLetterForCategory("strength")).toBe("F");
    expect(accessLetterForCategory("passing")).toBe("P");
    expect(accessLetterForCategory("mutation")).toBe("M");
    expect(accessLetterForCategory("devious")).toBe("T");
  });

  it("treats trait skills as not purchasable via progression", () => {
    expect(accessLetterForCategory("trait")).toBeNull();
  });
});

describe("skill reference resolution (ids and names share one list)", () => {
  it("resolves a catalog skill id to its display name, preferring Spanish when present", () => {
    // block has no es catalog translation; falls back to the canonical English name.
    expect(skillDisplayName("kick")).toBe("Patada de despeje"); // es translation present
    expect(skillDisplayName("block")).toBe("Block");
  });

  it("resolves a raw name (random-table or catalog) through unchanged", () => {
    expect(skillDisplayName("Agallas")).toBe("Agallas");
    expect(skillDisplayName("Patada de despeje")).toBe("Patada de despeje");
  });

  it("resolves élite status from either an id or a name", () => {
    // Élite catalog skills (REQ-RACE-08): Placar, Esquivar, Defensa, Golpe mortífero.
    expect(skillElite("block")).toBe(true); // Placar
    expect(skillElite("dodge")).toBe(true); // Esquivar
    expect(skillElite("kick")).toBe(false); // Patada de despeje → not élite
    expect(skillElite("Agallas")).toBe(false);
  });

  it("canonicalizes both catalog ids and random-table names to one dedup key", () => {
    // "Placar" (random table) and "block" (catalog id) both canonicalize to "block".
    expect(skillKey("block")).toBe("block");
    expect(skillKey("Placar")).toBe("block");
    // A random-table skill with no catalog entry keeps its name as the key.
    expect(skillKey("Agallas")).toBe("Agallas");
    expect(skillKey("Esquivar")).toBe("dodge");
  });
});
