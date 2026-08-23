import { describe, expect, it } from "vitest";
import { render } from "@testing-library/react";
import { MatchTimelineBar } from "./matchTimelineBar";
import type { LiveMatchView } from "./api";

/**
 * rulebook sticky-header timeline bar (MVT-2/D4, v7): one icon per display event at
 * `round((at-startedAt)/elapsed×100)%`, home on the top lane and away on the
 * bottom lane, with ALWAYS-rendered mid start/end markers (timer at 0%, flag at
 * 100%) and the 0′/final-minute labels inside the bar. Reload-deterministic (no
 * live clock — the end bound is the finishedAt or the last display event's at).
 * Strict TDD RED suite.
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
  it("places home events on the top lane and away events on the bottom lane", () => {
    const { container } = renderBar({
      events: [
        ev(5, "td", "home", 3000, "p1"),
        ev(7, "foul", "away", 6000, "p2"),
        // v7: endMatch is NOT a display kind — the flag is the fixed 100% marker.
        ev(12, "endMatch", null, 8000),
      ],
      startedAt: 1000,
      finishedAt: 9000,
    });
    const icons = Array.from(container.querySelectorAll("[data-testid='timeline-icon']"));
    // Only the two side events render as real icons; the boundary start/end are
    // the always-on fixed markers (distinct testids, mid lane).
    expect(icons).toHaveLength(2);
    expect(icons[0].getAttribute("data-side")).toBe("home");
    expect(icons[1].getAttribute("data-side")).toBe("away");
    const start = container.querySelector("[data-testid='timeline-start-icon']");
    const end = container.querySelector("[data-testid='timeline-end-icon']");
    expect(start?.getAttribute("data-side")).toBe("mid");
    expect(end?.getAttribute("data-side")).toBe("mid");
  });
});

describe("MatchTimelineBar — boundary markers + labels (v7: always on)", () => {
  it("always renders the mid start/end markers and the 0'/final-minute labels", () => {
    // Finished → the final minute comes from finishedAt (199-minute window → 199').
    const { container, rerender } = renderBar({
      events: [ev(5, "td", "home", 99 * 60_000)],
      startedAt: 0,
      finishedAt: 199 * 60_000,
    });
    expect(container.querySelector("[data-testid='timeline-start-icon']")).toBeTruthy();
    expect(container.querySelector("[data-testid='timeline-end-icon']")).toBeTruthy();
    expect(container.textContent).toContain("0'");
    expect(container.textContent).toContain("199'");

    // Live (no finishedAt) → the labels derive from the LAST display event's at
    // as the end bound (D4): a TD at minute 99 → final label "99'".
    rerender(
      <MatchTimelineBar
        events={[ev(5, "td", "home", 99 * 60_000)]}
        startedAt={0}
        finishedAt={null}
      />,
    );
    expect(container.querySelector("[data-testid='timeline-start-icon']")).toBeTruthy();
    expect(container.querySelector("[data-testid='timeline-end-icon']")).toBeTruthy();
    expect(container.textContent).toContain("0'");
    expect(container.textContent).toContain("99'");
    // The live bar's end bound is the last event, so 199' never appears.
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
