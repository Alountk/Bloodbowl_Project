import { describe, expect, it } from "vitest";
import { SPRITE_SCALE, spritePath, spriteScaleClass } from "./sprites";

describe("spritePath", () => {
  it("resolves an approved sprite (amazon)", () => {
    expect(spritePath("amazon", "linewoman")).toBe("/sprites/amazon-linewoman.png");
    expect(spritePath("amazon", "thrower")).toBe("/sprites/amazon-thrower.png");
    expect(spritePath("amazon", "catcher")).toBe("/sprites/amazon-catcher.png");
    expect(spritePath("amazon", "blitzer")).toBe("/sprites/amazon-blitzer.png");
  });

  it("returns null for teams whose design is not shipped yet", () => {
    expect(spritePath("human", "lineman")).toBeNull();
    expect(spritePath("orc", "blitzer")).toBeNull();
    expect(spritePath("amazon", "unknown-positional")).toBeNull();
  });
});

describe("spriteScaleClass", () => {
  it("classifies big guys as big", () => {
    expect(spriteScaleClass("human", "ogre")).toBe("big");
    expect(spriteScaleClass("orc", "troll")).toBe("big");
    expect(spriteScaleClass("skaven", "rat-ogre")).toBe("big");
    expect(spriteScaleClass("wood-elf", "treeman")).toBe("big");
    expect(spriteScaleClass("shambling-undead", "mummy")).toBe("big");
  });

  it("classifies stunty players as small", () => {
    expect(spriteScaleClass("orc", "goblin")).toBe("small");
    expect(spriteScaleClass("human", "halfling-hopeful")).toBe("small");
    expect(spriteScaleClass("snotling", "snotling")).toBe("small");
  });

  it("defaults to normal", () => {
    expect(spriteScaleClass("amazon", "linewoman")).toBe("normal");
    expect(spriteScaleClass("human", "lineman")).toBe("normal");
    expect(spriteScaleClass("dwarf", "troll-slayer")).toBe("normal");
  });

  it("scales big above normal above small", () => {
    expect(SPRITE_SCALE.big).toBeGreaterThan(SPRITE_SCALE.normal);
    expect(SPRITE_SCALE.normal).toBeGreaterThan(SPRITE_SCALE.small);
    expect(SPRITE_SCALE.big).toBeCloseTo(1.3);
    expect(SPRITE_SCALE.small).toBeCloseTo(0.7);
  });
});
