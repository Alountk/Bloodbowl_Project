import { describe, expect, it, vi } from "vitest";
import { PE_MVP } from "./rules/pe";
import {
  resolutionWinningsSeen,
  resolutionFanRoll,
  resolutionAdvance,
  resolutionMvpConfirm,
  resolutionMvpReveal,
  resolutionCasualtiesDone,
  resolutionJourneymenDone,
  resolveLiveMatch,
  type StoreDeps,
} from "./liveStore";
import type { LiveMatch, LiveEvent, Prisma } from "@prisma/client";
import type { ResolutionState } from "./liveMatch";

/**
 * The per-side RESOLUTION WIZARD store tests: each coach advances THEIR OWN
 * side independently (winnings → fans → mvp → mvp-done → casualties →
 * journeymen → done) and every step action persists the side's progress so a
 * refresh resumes at the current step. The fan roll is server-owned + applied
 * to `coaching.dedicatedFans`; the MVP reveal waits for BOTH sides' confirms;
 * the casualties step visibly applies the side's Player-row outcomes; the
 * journeymen step requires the fielded Novatos to be decided first. The match
 * closes ONLY when BOTH sides reach "done" (`resolveLiveMatch` wizard path);
 * a legacy row without the wizard keeps the full old close.
 */

/** Returns successive values in call order (each call consumes the next roll). */
function fixedRolls(rolls: number[]): () => number {
  let i = 0;
  return () => rolls[i++];
}

function emptySide(overrides: Partial<ResolutionState["home"]> = {}): ResolutionState["home"] {
  return {
    step: "winnings",
    fansDone: false,
    fans: null,
    mvpConfirmed: false,
    mvpRolled: false,
    casualtiesDone: false,
    journeymenDone: false,
    ...overrides,
  };
}

const homeRoster = ["h1", "h2", "h3", "h4", "h5", "h6"].map((id, i) => ({
  id,
  name: `Home ${i + 1}`,
  positionalKey: "lineman",
}));
const awayRoster = ["a1", "a2", "a3", "a4", "a5", "a6"].map((id, i) => ({
  id,
  name: `Away ${i + 1}`,
  positionalKey: "lineman",
}));

const coaching = { rerolls: 2, dedicatedFans: 2, assistantCoaches: 0, cheerleaders: 0, apothecary: false };

function teamRow(side: "home" | "away") {
  const ids = side === "home" ? homeRoster.map((p) => p.id) : awayRoster.map((p) => p.id);
  return {
    id: `${side}-t`,
    raceId: "human",
    roster: side === "home" ? homeRoster : awayRoster,
    coaching: side === "home" ? coaching : { ...coaching, dedicatedFans: 1 },
    treasury: 50000,
    players: ids.map((rosterPlayerId) => ({
      rosterPlayerId,
      valueBonus: 0,
      alive: true,
      missNextMatch: false,
    })),
  };
}

const homeNom = ["h1", "h2", "h3", "h4", "h5", "h6"];
const awayNom = ["a1", "a2", "a3", "a4", "a5", "a6"];

/** The finished LiveMatch row (normal end: fixture NOT closed, score 1-0). */
type FinishedRowOverrides = Partial<Omit<LiveMatch, "resolutionState">> & {
  events?: LiveEvent[];
  resolutionState?: unknown;
};

