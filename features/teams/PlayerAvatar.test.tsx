import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { PlayerAvatar } from "./PlayerAvatar";
import { SPRITE_SCALE } from "./sprites";

function imgOf(container: HTMLElement): HTMLImageElement | null {
  return container.querySelector("img");
}

describe("PlayerAvatar", () => {
  it("renders the sprite image for an approved team", () => {
    const { container } = render(
      <PlayerAvatar raceId="amazon" positionalKey="linewoman" fallbackIcon="🚶" />,
    );
    const img = imgOf(container);
    expect(img).not.toBeNull();
    expect(img!.getAttribute("src")).toBe("/sprites/amazon-linewoman.png");
    expect(img!.getAttribute("width")).toBe("28");
  });

  it("renders the emoji fallback when the team has no sprite", () => {
    const { container } = render(
      <PlayerAvatar raceId="human" positionalKey="lineman" fallbackIcon="🚶" />,
    );
    expect(imgOf(container)).toBeNull();
    expect(screen.getByText("🚶")).toBeTruthy();
  });

  it("scales a big-guy sprite up from the base size", () => {
    expect(SPRITE_SCALE.big * 28).toBeGreaterThan(28);
    expect(SPRITE_SCALE.small * 28).toBeLessThan(28);
  });
});
