import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/**
 * T6 · G1 — the draft WIRING seam. Draft persistence is opt-in per fixture via
 * the `fixtureId` prop; if either call site stops passing it, drafts silently
 * turn OFF for every real user while all component-level tests keep passing.
 * This pin (the `MatchViewV2.test.tsx` source-seam pattern) is the regression
 * guard for those two one-line wirings.
 */

function sourceOf(relative: string): string {
  return readFileSync(fileURLToPath(new URL(relative, import.meta.url)), "utf8");
}

describe("acta draft wiring (T6 · G1 seam)", () => {
  it("LeagueDetail enables wizard drafts by passing the fixture id", () => {
    expect(sourceOf("../LeagueDetail.tsx")).toContain("fixtureId={fixture.id}");
  });

  it("MatchViewV2 enables closure drafts by passing the fixture id", () => {
    expect(sourceOf("../MatchViewV2.tsx")).toContain("fixtureId={detail.fixture.id}");
  });
});
