import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { RulesetCarousel } from "./RulesetCarousel";

function renderCarousel(count: number) {
  return render(
    <RulesetCarousel count={count}>
      {Array.from({ length: count }, (_, i) => (
        <li key={i}>Carta {i + 1}</li>
      ))}
    </RulesetCarousel>,
  );
}

function setLayout(track: HTMLElement, scrollWidth: number, clientWidth: number, scrollLeft: number) {
  Object.defineProperty(track, "scrollWidth", { value: scrollWidth, configurable: true });
  Object.defineProperty(track, "clientWidth", { value: clientWidth, configurable: true });
  Object.defineProperty(track, "scrollLeft", { value: scrollLeft, configurable: true });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("RulesetCarousel", () => {
  it("hides the chevrons when the row does not overflow", () => {
    renderCarousel(2);

    expect(screen.queryByRole("button", { name: "Ver tipos anteriores" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Ver más tipos" })).toBeNull();
  });

  it("shows the chevrons on overflow and disables the left one at the start", () => {
    renderCarousel(6);
    const track = screen.getByRole("list", { name: "Tipos de reglas" });
    setLayout(track, 2400, 800, 0);
    fireEvent.scroll(track);

    const prev = screen.getByRole("button", { name: "Ver tipos anteriores" });
    const next = screen.getByRole("button", { name: "Ver más tipos" });
    expect((prev as HTMLButtonElement).disabled).toBe(true);
    expect((next as HTMLButtonElement).disabled).toBe(false);
  });

  it("disables the right chevron at the end and enables both in between", () => {
    renderCarousel(6);
    const track = screen.getByRole("list", { name: "Tipos de reglas" });
    setLayout(track, 2400, 800, 0);
    fireEvent.scroll(track);

    const prev = screen.getByRole("button", { name: "Ver tipos anteriores" });
    const next = screen.getByRole("button", { name: "Ver más tipos" });

    setLayout(track, 2400, 800, 800);
    fireEvent.scroll(track);
    expect((prev as HTMLButtonElement).disabled).toBe(false);
    expect((next as HTMLButtonElement).disabled).toBe(false);

    setLayout(track, 2400, 800, 1600);
    fireEvent.scroll(track);
    expect((prev as HTMLButtonElement).disabled).toBe(false);
    expect((next as HTMLButtonElement).disabled).toBe(true);
  });

  it("scrolls the row by one card width on a chevron click", () => {
    renderCarousel(6);
    const track = screen.getByRole("list", { name: "Tipos de reglas" });
    setLayout(track, 2400, 800, 0);
    const firstCard = track.querySelector("li") as HTMLElement;
    Object.defineProperty(firstCard, "offsetWidth", { value: 300, configurable: true });
    fireEvent.scroll(track);

    const scrollBySpy = vi.spyOn(Element.prototype, "scrollBy");
    fireEvent.click(screen.getByRole("button", { name: "Ver más tipos" }));
    expect(scrollBySpy).toHaveBeenCalledWith({ left: 312, behavior: "smooth" });
  });
});