function finishedRow(overrides: FinishedRowOverrides = {}): LiveMatch & { events: LiveEvent[] } {
  return {
    id: "lm-1",
    fixtureId: "f-1",
    status: "finished",
    half: 2,
    turnNumber: 8,
    activeSide: "home",
    homeClock: 240,
    awayClock: 240,
    homeScore: 1,
    awayScore: 0,
    homeConsented: true,
    awayConsented: true,
    startedAt: new Date(0),
    homeTurnMs: 0,
    awayTurnMs: 0,
    seq: 12,
    paused: false,
    clockStartedAt: null,
    finishedAt: new Date(5000),
    concedeProposedBy: null,
    winnings: { home: 55000, away: 45000 },
    pendingResolution: null,
    mvpNominations: { home: homeNom, away: awayNom },
    journeymen: null,
    resolutionState: overrides.resolutionState ?? {
      home: emptySide(),
      away: emptySide(),
    },
    createdAt: new Date(0),
    updatedAt: new Date(0),
    events: [
      { id: "e1", liveMatchId: "lm-1", seq: 1, kind: "start", side: null, playerRosterId: null, half: 1, turnNumber: 1, payload: {}, createdAt: new Date(0) },
      { id: "e2", liveMatchId: "lm-1", seq: 2, kind: "td", side: "home", playerRosterId: "h1", half: 1, turnNumber: 3, payload: {}, createdAt: new Date(1000) },
      { id: "e3", liveMatchId: "lm-1", seq: 3, kind: "completion", side: "home", playerRosterId: "h2", half: 1, turnNumber: 4, payload: { spp: 1 }, createdAt: new Date(2000) },
      { id: "e4", liveMatchId: "lm-1", seq: 4, kind: "casualty", side: "home", playerRosterId: "h3", half: 1, turnNumber: 5, payload: { victimRosterId: "h3", causerRosterId: "a1", band: "apaleado" }, createdAt: new Date(3000) },
      { id: "e5", liveMatchId: "lm-1", seq: 5, kind: "endMatch", side: null, playerRosterId: null, half: 2, turnNumber: 8, payload: {}, createdAt: new Date(4000) },
    ],
    ...overrides,
  } as LiveMatch & { events: LiveEvent[] };
}

interface WizardDeps {
  deps: StoreDeps;
  liveMatchFindFirst: ReturnType<typeof vi.fn>;
  liveMatchUpdateMany: ReturnType<typeof vi.fn>;
  matchResultFindUnique: ReturnType<typeof vi.fn>;
  matchResultCreate: ReturnType<typeof vi.fn>;
  teamFindMany: ReturnType<typeof vi.fn>;
  teamUpdateMany: ReturnType<typeof vi.fn>;
  playerFindMany: ReturnType<typeof vi.fn>;
  playerUpdateMany: ReturnType<typeof vi.fn>;
  fixtureFindUnique: ReturnType<typeof vi.fn>;
  fixtureUpdate: ReturnType<typeof vi.fn>;
  fixtureFindMany: ReturnType<typeof vi.fn>;
  leagueFindUnique: ReturnType<typeof vi.fn>;
  leagueUpdate: ReturnType<typeof vi.fn>;
  liveEventAggregate: ReturnType<typeof vi.fn>;
  liveEventCreateMany: ReturnType<typeof vi.fn>;
  publish: ReturnType<typeof vi.fn>;
}

