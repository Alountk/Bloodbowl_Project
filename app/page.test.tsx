import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";
import Page from "./page";

describe("Home page", () => {
  it("renders the app shell with an empty team list", () => {
    render(
      <AppShell>
        <Page />
      </AppShell>,
    );

    expect(screen.getByRole("heading", { name: "Bloodbowl Teams" })).toBeTruthy();
    expect(screen.getByLabelText("Sidebar")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Teams" })).toBeTruthy();
    expect(screen.getByText(/no teams yet/i)).toBeTruthy();
  });
});
