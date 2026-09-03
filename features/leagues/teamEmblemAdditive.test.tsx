import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TeamEmblem } from "./TeamEmblem";

/**
 * MVT-8 additive TeamEmblem surface (D2, STRICT TDD): the `acronym` prop makes
 * the badge render `teamAcronym(name)` instead of the single initial, while the
 * default (`acronym` absent) keeps `teamInitial` — MatchCard/TeamCard/teams grid
 * (default path) must stay unchanged. New `size="xs"` = h-[34px].
 */
describe("TeamEmblem additive acronym + xs size (MVT-8/D2)", () => {
  it("renders the multi-letter acronym when acronym is requested", () => {
    const { getByTestId } = render(
      <TeamEmblem teamId="t1" name="Los Dragones de Nurgle" acronym size="xs" />,
    );
    const badge = getByTestId("emblem-t1");
    expect(badge.textContent).toBe("DN");
    expect(badge.getAttribute("aria-label")).toBe("Emblema de Los Dragones de Nurgle");
  });

  it("keeps the single initial by default (acronym absent) — non-zero letters", () => {
    // "Reyes-Corsarios de la Costa" would be "RC" — but the DEFAULT must be the
    // plain initial "R", proving existing behavior is unchanged.
    const { getByTestId } = render(
      <TeamEmblem teamId="t2" name="Reyes-Corsarios de la Costa" size="xs" />,
    );
    expect(getByTestId("emblem-t2").textContent).toBe("R");
  });
});
