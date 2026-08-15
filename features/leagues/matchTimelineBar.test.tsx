import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MatchTimelineBar } from "./matchTimelineBar";
import type { LiveMatchView } from "./api";

/**
 * Tourplay sticky-header timeline bar (MVT-2/D4): one icon per display event at
 * `round((at-startedAt)/elapsed×100)%`, home on the top half and away on the
 * bottom half, with 0′/final-minute markers anchored at 0%/100% ONLY when the
 * match is finished. Reload-deterministic (no live clock — the end bound is the
 * finishedAt or the last display event's at). Strict TDD RED suite.
 */

function ev(
  seq: number,
  kind: string,
  side: "home" | "away" | null,
  at: number,
  playerRosterId: string | null = null,
): LiveMatchView["events"][number] {
  return { seq, kind, side, playerRosterId, half: 1, turnNumber: 1, payload: {}, at };
}

function renderBar({
  events,
  startedAt = 0,
  finishedAt = null,
}: {
  events: LiveMatchView["events"];
  startedAt?: number | null;
  finishedAt?: number | null;
}) {
  return render(
    <MatchTimelineBar events={events} startedAt={startedAt} finishedAt={finishedAt} />,
  );
}

describe("MatchTimelineBar — position by elapsed percent (MVT-2/D4)", () => {
  it("positions a TD at minute 99 of a 199-minute match at exactly 50%", () => {
    const { container } = renderBar({
      events: [ev(5, "td", "home", 99 * 60_000)],
      startedAt: 0,
      finishedAt: 199 * 60_000,
    });
    const icon = container.querySelector("[data-testid='timeline-icon']") as HTMLElement;
    expect(icon).toBeTruthy();
    expect(icon.style.left).toBe("50%");
  });

  it("clamps an early event to 0% and a late event to 100%", () => {
    const { container } = renderBar({
      events: [ev(1, "completion", "home", 0), ev(9, "td", "away", 500 * 60_000)],
      startedAt: 0,
      finishedAt: 200 * 60_000,
    });
    const icons = Array.from(
      container.querySelectorAll("[data-testid='timeline-icon']"),
    ) as HTMLElement[];
    expect(icons[0].style.left).toBe("0%");
    expect(icons[1].style.left).toBe("100%");
  });
});

describe("MatchTimelineBar — side placement (MVT-2)", () => {
  it("places home events on the top half and away events on the bottom half", () => {
    const { container } = renderBar({
      events: [
        ev(5, "td", "home", 3000, "p1"),
        ev(7, "foul", "away", 6000, "p2"),
        ev(12, "endMatch", null, 8000),
      ],
      startedAt: 1000,
      finishedAt: 9000,
    });
    const icons = Array.from(container.querySelectorAll("[data-testid='timeline-icon']"));
    expect(icons).toHaveLength(3);
    expect(icons[0].getAttribute("data-side")).toBe("home");
    expect(icons[1].getAttribute("data-side")).toBe("away");
    // A null-side boundary event gets the neutral marker side.
    expect(icons[2].getAttribute("data-side")).toBe("mid");
  });
});

describe("MatchTimelineBar — boundary markers + reload determinism (D4)", () => {
  it("renders 0% and 100% end markers plus 0'/final-minute labels ONLY when finished", () => {
    // Finished → markers + labels rendered (199-minute window → final "199'").
    const { container, rerender } = renderBar({
      events: [ev(5, "td", "home", 99 * 60_000)],
      startedAt: 0,
      finishedAt: 199 * 60_000,
    });
    expect(container.querySelector("[data-testid='timeline-marker-0']")).toBeTruthy();
    expect(container.querySelector("[data-testid='timeline-marker-100']")).toBeTruthy();
    expect(container.textContent).toContain("0'");
    expect(container.textContent).toContain("199'");

    // Not finished (live) → no markers, no extreme labels.
    rerender(
      <MatchTimelineBar
        events={[ev(5, "td", "home", 99 * 60_000)]}
        startedAt={0}
        finishedAt={null}
      />,
    );
    expect(container.querySelector("[data-testid='timeline-marker-0']")).toBeNull();
    expect(container.querySelector("[data-testid='timeline-marker-100']")).toBeNull();
    // The live bar relies on the LAST display event's at as the end bound, so
    // the extreme labels (which derive from the finishedAt origin) are absent.
    expect(container.textContent).not.toMatch(/199'/);
  });

  it("is reload-identical: the same events/stamps produce the same bar (D4 deterministic end bound)", () => {
    const events = [
      ev(1, "td", "home", 2 * 60_000, "p1"),
      ev(2, "casualty", "away", 60 * 60_000, "p2"),
      ev(3, "td", "home", 100 * 60_000, "p1"),
    ];
    const a = renderBar({ events, startedAt: 0, finishedAt: 200 * 60_000 });
    const b = renderBar({ events, startedAt: 0, finishedAt: 200 * 60_000 });
    const aIcons = Array.from(
      a.container.querySelectorAll("[data-testid='timeline-icon']"),
    ) as HTMLElement[];
    const bIcons = Array.from(
      b.container.querySelectorAll("[data-testid='timeline-icon']"),
    ) as HTMLElement[];
    expect(aIcons.length).toBe(bIcons.length);
    aIcons.forEach((icon, i) => expect(icon.style.left).toBe(bIcons[i].style.left));
  });
});
