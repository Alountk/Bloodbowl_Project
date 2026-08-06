import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import TeamNotFound from "./not-found";

describe("Team not-found segment", () => {
  it("renders a clear error message identifying the missing team", () => {
    render(<TeamNotFound />);

    expect(screen.getByRole("heading", { name: /team not found/i })).toBeTruthy();
    expect(
      screen.getByText(/does not exist or may have been removed/i),
    ).toBeTruthy();
  });

  it("renders a link back to the root (/) for navigation", () => {
    render(<TeamNotFound />);

    const link = screen.getByRole("link", { name: /back to teams/i });
    expect(link).toBeTruthy();
    expect(link.getAttribute("href")).toBe("/");
  });
});