function makeDeps(opts: {
  row?: LiveMatch & { events: LiveEvent[] };
  matchResult?: { id: string } | null;
  fixture?: { homeScore: number | null; awayScore: number | null; winnerId: string | null } | null;
  leagueStatus?: "open" | "started" | "finished";
  playerRows?: { teamId: string; rosterPlayerId: string; injuries: Prisma.JsonValue | null; alive: boolean }[];
  rolls?: { d6?: number[] };
} = {}): WizardDeps {
  const {
    row = finishedRow(),
    matchResult = null,
    fixture = { homeScore: null, awayScore: null, winnerId: null },
    leagueStatus = "started",
    playerRows = [
      { teamId: "home-t", rosterPlayerId: "h3", injuries: [], alive: true },
      { teamId: "away-t", rosterPlayerId: "a1", injuries: [], alive: true },
    ],
    rolls = {},
  } = opts;

  const liveMatchFindFirst = vi.fn().mockResolvedValue(row);
  const liveMatchUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const matchResultFindUnique = vi.fn().mockResolvedValue(matchResult);
  const matchResultCreate = vi.fn().mockResolvedValue({ id: "mr-1" });
  const fixtureFindUnique = vi.fn().mockResolvedValue({
    homeTeamId: "home-t",
    awayTeamId: "away-t",
    homeScore: fixture?.homeScore ?? null,
    awayScore: fixture?.awayScore ?? null,
    winnerId: fixture?.winnerId ?? null,
  });
  const fixtureUpdate = vi.fn().mockResolvedValue({ id: "f-1" });
  const fixtureFindMany = vi.fn().mockResolvedValue([
    { homeTeamId: "home-t", awayTeamId: "away-t", homeScore: 1, awayScore: 0, winnerId: "home-t" },
  ]);
  const teamFindMany = vi
    .fn()
    .mockImplementation((args: { where: { id: { in: string[] } } }) =>
      Promise.resolve(
        [teamRow("home"), teamRow("away")].filter((t) => args.where.id.in.includes(t.id)),
      ),
    );
  const teamUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const playerFindMany = vi.fn().mockResolvedValue(playerRows);
  const playerUpdateMany = vi.fn().mockResolvedValue({ count: 1 });
  const leagueFindUnique = vi.fn().mockResolvedValue({ status: leagueStatus });
  const leagueUpdate = vi.fn().mockResolvedValue({});
  const liveEventAggregate = vi.fn().mockResolvedValue({ _max: { seq: 5 } });
  const liveEventCreateMany = vi.fn().mockResolvedValue({ count: 2 });
  const publish = vi.fn();

  const tx = {
    liveMatch: { updateMany: liveMatchUpdateMany, create: vi.fn(), findUnique: vi.fn().mockResolvedValue({ winnings: null }) },
    liveEvent: { create: vi.fn(), aggregate: liveEventAggregate, createMany: liveEventCreateMany },
    team: { updateMany: teamUpdateMany, findMany: teamFindMany },
    matchResult: { findUnique: matchResultFindUnique, create: matchResultCreate },
    player: { findMany: playerFindMany, updateMany: playerUpdateMany },
    fixture: { update: fixtureUpdate, findMany: fixtureFindMany, findUnique: fixtureFindUnique },
    league: { findUnique: leagueFindUnique, update: leagueUpdate },
  };
  const $transaction = vi
    .fn()
    .mockImplementation(async <T>(fn: (t: typeof tx) => Promise<T>) => fn(tx));
  const deps: StoreDeps = {
    prisma: {
      $transaction,
      liveMatch: { create: vi.fn(), findFirst: liveMatchFindFirst },
      liveEvent: { findFirst: vi.fn(), update: vi.fn() },
    },
    hub: { publish },
    ...(rolls.d6 ? { rollD6: fixedRolls(rolls.d6) } : {}),
  };

  return {
    deps,
    liveMatchFindFirst,
    liveMatchUpdateMany,
    matchResultFindUnique,
    matchResultCreate,
    fixtureFindUnique,
    fixtureUpdate,
    fixtureFindMany,
    teamFindMany,
    teamUpdateMany,
    playerFindMany,
    playerUpdateMany,
    leagueFindUnique,
    leagueUpdate,
    liveEventAggregate,
    liveEventCreateMany,
    publish,
  };
}

const baseInput = {
  fixtureId: "f-1",
  teamId: "home-t",
  leagueId: "l-1",
  homeTeamId: "home-t",
  awayTeamId: "away-t",
  loadedBy: "u1",
  now: 9000,
};

async function expectStatus409(promise: Promise<unknown>, message: string) {
  await expect(promise).rejects.toMatchObject({ status: 409, message });
}

