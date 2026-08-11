import { describe, expect, it } from "vitest";
import {
  buildMatchSummary,
  casualtyKindLabel,
  weatherLabel,
  type MatchDetail,
} from "./matchSummary";

// A played MatchDetail with full persisted data, mirroring the GET route's
// normalized payload ({fixture, result, homeTeam, awayTeam}).
function playedDetail(overrides: Partial<MatchDetail> = {}): MatchDetail {
  return {
    fixture: {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: "2026-02-01",
      scheduledAt: "2026-03-01",
      winnerId: "t1",
      homeScore: 2,
      awayScore: 1,
      status: "played",
      homeOwner: { id: "u1", name: "Coach A" },
      awayOwner: { id: "u2", name: "Coach B" },
      proposals: [],
    },
    result: {
      id: "mr1",
      fixtureId: "f1",
      weather: "perfect",
      scores: {
        home: {
          score: 2,
          postFf: 4,
          winnings: 45_000,
          casualties: [],
          pe: [
            { rosterPlayerId: "p1", pe: 7 },
            { rosterPlayerId: "p2", pe: 3 },
          ],
        },
        away: {
          score: 1,
          postFf: 2,
          winnings: 35_000,
          casualties: [],
          pe: [{ rosterPlayerId: "p3", pe: 3 }],
        },
        winnerId: "t1",
        mvp: { home: "p1", away: "p3" },
      },
      pettyCash: 150_000,
      loadedBy: "u1",
    },
    homeTeam: {
      id: "t1",
      name: "Reavers",
      raceId: "human",
      user: { id: "u1", name: "Coach A", email: "a@x", avatar: null },
      players: [
        { rosterPlayerId: "p1", name: "Blitzer A", positionalKey: "blitzer", pe: 7, skills: [], injuries: [], alive: true, valueBonus: 0 },
        { rosterPlayerId: "p2", name: "Thrower A", positionalKey: "thrower", pe: 3, skills: [], injuries: [], alive: true, valueBonus: 0 },
      ],
    },
    awayTeam: {
      id: "t2",
      name: "Dwarves",
      raceId: "dwarf",
      user: { id: "u2", name: "Coach B", email: "b@x", avatar: null },
      players: [
        { rosterPlayerId: "p3", name: "Blitzer B", positionalKey: "blitzer", pe: 3, skills: [], injuries: [], alive: true, valueBonus: 0 },
      ],
    },
    ...overrides,
  };
}

function sectionOf<T extends { type: string }>(
  summary: Awaited<ReturnType<typeof buildMatchSummary>>,
  type: T["type"],
): T | undefined {
  return summary.sections.find((s) => s.type === type) as T | undefined;
}

describe("buildMatchSummary — MVP (D5, MV-2)", () => {
  it("uses persisted scores.mvp when present (both sides)", () => {
    const s = buildMatchSummary(playedDetail());
    const mvp = sectionOf<{ type: "mvp"; home: { playerName: string; pe: number }; away: { playerName: string; pe: number } | null }>(s, "mvp");
    expect(mvp?.home).toEqual({ playerName: "Blitzer A", pe: 7 });
    // away persisted p3; its PE entry is 3.
    expect(mvp?.away).toEqual({ playerName: "Blitzer B", pe: 3 });
  });

  it("falls back to the per-team max-pe entry when scores.mvp is absent (floor 4, tie→first)", () => {
    const detail = playedDetail();
    // Legacy row: no persisted mvp. Home p1 (pe 7) and p2 (pe 3); away p3 (pe 3).
    if (detail.result) delete detail.result.scores.mvp;
    const s = buildMatchSummary(detail);
    const mvp = sectionOf<{ type: "mvp"; home: { playerName: string; pe: number } | null; away: { playerName: string; pe: number } | null }>(s, "mvp");
    // Home max-pe 7 (≥4) → p1. Away max-pe 3 (<4) → unresolved → omitted side.
    expect(mvp?.home).toEqual({ playerName: "Blitzer A", pe: 7 });
    expect(mvp?.away).toBeNull();
  });

  it("tie on max pe resolves to the FIRST entry in array order", () => {
    const detail = playedDetail();
    if (detail.result) {
      // p1 and p2 both carry pe 5 (tied max); p1 appears first → it wins.
      detail.result.scores.home.pe = [
        { rosterPlayerId: "p1", pe: 5 },
        { rosterPlayerId: "p2", pe: 5 },
      ];
      delete detail.result.scores.mvp;
    }
    const s = buildMatchSummary(detail);
    const mvp = sectionOf<{ type: "mvp"; home: { playerName: string; pe: number } | null }>(s, "mvp");
    expect(mvp?.home).toEqual({ playerName: "Blitzer A", pe: 5 });
  });

  it("omits the mvp section entirely when no side resolves (unresolved → omit-not-crash)", () => {
    const detail = playedDetail();
    if (detail.result) {
      delete detail.result.scores.mvp;
      detail.result.scores.home.pe = [{ rosterPlayerId: "ghost", pe: 9 }];
      detail.result.scores.away.pe = [{ rosterPlayerId: "ghost2", pe: 9 }];
    }
    const s = buildMatchSummary(detail);
    expect(s.sections.some((sec) => sec.type === "mvp")).toBe(false);
  });
});

