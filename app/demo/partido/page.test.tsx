import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";

import Page from "./page";

describe("Demo match page route", () => {
  it("renders the dual-view demo harness inside the thin route wrapper", () => {
    render(<Page />);

    // Demo banner + the dual-view perspective control (both REAL team names).
    expect(screen.getByText("Demo · datos simulados")).toBeTruthy();
    const group = screen.getByRole("group", { name: "Ver como:" });
    expect(within(group).getByRole("button", { name: "Águilas de Khemri" })).toBeTruthy();
    expect(within(group).getByRole("button", { name: "Colmillos del Caos" })).toBeTruthy();

    // The REAL capture dock is wired (perspective-gated) — the omniscient
    // demo buttons ("TD local" …) are gone by design.
    expect(screen.getByTestId("acta-capture-dock")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "TD local" })).toBeNull();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Águilas de Khemri 0 - 0 Colmillos del Caos",
    );
  });
});