describe("resolutionWinningsSeen — step 1 display advance (persisted cursor)", () => {
  it("advances the OWN side from 'winnings' to 'fans' AND COLLECTS its finish-time winnings into the treasury", async () => {
    const { deps, liveMatchUpdateMany, teamUpdateMany } = makeDeps();
    const view = await resolutionWinningsSeen({ ...baseInput, side: "home" }, deps);
    expect(view.view.resolutionState.home.step).toBe("fans");
    expect(view.view.resolutionState.away.step).toBe("winnings");
    const write = liveMatchUpdateMany.mock.calls.find(([call]) => call.data?.resolutionState);
    expect(write![0].data.resolutionState.home.step).toBe("fans");
    expect(write![0].data.seq).toBe(13);
    // The finish-time winnings land in THIS side's treasury (per-side, so the
    // step-5 hire can afford the lineman cost before the both-done close).
    const treasury = teamUpdateMany.mock.calls.map((c) => c[0]).find((call) => call.data?.treasury?.increment);
    expect(treasury).toMatchObject({ where: { id: "home-t" }, data: { treasury: { increment: 55000 } } });
  });

  it("is an idempotent no-op once the side already advanced past 'winnings'", async () => {
    const row = finishedRow({
      resolutionState: { home: emptySide({ step: "mvp", fansDone: true }), away: emptySide() },
    });
    const { deps, liveMatchUpdateMany, teamUpdateMany } = makeDeps({ row });
    const view = await resolutionWinningsSeen({ ...baseInput, side: "home" }, deps);
    expect(view.view.resolutionState.home.step).toBe("mvp");
    expect(liveMatchUpdateMany).not.toHaveBeenCalled();
    expect(teamUpdateMany).not.toHaveBeenCalled();
  });

  it("rejects a finished match that is already resolved (409)", async () => {
    const { deps } = makeDeps({ matchResult: { id: "mr-1" } });
    await expectStatus409(
      resolutionWinningsSeen({ ...baseInput, side: "home" }, deps),
      "already resolved",
    );
  });
});

describe("resolutionFanRoll — the server-owned dedicated-fans roll (step 2)", () => {
  it("rolls 1D6 server-side, applies it to coaching.dedicatedFans and persists the roll", async () => {
    const { deps, teamUpdateMany, liveMatchUpdateMany } = makeDeps({ rolls: { d6: [4] } });
    // Home won 1-0, dedicated fans 2: 1D6 4 ≥ 2 → +1 → 3, direction up.
    const result = await resolutionFanRoll({ ...baseInput, side: "home" }, deps);
    expect(result.fans).toEqual({ roll: 4, before: 2, after: 3, direction: "up" });
    // The team's coaching JSON is updated with the new dedicated fans value.
    const fanWrite = teamUpdateMany.mock.calls.find(([call]) => call.data?.coaching);
    expect(fanWrite![0].where.id).toBe("home-t");
    expect(fanWrite![0].data.coaching.dedicatedFans).toBe(3);
    // The cursor persists fansDone + the roll (the step stays "fans").
    const write = liveMatchUpdateMany.mock.calls.find(([call]) => call.data?.resolutionState);
    expect(write![0].data.resolutionState.home.fansDone).toBe(true);
    expect(write![0].data.resolutionState.home.fans).toEqual({ roll: 4, before: 2, after: 3, direction: "up" });
    expect(write![0].data.resolutionState.home.step).toBe("fans");
  });

  it("derives DOWN for a loss (1D6 < FF → −1, min 1)", async () => {
    // Away lost (0-1), dedicated fans 1: any 1D6 < 1 is impossible → stays 1.
    const { deps } = makeDeps({ rolls: { d6: [1] } });
    const result = await resolutionFanRoll({ ...baseInput, side: "away", teamId: "away-t" }, deps);
    expect(result.fans!.direction).toBe("stay");
    expect(result.fans!.after).toBe(1);
  });

  it("never re-rolls once fansDone (idempotent) and returns the persisted roll", async () => {
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "fans", fansDone: true, fans: { roll: 3, before: 2, after: 2, direction: "stay" } }),
        away: emptySide(),
      },
    });
    const { deps, liveMatchUpdateMany } = makeDeps({ row, rolls: { d6: [6] } });
    const result = await resolutionFanRoll({ ...baseInput, side: "home" }, deps);
    expect(result.fans).toEqual({ roll: 3, before: 2, after: 2, direction: "stay" });
    expect(liveMatchUpdateMany).not.toHaveBeenCalled();
  });
});

