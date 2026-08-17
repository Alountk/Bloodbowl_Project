import { describe, expect, it } from "vitest";
import {
  buildMatchSummary,
  buildSummaryFeedRows,
  casualtyKindLabel,
  weatherLabel,
  formatReportDate,
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
      createdAt: "2026-03-01T21:00:00.000Z",
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
      live: null,
      liveWinnings: null,
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

describe("buildSummaryFeedRows — snapshot feed rows (MVT-4)", () => {
  it("builds the four summary rows from a snapshot (reported, winnings, fans, incentives)", () => {
    const rows = buildSummaryFeedRows(playedDetail());
    // Order is significant and matches the visual: reported first.
    expect(rows.map((r) => r.type)).toEqual(["reported", "winnings", "fans", "incentives"]);

    const reported = rows.find((r) => r.type === "reported") as { type: "reported"; date: string } | undefined;
    // The report date comes from the snapshot createdAt, formatted dd/MM/yyyy.
    expect(reported).toEqual({ type: "reported", date: "01/03/2026" });

    const winnings = rows.find((r) => r.type === "winnings") as { type: "winnings"; home: number; away: number } | undefined;
    expect(winnings).toEqual({ type: "winnings", home: 45_000, away: 35_000 });

    const fans = rows.find((r) => r.type === "fans") as { type: "fans"; home: number; away: number } | undefined;
    expect(fans).toEqual({ type: "fans", home: 4, away: 2 });

    const incentives = rows.find((r) => r.type === "incentives") as { type: "incentives"; team: "home"; value: number } | undefined;
    expect(incentives).toEqual({ type: "incentives", team: "home", value: 150_000 });
  });

  it("returns an empty array for a walkover (no snapshot, MV-2 guard)", () => {
    const detail: MatchDetail = { ...playedDetail(), result: null };
    expect(buildSummaryFeedRows(detail)).toEqual([]);
  });

  it("omits the winnings/fans/incentives rows when their snapshot data is null but keeps reported", () => {
    const detail = playedDetail();
    if (detail.result) {
      detail.result.scores.home.winnings = null;
      detail.result.scores.away.winnings = null;
      detail.result.scores.home.postFf = null;
      detail.result.scores.away.postFf = null;
      detail.result.pettyCash = null;
    }
    const rows = buildSummaryFeedRows(detail);
    expect(rows).toEqual([{ type: "reported", date: "01/03/2026" }]);
  });

  it("limits rows to the four summary kinds — MVP stays event-derived (MVT-4/MV-6)", () => {
    const rows = buildSummaryFeedRows(playedDetail());
    // The row union deliberately has NO mvp/pe kind (enforced by the type), so
    // the MVP rows are never duplicated here — they stay event-derived.
    const kinds = rows.map((r) => r.type);
    expect(kinds).toEqual(["reported", "winnings", "fans", "incentives"]);
  });

  it("formats the report date with zero-padded dd/MM/yyyy", () => {
    expect(formatReportDate("2026-07-21T09:05:00.000Z")).toBe("21/07/2026");
    expect(formatReportDate("2026-03-01T00:00:00.000Z")).toBe("01/03/2026");
  });
});

describe("RAU-44 — live winnings in the summary before the result is loaded", () => {
  it("buildSummaryFeedRows pushes the winnings row from liveWinnings when result is null", () => {
    const detail: MatchDetail = {
      ...playedDetail(),
      result: null,
      liveWinnings: { home: 55_000, away: 45_000 },
    };
    // Only the winnings row exists at live finish — no reported/fans/incentives
    // until the snapshot is loaded.
    expect(buildSummaryFeedRows(detail)).toEqual([{ type: "winnings", home: 55_000, away: 45_000 }]);
  });

  it("buildSummaryFeedRows returns [] for a live-finished match with no persisted winnings", () => {
    const detail: MatchDetail = { ...playedDetail(), result: null, liveWinnings: null };
    expect(buildSummaryFeedRows(detail)).toEqual([]);
  });

  it("buildSummaryFeedRows keeps preferring the snapshot rows once the result exists (liveWinnings ignored)", () => {
    const detail: MatchDetail = {
      ...playedDetail(),
      result: {
        ...(playedDetail().result as NonNullable<MatchDetail["result"]>),
        scores: {
          ...(playedDetail().result as NonNullable<MatchDetail["result"]>).scores,
          home: { ...(playedDetail().result as NonNullable<MatchDetail["result"]>).scores.home, winnings: 12_000 },
          away: { ...(playedDetail().result as NonNullable<MatchDetail["result"]>).scores.away, winnings: 8_000 },
        },
      },
      // Deliberately different from the snapshot — must be IGNORED.
      liveWinnings: { home: 99_999, away: 88_888 },
    };
    const rows = buildSummaryFeedRows(detail);
    const winnings = rows.find((r) => r.type === "winnings") as { type: "winnings"; home: number; away: number } | undefined;
    expect(winnings).toEqual({ type: "winnings", home: 12_000, away: 8_000 });
    expect(rows.map((r) => r.type)).toEqual(["reported", "winnings", "fans", "incentives"]);
  });

  it("buildMatchSummary renders the live winnings section when result is null and no fixture scores", () => {
    const detail: MatchDetail = {
      ...playedDetail(),
      result: null,
      fixture: { ...playedDetail().fixture, homeScore: null, awayScore: null, winnerId: null },
      liveWinnings: { home: 55_000, away: 45_000 },
    };
    const s = buildMatchSummary(detail);
    expect(s.walkover).toBe(false);
    expect(s.sections).toEqual([{ type: "winnings", home: 55_000, away: 45_000 }]);
  });

  it("buildMatchSummary keeps walkover semantics and still renders live winnings when scores are set (concede)", () => {
    const detail: MatchDetail = {
      ...playedDetail(), // fixture carries scores 2-1
      result: null,
      liveWinnings: { home: 30_000, away: 30_000 },
    };
    const s = buildMatchSummary(detail);
    expect(s.walkover).toBe(true);
    expect(s.sections).toEqual([{ type: "winnings", home: 30_000, away: 30_000 }]);
  });

  it("buildMatchSummary omits the winnings section when no result and no liveWinnings", () => {
    const detail: MatchDetail = { ...playedDetail(), result: null, liveWinnings: null };
    const s = buildMatchSummary(detail);
    expect(s.walkover).toBe(true);
    expect(s.sections).toEqual([]);
  });
});
