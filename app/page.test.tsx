import { describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";
import Page from "./page";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

describe("Home page", () => {
  it("renders the app shell with an empty team list after hydration", async () => {
    render(
      <AppShell>
        <Page />
      </AppShell>,
    );

    expect(screen.getByRole("heading", { name: "Bloodbowl Teams" })).toBeTruthy();
    expect(screen.getByLabelText("Sidebar")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Teams" })).toBeTruthy();
    await waitFor(() => expect(screen.getByText(/no teams yet/i)).toBeTruthy());
  });
});