describe("resolutionAdvance — the fans→mvp continue (step 2 → step 3)", () => {
  it("advances to 'mvp' only after the fan roll (fansDone)", async () => {
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "fans", fansDone: true, fans: { roll: 4, before: 2, after: 3, direction: "up" } }),
        away: emptySide(),
      },
    });
    const { deps } = makeDeps({ row });
    const view = await resolutionAdvance({ ...baseInput, side: "home", step: "mvp" }, deps);
    expect(view.view.resolutionState.home.step).toBe("mvp");
    expect(view.view.resolutionState.home.fansDone).toBe(true);
  });

  it("rejects an advance to 'mvp' before the fan roll (409)", async () => {
    const { deps } = makeDeps();
    await expectStatus409(
      resolutionAdvance({ ...baseInput, side: "home", step: "mvp" }, deps),
      "fan roll first",
    );
  });
});

describe("resolutionMvpConfirm — the FINAL confirm (irrevocable, step 3 → mvp-done)", () => {
  it("locks the side's picks: sets mvpConfirmed + step 'mvp-done'", async () => {
    const row = finishedRow({
      resolutionState: { home: emptySide({ step: "mvp" }), away: emptySide() },
    });
    const { deps } = makeDeps({ row });
    const view = await resolutionMvpConfirm({ ...baseInput, side: "home" }, deps);
    expect(view.view.resolutionState.home.mvpConfirmed).toBe(true);
    expect(view.view.resolutionState.home.step).toBe("mvp-done");
  });

  it("rejects the confirm before the side nominated (409)", async () => {
    const row = finishedRow({
      resolutionState: { home: emptySide({ step: "mvp" }), away: emptySide() },
      mvpNominations: { home: null, away: awayNom },
    });
    const { deps } = makeDeps({ row });
    await expectStatus409(
      resolutionMvpConfirm({ ...baseInput, side: "home" }, deps),
      "nominate first",
    );
  });

  it("is idempotent once confirmed", async () => {
    const row = finishedRow({
      resolutionState: { home: emptySide({ step: "mvp-done", mvpConfirmed: true }), away: emptySide() },
    });
    const { deps, liveMatchUpdateMany } = makeDeps({ row });
    await resolutionMvpConfirm({ ...baseInput, side: "home" }, deps);
    expect(liveMatchUpdateMany).not.toHaveBeenCalled();
  });
});

