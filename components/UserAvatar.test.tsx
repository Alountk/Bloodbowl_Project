import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { UserAvatar } from "./UserAvatar";

/**
 * UserAvatar renders the avatar `<img>` when a `src` (adapter-issued avatar
 * value) is present, and nothing at all when it is absent — the MatchCard spec
 * requires "nothing rendered" for an owner without an avatar, so callers keep
 * their existing name fallbacks.
 */
describe("UserAvatar", () => {
  it("renders an img with the src when an avatar value is present", () => {
    render(<UserAvatar src="/uploads/avatars/u-1.webp" />);
    const img = screen.queryByRole("img");
    expect(img).toBeTruthy();
    expect(img?.getAttribute("src")).toBe("/uploads/avatars/u-1.webp");
  });

  it("renders nothing when the avatar value is absent", () => {
    render(<UserAvatar src={null} />);
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("renders nothing when the avatar src is the empty string", () => {
    render(<UserAvatar src="" />);
    expect(screen.queryByRole("img")).toBeNull();
  });
});
