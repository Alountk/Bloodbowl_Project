import { describe, expect, it } from "vitest";
import { teamAcronym } from "./TeamEmblem";

/**
 * MVT-8 header glyph acronym derivation (D1/D2, STRICT TDD). Pure/deterministic:
 * tokens are whitespace-separated runs (hyphenated names count as a single
 * token); skip particles (de/del/la/las/los/el/y/e/of/the) and digit-leading
 * tokens; output the uppercased first letter of up to 3 significant tokens; a
 * single significant token yields just its first letter; none yields "?".
 */
describe("teamAcronym (MVT-8 table)", () => {
  it.each([
    ["Reavers", "R"],
    ["Dwarves", "D"],
    ["Los Dragones de Nurgle", "DN"],
    ["Reyes-Corsarios de la Costa", "RC"],
    ["The Ancient Blood Bowl Warriors of the North", "ABB"],
    ["AA 1757982", "A"],
    // A single hyphenated token counts as ONE token → one letter (a naive
    // hyphen-splitting impl would return "AB" here).
    ["Athletic-Bilbao", "A"],
  ])("acronyms %j as %j", (name, acronym) => {
    expect(teamAcronym(name)).toBe(acronym);
  });

  it.each([
    ["1776", "digit-leading token"],
    ["   ", "blank/whitespace-only name"],
  ])("fallback: '%s' → '?'", (name) => {
    expect(teamAcronym(name)).toBe("?");
  });
});