describe("resolutionMvpReveal — the BOTH-sides reveal (step 4 gate)", () => {
  function bothConfirmedRow() {
    return finishedRow({
      resolutionState: {
        home: emptySide({ step: "mvp-done", fansDone: true, mvpConfirmed: true }),
        away: emptySide({ step: "mvp-done", fansDone: true, mvpConfirmed: true }),
      },
    });
  }

  it("waits for BOTH sides' confirms (409 while the rival has not confirmed)", async () => {
    const row = finishedRow({
      resolutionState: { home: emptySide({ step: "mvp-done", mvpConfirmed: true }), away: emptySide({ step: "mvp" }) },
    });
    const { deps } = makeDeps({ row });
    await expectStatus409(
      resolutionMvpReveal({ ...baseInput, side: "home" }, deps),
      "both sides must confirm",
    );
  });

  it("rolls the server-owned MVP 1D6 per side, persists the grantees and advances BOTH sides to 'casualties'", async () => {
    const { deps, liveMatchUpdateMany } = makeDeps({
      row: bothConfirmedRow(),
      rolls: { d6: [3, 5] },
    });
    const result = await resolutionMvpReveal({ ...baseInput, side: "home" }, deps);
    // computeMvpGrantee: 1D6 over the six nominations — roll 3 → 3rd nominee.
    expect(result.mvp).toEqual({ home: "h3", away: "a5" });
    const write = liveMatchUpdateMany.mock.calls.find(([call]) => call.data?.resolutionState);
    expect(write![0].data.resolutionState.home.mvpRolled).toBe(true);
    expect(write![0].data.resolutionState.home.step).toBe("casualties");
    expect(write![0].data.resolutionState.away.step).toBe("casualties");
    // The rolled grantees persist as pendingResolution.mvp (reused at the close).
    const pendingWrite = liveMatchUpdateMany.mock.calls.find(([call]) => call.data?.pendingResolution);
    expect(pendingWrite![0].data.pendingResolution).toEqual({ mvp: { home: "h3", away: "a5" } });
  });

  it("is idempotent once the MVP is already rolled", async () => {
    const row = bothConfirmedRow();
    (row as LiveMatch & { events: LiveEvent[] }).resolutionState = {
      home: emptySide({ step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true }),
      away: emptySide({ step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true }),
    } as unknown as LiveMatch["resolutionState"];
    (row as LiveMatch & { events: LiveEvent[] }).pendingResolution = { mvp: { home: "h2", away: "a4" } } as never;
    const { deps, liveMatchUpdateMany } = makeDeps({ row });
    const result = await resolutionMvpReveal({ ...baseInput, side: "home" }, deps);
    expect(result.mvp).toEqual({ home: "h2", away: "a4" });
    expect(liveMatchUpdateMany).not.toHaveBeenCalled();
  });
});

describe("resolutionCasualtiesDone — the visible roster-state update (step 4 → journeymen)", () => {
  it("applies the side's casualty outcomes to the Player rows and advances to 'journeymen'", async () => {
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true }),
        away: emptySide({ step: "casualties", fansDone: true, mvpConfirmed: true, mvpRolled: true }),
      },
    });
    const { deps, playerUpdateMany, liveMatchUpdateMany } = makeDeps({ row });
    const view = await resolutionCasualtiesDone({ ...baseInput, side: "home" }, deps);
    expect(view.view.resolutionState.home.casualtiesDone).toBe(true);
    expect(view.view.resolutionState.home.step).toBe("journeymen");
    // The lasting victim (h3, apaleado) is flagged missNextMatch on the OWN team.
    const writes = playerUpdateMany.mock.calls;
    expect(writes.length).toBeGreaterThan(0);
    expect(writes.some(([where]) => where.where.teamId === "home-t")).toBe(true);
    const write = liveMatchUpdateMany.mock.calls.find(([call]) => call.data?.resolutionState);
    expect(write![0].data.resolutionState.home.journeymenDone).toBe(false);
  });

  it("is idempotent once the casualties were seen", async () => {
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true }),
        away: emptySide(),
      },
    });
    const { deps, playerUpdateMany, liveMatchUpdateMany } = makeDeps({ row });
    await resolutionCasualtiesDone({ ...baseInput, side: "home" }, deps);
    expect(playerUpdateMany).not.toHaveBeenCalled();
    expect(liveMatchUpdateMany).not.toHaveBeenCalled();
  });
});