describe("buildMatchSummary — labels (MV-2)", () => {
  it("maps weather kinds to Spanish and passes unknown codes through as-is", () => {
    expect(weatherLabel("heat")).toBe("Calor asfixiante");
    expect(weatherLabel("sunny")).toBe("Muy soleado");
    expect(weatherLabel("perfect")).toBe("Perfecto");
    expect(weatherLabel("rain")).toBe("Lluvioso");
    expect(weatherLabel("blizzard")).toBe("Ventisca");
    expect(weatherLabel("meteor")) // unknown/non-standard code
      .toBe("meteor");
  });

  it("maps casualty outcome kinds to rulebook labels", () => {
    expect(casualtyKindLabel("bruise")).toBe("Magullado");
    expect(casualtyKindLabel("apaleado")).toBe("Apaleado");
    expect(casualtyKindLabel("grave")).toBe("Herida grave");
    expect(casualtyKindLabel("permanent")).toBe("Permanente");
    expect(casualtyKindLabel("dead")).toBe("Muerto");
  });

  it("resolves casualties to victim names and kind labels", () => {
    const detail = playedDetail();
    if (detail.result) {
      // A casualty's `team` names the victim's team (where its Player row
      // lives): the home team's casualty section holds victims on `home`.
      detail.result.scores.home.casualties = [
        { team: "home", rosterPlayerId: "p1", outcome: { kind: "grave" } },
      ];
      detail.result.scores.away.casualties = [
        { team: "away", rosterPlayerId: "p3", outcome: { kind: "dead" } },
      ];
    }
    const s = buildMatchSummary(detail);
    const cas = sectionOf<{ type: "casualties"; items: { playerName: string | null; label: string }[] }>(s, "casualties");
    expect(cas?.items).toEqual(expect.arrayContaining([
      { playerName: "Blitzer B", label: "Muerto" },
      { playerName: "Blitzer A", label: "Herida grave" },
    ]));
  });
});

describe("buildMatchSummary — omit-if-empty + walkover (MV-2)", () => {
  it("omits scoreboard sections that are empty and keeps non-empty ones", () => {
    // A basic played detail: only score + teams + fans + winnings + weather + pe
    // are non-empty; no casualties means no casualties section.
    const s = buildMatchSummary(playedDetail());
    expect(s.sections.some((sec) => sec.type === "score")).toBe(true);
    expect(s.sections.some((sec) => sec.type === "teams")).toBe(true);
    expect(s.sections.some((sec) => sec.type === "weather")).toBe(true);
    expect(s.sections.some((sec) => sec.type === "casualties")).toBe(false);
  });

  it("omits the fans section when postFf is null on a side", () => {
    const detail = playedDetail();
    if (detail.result) {
      detail.result.scores.home.postFf = null;
      detail.result.scores.away.postFf = null;
    }
    const s = buildMatchSummary(detail);
    expect(s.sections.some((sec) => sec.type === "fans")).toBe(false);
  });

  it("omits the winnings section when winnings are null", () => {
    const detail = playedDetail();
    if (detail.result) {
      detail.result.scores.home.winnings = null;
      detail.result.scores.away.winnings = null;
    }
    const s = buildMatchSummary(detail);
    expect(s.sections.some((sec) => sec.type === "winnings")).toBe(false);
  });

  it("detects a walkover (scores set, no snapshot) → zero summary sections + walkover notice", () => {
    const detail: MatchDetail = {
      ...playedDetail(),
      result: null, // forfeit: no MatchResult row
      // fixture still carries scores → deriveFixtureStatus would say played
    };
    const s = buildMatchSummary(detail);
    expect(s.walkover).toBe(true);
    expect(s.sections).toHaveLength(0);
  });

  it("renders the winner name as the winning team, or 'Empate' on a draw", () => {
    const win = buildMatchSummary(playedDetail());
    const score = sectionOf<{ type: "score"; home: number; away: number; winnerName: string | null }>(win, "score");
    expect(score).toEqual({ type: "score", home: 2, away: 1, winnerName: "Reavers" });

    const draw = playedDetail();
    if (draw.result) {
      draw.result.scores.winnerId = null;
      draw.fixture.winnerId = null;
      draw.fixture.homeScore = 1;
      draw.fixture.awayScore = 1;
    }
    const drawSummary = buildMatchSummary(draw);
    const drawScore = sectionOf<{ type: "score"; winnerName: string | null }>(drawSummary, "score");
    expect(drawScore?.winnerName).toBe("Empate");
  });
});
