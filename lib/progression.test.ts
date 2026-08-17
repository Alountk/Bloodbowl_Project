import { describe, expect, it } from "vitest";
import { accessLetterForCategory, skillDisplayName, skillElite, skillKey, pickableSkills } from "./progression";

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

describe("pickableSkills (shared by the PE-spending UIs)", () => {
  it("returns only catalog skills whose access letter is in the set and not already owned", () => {
    // G set: general skills (block, fend, kick, ...) — never trait/agility/...
    const general = pickableSkills(["G"], new Set());
    expect(general.length).toBeGreaterThan(0);
    expect(general.every((s) => accessLetterForCategory(s.category) === "G")).toBe(true);

    // A player owning block (dedup key "block") never sees it offered again.
    const withoutBlock = pickableSkills(["G"], new Set([skillKey("block")]));
    expect(withoutBlock.find((s) => s.id === "block")).toBeUndefined();
    expect(withoutBlock.find((s) => s.id === "kick")).toBeTruthy();
  });

  it("never offers trait skills (not purchasable via progression)", () => {
    const all = pickableSkills(["G", "A", "F", "P", "M", "T"], new Set());
    expect(all.length).toBeGreaterThan(0);
    expect(all.some((s) => s.category === "trait")).toBe(false);
  });
});
