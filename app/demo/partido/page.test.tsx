import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import Page from "./page";

describe("Demo match page route", () => {
  it("renders the demo harness inside the thin route wrapper", () => {
    render(<Page />);

    expect(screen.getByText("Demo · datos simulados")).toBeTruthy();
    expect(screen.getByRole("button", { name: "TD local" })).toBeTruthy();
    expect(screen.getByRole("heading", { level: 1 }).textContent).toBe(
      "Águilas de Khemri 2 - 1 Colmillos del Caos",
    );
  });
});
