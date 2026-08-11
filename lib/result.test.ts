import { describe, expect, it } from "vitest";
import {
  sumTds,
  scoresMatchReportedTotals,
  deriveWinnerId,
  computeMvpGrantee,
  computeTeamPeAwards,
  computePettyCash,
  computeTeamTv,
  resolveCasualtyOutcomes,
  PE,
} from "./result";
import type { ResultPlayerAction, CasualtyVictim } from "./result";

const player = (rosterPlayerId: string, tds = 0): ResultPlayerAction => ({
  rosterPlayerId,
  tds,
  casualties: 0,
  completions: 0,
  interceptions: 0,
  fouls: 0,
  throwTeamMates: 0,
  landedSafe: 0,
});

describe("result computation (match-result R1-R5)", () => {
  it("sums the per-player TD credits for a team", () => {
    expect(sumTds([player("p1", 2), player("p2", 1), player("p3")])).toBe(3);
    expect(sumTds([player("p1"), player("p2")])).toBe(0);
  });

  it("accepts a report when per-player TDs equal each final score", () => {
    const ok = scoresMatchReportedTotals([player("p1", 1), player("p2", 1)], 2, [player("p3", 3)], 3);
    expect(ok).toBe(true);
  });

  it("rejects a report when a team's TDs mismatch its final score", () => {
    const mismatch = scoresMatchReportedTotals([player("p1", 2), player("p2")], 3, [player("p3")], 0);
    expect(mismatch).toBe(false);
  });

  it("derives the winner from the final scores (draw → null)", () => {
    expect(deriveWinnerId(2, 1, "t1", "t2")).toBe("t1");
    expect(deriveWinnerId(1, 3, "t1", "t2")).toBe("t2");
    expect(deriveWinnerId(2, 2, "t1", "t2")).toBeNull();
  });

  it("selects the MJP grantee from the six nominations by the 1D6 roll", () => {
    const nominations = ["p1", "p2", "p3", "p4", "p5", "p6"];
    expect(computeMvpGrantee(nominations, 1)).toBe("p1");
    expect(computeMvpGrantee(nominations, 6)).toBe("p6");
  });

  it("awards PE (incl. flat 2 per casualty, MJP 4 to the grantee)", () => {
    const awards = computeTeamPeAwards(
      [player("p1", 1), { ...player("p2"), casualties: 2 }, player("p3")],
      "p3",
    );
    const byId = Object.fromEntries(awards.map((a) => [a.rosterPlayerId, a.pe]));
    expect(byId["p1"]).toBe(3); // TD
    expect(byId["p2"]).toBe(4); // 2 casualties × 2 (flat injury PE, bb2025-rules R5)
    expect(byId["p3"]).toBe(PE.MVP); // MJP 4
  });

  it("still grants 4 PE to an unreported MJP grantee", () => {
    const awards = computeTeamPeAwards([player("p1", 1)], "p9");
    const byId = Object.fromEntries(awards.map((a) => [a.rosterPlayerId, a.pe]));
    expect(byId["p1"]).toBe(3);
    expect(byId["p9"]).toBe(PE.MVP);
  });

  it("computes petty cash as the team-value difference for the lower-TV team", () => {
    // match-result R3 scenario: 1.200.000 vs 1.050.000 → 150.000 to team B
    expect(computePettyCash(1_200_000, 1_050_000)).toBe(150_000);
    expect(computePettyCash(1_050_000, 1_200_000)).toBe(150_000);
    expect(computePettyCash(1_000_000, 1_000_000)).toBe(0);
  });

  it("sums team value from roster, coaching, and skill value bonuses", () => {
    expect(computeTeamTv(500_000, 50_000, 20_000)).toBe(570_000);
    expect(computeTeamTv(0, 0, 0)).toBe(0);
  });

  it("resolves one 1D16 outcome per victim, preserving victim identity", () => {
    const victims: CasualtyVictim[] = [
      { team: "away", rosterPlayerId: "a2" },
      { team: "away", rosterPlayerId: "a3" },
      { team: "home", rosterPlayerId: "h1" },
    ];
    const resolved = resolveCasualtyOutcomes(victims, [10, 16, 2]);
    expect(resolved).toHaveLength(3);
    // A short roll list leaves the missing victim unrunned (server supplies one per victim).
    const shortRun = resolveCasualtyOutcomes(victims, [10]);
    expect(shortRun).toHaveLength(3);
    expect(shortRun[1].outcome.kind).toBe("bruise"); // missing roll → 0 → bruise
  });

  it("maps each victim roll to its rulebook band (dead on 15-16)", () => {
    const victims: CasualtyVictim[] = [
      { team: "away", rosterPlayerId: "v1" },
      { team: "away", rosterPlayerId: "v2" },
    ];
    const resolved = resolveCasualtyOutcomes(victims, [16, 3]);
    expect(resolved[0]).toEqual({ team: "away", rosterPlayerId: "v1", outcome: { kind: "dead" } });
    expect(resolved[1]).toEqual({ team: "away", rosterPlayerId: "v2", outcome: { kind: "bruise" } });
  });

  it("returns no outcomes for an empty victim list", () => {
    expect(resolveCasualtyOutcomes([], [])).toHaveLength(0);
  });
});
