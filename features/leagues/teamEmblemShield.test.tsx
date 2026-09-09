import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { TeamEmblem } from "./TeamEmblem";

/**
 * RAU-78 team-shield additive TeamEmblem surface (TS-6, STRICT TDD): the
 * optional `emblem` prop makes the badge render the team's shield `<img>`
 * (distinguishable via `data-testid="shield-<teamId>"`) when a storage value
 * is present; null / missing / empty fall back to the EXACT deterministic
 * placeholder (same `emblem-<teamId>` testid, aria-label and glyph).
 */
describe("TeamEmblem shield render (RAU-78/TS-6)", () => {
  it("renders the shield image in place of the placeholder when emblem is set", () => {
    const { getByRole, queryByTestId } = render(
      <TeamEmblem teamId="t1" name="Reikland Reavers" emblem="/uploads/shields/t1-abc.webp" />,
    );
    const img = getByRole("img", { name: "Emblema de Reikland Reavers" }) as HTMLImageElement;
    expect(img.getAttribute("src")).toBe("/uploads/shields/t1-abc.webp");
    expect(img.getAttribute("alt")).toBe("");
    expect(img.getAttribute("data-testid")).toBe("shield-t1");
    // The placeholder is NOT rendered when the shield shows.
    expect(queryByTestId("emblem-t1")).toBeNull();
  });

  it("keeps the exact placeholder when emblem is null", () => {
    const { getByTestId, queryByRole } = render(
      <TeamEmblem teamId="t2" name="Orcboyz" emblem={null} />,
    );
    const badge = getByTestId("emblem-t2");
    expect(badge.textContent).toBe("O");
    expect(badge.getAttribute("aria-label")).toBe("Emblema de Orcboyz");
    expect(queryByRole("img")).toBeNull();
  });

  it("keeps the placeholder when the emblem prop is missing (undefined)", () => {
    const { getByTestId, queryByRole } = render(<TeamEmblem teamId="t3" name="Dwarves" />);
    expect(getByTestId("emblem-t3").textContent).toBe("D");
    expect(queryByRole("img")).toBeNull();
  });

  it("keeps the placeholder when emblem is an empty string (no broken img)", () => {
    const { getByTestId, queryByRole } = render(
      <TeamEmblem teamId="t4" name="Elves" emblem="" />,
    );
    expect(getByTestId("emblem-t4").textContent).toBe("E");
    expect(queryByRole("img")).toBeNull();
  });
});
