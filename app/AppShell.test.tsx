import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, within } from "@testing-library/react";
import { AppShell } from "@/components/AppShell";

vi.mock("next/navigation", () => ({
  usePathname: () => "/",
}));

/** The drawer mounts only while open, so the desktop Sidebar is the sole "Sidebar" landmark. */
describe("AppShell mobile drawer", () => {
  it("does not render the drawer or scrim when closed, and shows exactly one Sidebar landmark", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    // Desktop sidebar always stays mounted.
    expect(screen.getByLabelText("Sidebar")).toBeTruthy();
    // No drawer or scrim when closed.
    expect(screen.queryByLabelText("Mobile navigation")).toBeNull();
    expect(screen.queryByTestId("drawer-scrim")).toBeNull();
    // Exactly one element with the "Sidebar" aria label.
    expect(screen.getAllByLabelText("Sidebar")).toHaveLength(1);
  });

  it("opens the drawer via the hamburger, mounting the drawer and scrim without duplicating the Sidebar aria", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));

    // Drawer and scrim mount.
    expect(screen.getByLabelText("Mobile navigation")).toBeTruthy();
    expect(screen.getByTestId("drawer-scrim")).toBeTruthy();
    // The desktop Sidebar is never duplicated.
    expect(screen.getAllByLabelText("Sidebar")).toHaveLength(1);
  });

  it("closes the drawer when the scrim is clicked", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    expect(screen.getByLabelText("Mobile navigation")).toBeTruthy();

    fireEvent.click(screen.getByTestId("drawer-scrim"));

    expect(screen.queryByLabelText("Mobile navigation")).toBeNull();
    expect(screen.queryByTestId("drawer-scrim")).toBeNull();
  });

  it("closes the drawer when a navigation link inside it is clicked", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const drawer = screen.getByLabelText("Mobile navigation");
    expect(within(drawer).getByRole("link", { name: "Teams" })).toBeTruthy();

    fireEvent.click(within(drawer).getByRole("link", { name: "Teams" }));

    expect(screen.queryByLabelText("Mobile navigation")).toBeNull();
    expect(screen.queryByTestId("drawer-scrim")).toBeNull();
  });

  it("renders the shared nav with exactly Teams, Ligas, and My Profile links in both desktop and drawer", () => {
    render(
      <AppShell>
        <div>page content</div>
      </AppShell>,
    );

    // Desktop sidebar: exactly the Teams, Ligas, and My Profile items (shared NAV_ITEMS).
    const desktopNav = screen.getByRole("navigation");
    expect(within(desktopNav).getByRole("link", { name: "Teams" })).toBeTruthy();
    expect(within(desktopNav).getByRole("link", { name: "Ligas" })).toBeTruthy();
    expect(within(desktopNav).getByRole("link", { name: "My Profile" })).toBeTruthy();
    expect(within(desktopNav).getAllByRole("link")).toHaveLength(3);

    // Drawer shares the same NAV_ITEMS when open.
    fireEvent.click(screen.getByRole("button", { name: "Open navigation menu" }));
    const drawer = screen.getByLabelText("Mobile navigation");
    expect(within(drawer).getByRole("link", { name: "Ligas" })).toBeTruthy();
    expect(within(drawer).getByRole("link", { name: "My Profile" })).toBeTruthy();
  });
});
