import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { HeaderEmblem } from "./headerEmblem";

/**
 * MVT-9 header emblem host (D3/D4, STRICT TDD): a focusable `role="img"` host
 * exposing EXACTLY one screen-reader name ("Emblema de {name}") whose glyph is
 * the MVT-8 acronym, with the full team name in a hover/focus tooltip that never
 * enters the a11y tree (aria-hidden) — coarse-pointer/touch devices keep the
 * name only in the host aria-label.
 */
function renderHost(side: "home" | "away", name = "Los Dragones de Nurgle") {
  return render(<HeaderEmblem teamId="t1" name={name} side={side} />);
}

describe("HeaderEmblem host (MVT-8/MVT-9)", () => {
  it.each(["home", "away"] as const)(
    "renders the acronym glyph and one accessible name (%s)",
    (side) => {
      const { container } = renderHost(side, "Reyes-Corsarios de la Costa");
      const host = container.querySelector("[role='img']") as HTMLElement;
      expect(host).toBeTruthy();
      expect(host.getAttribute("aria-label")).toBe("Emblema de Reyes-Corsarios de la Costa");
      expect(host.getAttribute("tabindex")).toBe("0");
      const emblem = container.querySelector("[data-testid='emblem-t1']");
      expect(emblem?.textContent).toBe("RC");
    },
  );

  it("keeps the full name out of the a11y tree inside the tooltip span", () => {
    const { container } = renderHost("away");
    const tooltip = container.querySelector('[aria-hidden="true"]') as HTMLElement;
    expect(tooltip).toBeTruthy();
    expect(tooltip.textContent).toContain("Los Dragones de Nurgle");
    // The tooltip is a bare span (no semantic role) that carries the duplicate
    // name ONLY behind aria-hidden, so it is excluded from the a11y tree. The
    // host (role=img) is the single exposable image-semantics node.
    expect(tooltip.getAttribute("role")).toBeNull();
    const imgHosts = Array.from(container.querySelectorAll("[role='img']"));
    expect(imgHosts).toHaveLength(1);
    expect(imgHosts[0].getAttribute("aria-label")).toBe("Emblema de Los Dragones de Nurgle");
    expect(tooltip.querySelector("a, button, [role], [aria-label]")).toBeNull();
  });
});