describe("resolutionJourneymenDone — the LAST step (step 5 → done)", () => {
  it("rejects 'done' while the side still has undecided fielded journeymen (409)", async () => {
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true }),
        away: emptySide(),
      },
    });
    (row as LiveMatch & { events: LiveEvent[] }).journeymen = {
      home: [{ id: "journeyman-home-t-1", name: "Aldric" }],
      away: [],
    };
    const { deps } = makeDeps({ row });
    await expectStatus409(
      resolutionJourneymenDone({ ...baseInput, side: "home" }, deps),
      "decide the novatos first",
    );
  });

  it("completes the side (step 'done') once every fielded novato was decided", async () => {
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true }),
        away: emptySide(),
      },
    });
    (row as LiveMatch & { events: LiveEvent[] }).journeymen = { home: [], away: [] };
    const { deps } = makeDeps({ row });
    const view = await resolutionJourneymenDone({ ...baseInput, side: "home" }, deps);
    expect(view.view.resolutionState.home.journeymenDone).toBe(true);
    expect(view.view.resolutionState.home.step).toBe("done");
    expect(view.view.resolutionState.away.step).toBe("winnings");
  });

  it("AUTO-CLOSES the match when the LAST side reaches 'done' — MatchResult + fixture + league close in the SAME transaction (both-sides close)", async () => {
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "journeymen", fansDone: true, fans: { roll: 4, before: 2, after: 3, direction: "up" }, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true }),
        away: emptySide({ step: "done", fansDone: true, fans: { roll: 2, before: 1, after: 1, direction: "stay" }, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true }),
      },
    });
    (row as LiveMatch & { events: LiveEvent[] }).journeymen = { home: [], away: [] };
    (row as LiveMatch & { events: LiveEvent[] }).pendingResolution = { mvp: { home: "h2", away: "a4" } } as never;
    const { deps, matchResultCreate, fixtureUpdate, leagueUpdate, liveEventCreateMany } = makeDeps({ row });
    const view = await resolutionJourneymenDone(
      { ...baseInput, side: "home", leagueId: "l-1", homeTeamId: "home-t", awayTeamId: "away-t", loadedBy: "u1" },
      deps,
    );
    expect(view.view.resolutionState.home.step).toBe("done");
    // The close committed in the SAME transaction as the completion: the report
    // row, the idempotent fixture close, the RAU-40 league close + the MVP rows.
    expect(matchResultCreate).toHaveBeenCalledTimes(1);
    expect(fixtureUpdate).toHaveBeenCalled();
    expect(leagueUpdate).toHaveBeenCalled();
    expect(liveEventCreateMany).toHaveBeenCalledTimes(1);
    // The persisted rolls were reused (never re-rolled): the snapshot carries
    // the per-side fan rolls from `resolutionState.fans`.
    const report = matchResultCreate.mock.calls[0][0].data.scores as {
      home: { postFf: number };
      away: { postFf: number };
    };
    expect(report.home.postFf).toBe(3);
    expect(report.away.postFf).toBe(1);
  });

  it("does NOT close while the rival has not reached 'done' (independence)", async () => {
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true }),
        away: emptySide({ step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true }),
      },
    });
    (row as LiveMatch & { events: LiveEvent[] }).journeymen = { home: [], away: [] };
    const { deps, matchResultCreate } = makeDeps({ row });
    const view = await resolutionJourneymenDone(
      { ...baseInput, side: "home", leagueId: "l-1", homeTeamId: "home-t", awayTeamId: "away-t", loadedBy: "u1" },
      deps,
    );
    expect(view.view.resolutionState.home.step).toBe("done");
    expect(view.view.resolutionState.away.step).toBe("journeymen");
    // No close yet — the rival still has the journeymen step open.
    expect(matchResultCreate).not.toHaveBeenCalled();
  });
});

describe("resolveLiveMatch — the both-sides close (wizard path)", () => {
  function bothDoneRow(overrides: { pendingMvp?: { home: string; away: string } } = {}) {
    const { pendingMvp = { home: "h2", away: "a4" } } = overrides;
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "done", fansDone: true, fans: { roll: 4, before: 2, after: 3, direction: "up" }, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true }),
        away: emptySide({ step: "done", fansDone: true, fans: { roll: 2, before: 1, after: 1, direction: "stay" }, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true }),
      },
    });
    (row as LiveMatch & { events: LiveEvent[] }).pendingResolution = { mvp: pendingMvp } as never;
    return row as LiveMatch & { events: LiveEvent[] };
  }

  const resolveInput = {
    fixtureId: "f-1",
    leagueId: "l-1",
    homeTeamId: "home-t",
    awayTeamId: "away-t",
    loadedBy: "u1",
    now: 9000,
  };

  it("rejects the close while a side has NOT reached 'done' (409)", async () => {
    const row = finishedRow({
      resolutionState: {
        home: emptySide({ step: "journeymen", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true }),
        away: emptySide({ step: "done", fansDone: true, mvpConfirmed: true, mvpRolled: true, casualtiesDone: true, journeymenDone: true }),
      },
    });
    const { deps } = makeDeps({ row });
    await expectStatus409(resolveLiveMatch(resolveInput, deps), "resolution incomplete");
  });

  it("closes when BOTH sides are done: MatchResult + winnings treasury + PE/MVP awards, WITHOUT re-applying fans or casualties", async () => {
    const { deps, matchResultCreate, teamUpdateMany, playerUpdateMany, liveEventCreateMany, fixtureUpdate, leagueUpdate } = makeDeps({
      row: bothDoneRow(),
      rolls: { d6: [1, 1] }, // unused in the wizard path — the persisted rolls win
    });
    const resolved = await resolveLiveMatch(resolveInput, deps);
    expect(resolved.status).toBe("played");
    expect(resolved.mvp).toEqual({ home: "h2", away: "a4" });
    // The wizard path reuses the persisted per-side fan rolls (never re-rolls).
    expect(resolved.postFf).toEqual({ home: 3, away: 1 });
    expect(resolved.ffRoll.home).toEqual({ roll: 4, direction: "up" });
    // The report writes the closure snapshot.
    expect(matchResultCreate).toHaveBeenCalledTimes(1);
    const scores = matchResultCreate.mock.calls[0][0].data.scores as {
      home: { postFf: number; winnings: number };
      away: { postFf: number; winnings: number };
    };
    expect(scores.home.postFf).toBe(3);
    expect(scores.home.winnings).toBe(55000);
    // NO treasury increment in the close — the finish-time winnings were
    // collected PER-SIDE at step 1 (the wizard close never re-applies them).
    const treasuryUpdates = teamUpdateMany.mock.calls.map((c) => c[0]);
    expect(treasuryUpdates.some((call) => call.data?.treasury?.increment)).toBe(false);
    const peWrites = playerUpdateMany.mock.calls.map((c) => c[0]).filter((call) => call.where.teamId === "home-t");
    // The MVP grantee h2 (completion ★1 + the +4 MVP) and h1 (TD ★3) both land.
    const h2Write = peWrites.find((call) => call.data.pe?.increment === 1 + PE_MVP);
    expect(h2Write).toBeTruthy();
    // The MVP events append + the fixture closes + maybeCloseLeague runs.
    expect(liveEventCreateMany).toHaveBeenCalledTimes(1);
    expect(fixtureUpdate).toHaveBeenCalled();
    expect(leagueUpdate).toHaveBeenCalled();
    // NO dedicated-fans write (the per-side fans step already applied it) and
    // NO casualty injury writes (the per-side casualties step already applied
    // them) — the close only does the closure.
    expect(treasuryUpdates.some((call) => call.data.coaching)).toBe(false);
  });

  it("keeps the LEGACY full close for a row WITHOUT the wizard (resolutionState null)", async () => {
    const row = finishedRow();
    (row as LiveMatch & { events: LiveEvent[] }).resolutionState = null;
    const { deps, teamUpdateMany } = makeDeps({
      row,
      rolls: { d6: [2, 4, 3, 1] }, // homeMvp, awayMvp, homeFf, awayFf
    });
    const resolved = await resolveLiveMatch(resolveInput, deps);
    expect(resolved.status).toBe("played");
    // The legacy path applies the dedicated-fans change itself.
    const treasuryUpdates = teamUpdateMany.mock.calls.map((c) => c[0]);
    expect(treasuryUpdates.some((call) => call.data.coaching)).toBe(true);
  });
});
