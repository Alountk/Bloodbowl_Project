import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { UiFlagProvider } from "@/lib/ui-flag";
import Page from "@/app/leagues/[id]/fixtures/[fixtureId]/page";
import type { MatchDetail, LiveMatchView } from "./api";

// `MatchView` reads the session to derive the viewer's side (D19) — mock the
// same way `MatchView.test.tsx` does so the legacy surface renders.
vi.mock("next-auth/react", () => ({
  useSession: vi.fn(() => ({ data: { user: { id: "u1" } } })),
}));

/**
 * MatchViewV2 + seam tests (tasks 1.1 and 1.3, UIR-2).
 *
 * Slice 1 pins the SIXTH declared seam (`app/leagues/[id]/fixtures/[fixtureId]/page.tsx`):
 *  - flag ON (`UiFlagProvider initialUiFlag`) → `MatchViewV2` mounts
 *    (`ui-v2-match-*` vocabulary), the legacy surface never does
 *    (`rulebook-header` absent — never both);
 *  - flag OFF (provider absent OR `initialUiFlag={false}`) → the legacy
 *    `MatchView` mounts (`rulebook-header` present after detail loads), V2
 *    never does;
 *  - both surfaces take `{leagueId, fixtureId}` (the route passes both) — the
 *    fetch assertion pins the identical props contract by effect.
 *
 * The V2 is presentation-only: it reuses the legacy surface's OWN machinery
 * (`getMatchDetail` → single `GET /api/leagues/{id}/fixtures/{fid}`,
 * `useLeague` → `GET /api/leagues/{id}`) — no new fetch, no duplicated
 * loading/not-found/error semantics. Assertions run in the ES dictionary (bare
 * `useI18n()` fallback; match copy is Spanish per AGENTS.md).
 *
 * No flag-ON e2e test walks the fixture route today (traced — design.md S7):
 * `createTeamAndOpenList` ends on `/teams`, the dashboard V2 next-match card
 * is never clicked, and the 9 fixture specs are flag-OFF, so the contract here
 * is the surface itself; the flag-ON e2e cases goto directly (cookie first).
 */

afterEach(() => {
  vi.unstubAllGlobals();
});

/** A pending fixture (no scheduled date, no live row) — the consent baseline. */
function pendingDetail(): MatchDetail {
  return {
    fixture: {
      id: "f1",
      leagueId: "l1",
      round: 1,
      homeTeamId: "t1",
      awayTeamId: "t2",
      createdAt: "2026-02-01",
      scheduledAt: null,
      winnerId: null,
      status: "pending",
      homeOwner: { id: "u1", name: "Coach A" },
      awayOwner: { id: "u2", name: "Coach B" },
      proposals: [],
    },
    result: null,
    homeTeam: {
      id: "t1",
      name: "Reavers",
      raceId: "human",
      user: { id: "u1", name: "Coach A", email: "a@x", avatar: null },
      players: [
        {
          rosterPlayerId: "p1",
          name: "Blitzer A",
          positionalKey: "blitzer",
          pe: 3,
          skills: [],
          injuries: [],
          alive: true,
          missNextMatch: false,
          valueBonus: 0,
        },
      ],
    },
    awayTeam: {
      id: "t2",
      name: "Dwarves",
      raceId: "dwarf",
      user: { id: "u2", name: "Coach B", email: "b@x", avatar: null },
      players: [
        {
          rosterPlayerId: "p3",
          name: "Blitzer B",
          positionalKey: "blitzer",
          pe: 3,
          skills: [],
          injuries: [],
          alive: true,
          missNextMatch: false,
          valueBonus: 0,
        },
      ],
    },
    live: null,
    liveWinnings: null,
  };
}

function ok(body: unknown) {
  return Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
}

/**
 * URL-routed stub mirroring the legacy channel: the fixture GET (detail) and
 * the league GET (`useLeague`); everything else 404s. Pass `fixtureResponse`
 * to simulate the fixture outcome (404 → not-found, 500 → error).
 */
function stubMatchFetch(fixtureResponse?: { status: number; body: unknown }) {
  // ONE stable response object per stub (the `MatchView.test.tsx`
  // `stubMatch(detail)` pattern): the bare `useI18n()` fallback returns a new
  // `t` per render, so `useMatchDetail`'s effect re-runs after each detail
  // state change — returning a FRESH object every call would loop forever
  // (setDetail always differs). Same object → React bails out → loop ends.
  const detail = pendingDetail();
  const league = { id: "l1", name: "North Reikland", ownerId: "u1", status: "open" };
  const fetchMock = vi.fn((input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/leagues/l1/fixtures/f1") {
      if (fixtureResponse != null) {
        const { status, body } = fixtureResponse;
        return Promise.resolve({
          ok: status >= 200 && status < 300,
          status,
          json: () => Promise.resolve(body),
        });
      }
      return ok(detail);
    }
    if (url === "/api/leagues/l1") {
      return ok(league);
    }
    return Promise.resolve({
      ok: false,
      status: 404,
      json: () => Promise.resolve({ error: "Not found" }),
    });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/**
 * Renders the ROUTE PAGE (the seam itself) the way the root layout mounts it,
 * plus `UiFlagProvider` only when a flag value is given (absent provider must
 * fall back to legacy — UIR-1). Session stub mirrors `MatchView.test.tsx`.
 */
async function renderSeam(uiFlag?: boolean) {
  const fetchMock = stubMatchFetch();
  // Suspense boundary like `app/leagues/[id]/page.test.tsx`: `use(params)`
  // suspends on the unresolved params promise, so the render must flush inside
  // an async act for the legacy surface to commit.
  const page = (
    <Suspense fallback={null}>
      <Page params={Promise.resolve({ id: "l1", fixtureId: "f1" })} />
    </Suspense>
  );
  let result!: ReturnType<typeof render>;
  await act(async () => {
    result = render(
      uiFlag === undefined ? (
        page
      ) : (
        <UiFlagProvider initialUiFlag={uiFlag}>{page}</UiFlagProvider>
      ),
    );
  });
  // Return the FETCH stub (tests assert the props contract through the URLs
  // it received); `screen`/`document` cover the rendered output.
  void result;
  return fetchMock;
}

/** Fetch URL proving `{leagueId, fixtureId}` reached the surface unchanged. */
const DETAIL_URL = "/api/leagues/l1/fixtures/f1";

describe("live match seam (UIR-2): app/leagues/[id]/fixtures/[fixtureId]/page.tsx", () => {
  it("flag ON: initialUiFlag mounts the V2 surface, never the legacy one", async () => {
    const fetchMock = await renderSeam(true);

    expect(await screen.findByTestId("ui-v2-match-header")).toBeTruthy();
    // Never both: the legacy sticky header testid must not exist.
    expect(document.querySelector('[data-testid="rulebook-header"]')).toBeNull();
    expect(document.querySelector('[data-testid^="ui-v2-match-"]')).toBeTruthy();
    // Identical props contract: the route passed {leagueId, fixtureId} on.
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]) === DETAIL_URL)).toBe(true),
    );
  });

  it("flag OFF without a provider: the legacy surface mounts, never V2", async () => {
    const fetchMock = await renderSeam();

    expect(await screen.findByTestId("rulebook-header")).toBeTruthy();
    expect(document.querySelector('[data-testid^="ui-v2-match-"]')).toBeNull();
    await waitFor(() =>
      expect(fetchMock.mock.calls.some((call) => String(call[0]) === DETAIL_URL)).toBe(true),
    );
  });

  it("flag OFF with the provider seeded false: the legacy surface mounts", async () => {
    await renderSeam(false);

    expect(await screen.findByTestId("rulebook-header")).toBeTruthy();
    expect(document.querySelector('[data-testid^="ui-v2-match-"]')).toBeNull();
  });
});

/** Dynamic import with a NON-literal specifier: vite defers resolution, so the
 *  seam tests above still execute while `MatchViewV2.tsx` is absent (RED). */
async function mountV2(fixtureResponse?: { status: number; body: unknown }) {
  stubMatchFetch(fixtureResponse);
  const spec = "./MatchViewV2";
  const { MatchViewV2 } = await import(/* @vite-ignore */ spec);
  return render(<MatchViewV2 leagueId="l1" fixtureId="f1" />);
}

describe("MatchViewV2 core (slice 1 — skeleton on the legacy channel)", () => {
  it("loads the detail through the SAME channel and renders header + score strip", async () => {
    await mountV2();

    const header = await screen.findByTestId("ui-v2-match-header");
    expect(header.textContent).toContain("North Reikland");
    const score = screen.getByTestId("ui-v2-match-score");
    expect(score.textContent).toContain("Reavers");
    expect(score.textContent).toContain("Dwarves");
  });

  it("shows the loading zone until the detail resolves", async () => {
    // Never-resolving fetch: the skeleton must render its loading zone.
    vi.stubGlobal("fetch", vi.fn(() => new Promise(() => {})));
    const spec = "./MatchViewV2";
    const { MatchViewV2 } = await import(/* @vite-ignore */ spec);
    render(<MatchViewV2 leagueId="l1" fixtureId="f1" />);

    expect(screen.getByTestId("ui-v2-match-loading")).toBeTruthy();
  });

  it("not-found parity: a 404 collapses to the legacy copy (match.notFound)", async () => {
    await mountV2({ status: 404, body: { error: "Not found" } });

    const zone = await screen.findByTestId("ui-v2-match-not-found");
    expect(zone.textContent).toContain("Partido no encontrado.");
    // Legacy back link kept (parity with the legacy not-found panel).
    expect(document.querySelector('a[href="/leagues"]')).toBeTruthy();
    expect(document.querySelector('[data-testid^="ui-v2-match-header"]')).toBeNull();
  });

  it("error parity: a 500 surfaces readJson's message (Request failed (500))", async () => {
    await mountV2({ status: 500, body: {} });

    const zone = await screen.findByTestId("ui-v2-match-error");
    expect(zone.textContent).toMatch(/Request failed \(500\)/);
    expect(document.querySelector('[data-testid^="ui-v2-match-header"]')).toBeNull();
  });

  it("stays on the legacy channel: source imports the legacy machinery, not new fetch", async () => {
    const { readFileSync } = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const content = readFileSync(path.join(dir, "MatchViewV2.tsx"), "utf8");

    // Presentation-only (UIR-2): reuses the legacy surface's own channel; the
    // endpoint fetch lives ONLY in `features/leagues/api.ts` (used by
    // `getMatchDetail`, which legacy itself imports).
    expect(content).toContain("getMatchDetail");
    expect(content).toContain("useLeague");
    expect(content).not.toMatch(/\bfetch\s*\(/);
    // Never-both vocabulary: legacy testids are never emitted by V2 source.
    expect(content).not.toMatch(
      /data-testid="rulebook-header"|data-testid="mini-strip"|data-testid="share-link"/,
    );
    // Slice 2 (task 2.1) — the machinery whitelist is imported, and the
    // remaining legacy-surface testids (summary/score/journeymen/dock-legacy
    // vocabulary, shared-atom testids rendered ONLY by the atoms themselves)
    // never appear in V2's own source.
    expect(content).toContain("useLiveMatch");
    expect(content).toContain("MatchTimelineBar");
    expect(content).toContain("LiveEventCardsActa");
    expect(content).toContain("LiveActionDock");
    expect(content).toContain("MatchResolveModal");
    expect(content).toContain("ResetLiveMatchModal");
    expect(content).toContain("buildMatchSummary");
    expect(content).toContain("buildSummaryFeedRows");
    expect(content).toContain("createShareLink");
    expect(content).not.toMatch(
      /data-testid="summary-row|data-testid="score-|data-testid="journeymen-notice"|data-testid="inducement-purchase"|data-testid="turn-reason-chip"/,
    );
  });
});

/**
 * Slice 2 (task 2.1) — the FULL surface across the pending/ready/live/finished
 * states, wired to the shared atoms. Each test pins one zone through the SAME
 * channel legacy uses (`sendLiveCommand` → POST `/live`, `createShareLink` →
 * POST `/share`, `resetLiveMatch` → POST `/reset`): no new data paths (UIR-2),
 * V2 vocabulary only (`ui-v2-match-*`), assertions in the ES dictionary.
 */

/** A full live row (state + feed) shaped like the fixture GET's `live` DTO. */
function resolutionState(): LiveMatchView["resolutionState"] {
  const side = {
    step: "winnings",
    fansDone: false,
    fans: null,
    mvpConfirmed: false,
    mvpRolled: false,
    casualtiesDone: false,
    journeymenDone: false,
  } as const;
  return { home: { ...side }, away: { ...side } };
}

function liveRow(overrides: Partial<LiveMatchView> = {}): LiveMatchView {
  const events: LiveMatchView["events"] = [
    { seq: 1, kind: "turnStart", side: "home", playerRosterId: null, half: 1, turnNumber: 1, payload: {}, at: 1000 },
    { seq: 2, kind: "turnStart", side: "away", playerRosterId: null, half: 1, turnNumber: 2, payload: {}, at: 60000 },
  ];
  return {
    seq: 2,
    status: "live",
    half: 1,
    turnNumber: 3,
    activeSide: "home",
    homeConsented: true,
    awayConsented: true,
    viewerSide: "home",
    startedAt: 1000,
    elapsed: 120000,
    homeTurnMs: 60000,
    awayTurnMs: 60000,
    paused: false,
    homeScore: 1,
    awayScore: 0,
    finishedAt: null,
    concedeProposedBy: null,
    mvpNominations: { home: null, away: null },
    resolutionState: resolutionState(),
    events,
    ...overrides,
  };
}

/** `pendingDetail()` + a live row + a scheduled fixture (the startable shape). */
function detailWithLive(live: LiveMatchView): MatchDetail {
  const base = pendingDetail();
  return {
    ...base,
    fixture: { ...base.fixture, status: "scheduled", scheduledAt: "2026-03-01T20:00:00" },
    live,
  };
}

/** A played fixture WITH the persisted snapshot (buildMatchSummary sections). */
function playedDetail(): MatchDetail {
  const base = pendingDetail();
  return {
    ...base,
    fixture: {
      ...base.fixture,
      status: "played",
      scheduledAt: "2026-03-01T20:00:00",
      homeScore: 2,
      awayScore: 1,
      winnerId: "t1",
    },
    result: {
      id: "mr1",
      fixtureId: "f1",
      weather: "heat",
      scores: {
        home: { score: 2, postFf: 4, winnings: 45_000, casualties: [], pe: [{ rosterPlayerId: "p1", pe: 7 }] },
        away: { score: 1, postFf: 2, winnings: 35_000, casualties: [], pe: [] },
        winnerId: "t1",
        mvp: { home: "p1", away: "p3" },
      },
      pettyCash: 150_000,
      loadedBy: "u1",
      createdAt: "2026-03-01T21:00:00.000Z",
    },
    live: null,
  };
}

/** A played fixture WITHOUT a snapshot — the walkover/forfeit shape. */
function walkoverDetail(): MatchDetail {
  const base = pendingDetail();
  return {
    ...base,
    fixture: {
      ...base.fixture,
      status: "played",
      scheduledAt: null,
      homeScore: 2,
      awayScore: 0,
      winnerId: "t1",
    },
    result: null,
    live: null,
  };
}

/**
 * URL-routed stub covering the FULL surface: the fixture/league GETs plus the
 * three shared POST channels (`/live` commands, `/share`, `/reset`). Every
 * response is a stable object (unstable detail objects × the bare-i18n `t` re-
 * render loop — slice-1 lesson).
 */
function stubFullFetch(detail: MatchDetail, commandView?: LiveMatchView) {
  const league = { id: "l1", name: "North Reikland", ownerId: "u1", status: "open" };
  const fetchMock = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    const method = init?.method ?? "GET";
    const json = (body: unknown) => Promise.resolve({ ok: true, status: 200, json: () => Promise.resolve(body) });
    if (method === "POST" && url.endsWith("/live")) {
      return json({ view: commandView ?? liveRow() });
    }
    if (method === "POST" && url.endsWith("/share")) {
      return json({ token: "share-token" });
    }
    if (method === "POST" && url.endsWith("/reset")) {
      return json({ ok: true });
    }
    if (url === "/api/leagues/l1/fixtures/f1") return json(detail);
    if (url === "/api/leagues/l1") return json(league);
    return Promise.resolve({ ok: false, status: 404, json: () => Promise.resolve({ error: "Not found" }) });
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

/** Mounts V2 directly against a full-surface stub; returns the fetch mock. */
async function mountV2Detail(detail: MatchDetail, commandView?: LiveMatchView) {
  const fetchMock = stubFullFetch(detail, commandView);
  const spec = "./MatchViewV2";
  const { MatchViewV2 } = await import(/* @vite-ignore */ spec);
  render(<MatchViewV2 leagueId="l1" fixtureId="f1" />);
  return fetchMock;
}

/** The parsed JSON body of the FIRST POST to `url` (assertion helper). The
 *  share POST (channel parity with `createShareLink`) carries NO body → `{}`. */
function postBody(fetchMock: ReturnType<typeof stubFullFetch>, url: string): unknown {
  const call = fetchMock.mock.calls.find(
    ([u, init]) => String(u) === url && (init as RequestInit | undefined)?.method === "POST",
  );
  expect(call).toBeDefined();
  const raw = (call![1] as RequestInit | undefined)?.body;
  return raw == null ? {} : JSON.parse(String(raw));
}

describe("MatchViewV2 full surface (slice 2, task 2.1 — consent/acta/timeline/summary/share)", () => {
  it("consent zone: a startable fixture offers the consent start control and POSTs consent", async () => {
    // No live row + session u1 owns the home side → viewerSide "home".
    const fetchMock = await mountV2Detail(pendingDetail(), liveRow({ status: "pending", homeConsented: true, startedAt: null, events: [] }));

    const zone = await screen.findByTestId("ui-v2-match-consent");
    expect(zone.textContent).toContain("Partido sin programar");
    fireEvent.click(screen.getByRole("button", { name: "Iniciar partido" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([u, init]) => String(u) === "/api/leagues/l1/fixtures/f1/live" && (init as RequestInit | undefined)?.method === "POST",
        ),
      ).toBe(true),
    );
    expect(postBody(fetchMock, "/api/leagues/l1/fixtures/f1/live")).toEqual({ type: "consent", side: "home" });
  });

  it("consent zone ready: both consented offers begin and POSTs the begin command", async () => {
    const fetchMock = await mountV2Detail(
      detailWithLive(liveRow({ status: "ready", startedAt: null, events: [] })),
      liveRow(),
    );

    expect(await screen.findByTestId("ui-v2-match-consent")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Empezar partido" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u, init]) => String(u).endsWith("/live") && (init as RequestInit | undefined)?.method === "POST"),
      ).toBe(true),
    );
    expect(postBody(fetchMock, "/api/leagues/l1/fixtures/f1/live")).toEqual({ type: "begin" });
  });

  it("live zone: timeline, acta feed and the action dock come from the shared atoms (endTurn through the dock)", async () => {
    const fetchMock = await mountV2Detail(detailWithLive(liveRow()));

    // MatchTimelineBar (shared atom) — started match with a feed.
    expect(await screen.findByTestId("match-timeline")).toBeTruthy();
    // LiveEventCardsActa (shared atom) — both feed rows render.
    expect((await screen.findAllByTestId("live-event-row")).length).toBe(2);
    // V2 zones wrap the atoms (never-both vocabulary).
    expect(screen.getByTestId("ui-v2-match-timeline")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-match-acta")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-match-dock")).toBeTruthy();

    // LiveActionDock wiring: active home coach → pass-turn → reason → POST.
    fireEvent.click(screen.getByRole("button", { name: "Dar el turno" }));
    const modal = await screen.findByTestId("live-action-modal");
    fireEvent.click(within(modal).getByRole("button", { name: "Voluntario" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u, init]) => String(u).endsWith("/live") && (init as RequestInit | undefined)?.method === "POST"),
      ).toBe(true),
    );
    expect(postBody(fetchMock, "/api/leagues/l1/fixtures/f1/live")).toEqual({
      type: "endTurn",
      side: "home",
      reason: "voluntary",
    });
  });

  it("live zone: the non-active coach gets the turn request control (POST requestTurn)", async () => {
    const fetchMock = await mountV2Detail(detailWithLive(liveRow({ activeSide: "away" })));

    fireEvent.click(await screen.findByRole("button", { name: "Pedir turno" }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(([u, init]) => String(u).endsWith("/live") && (init as RequestInit | undefined)?.method === "POST"),
      ).toBe(true),
    );
    expect(postBody(fetchMock, "/api/leagues/l1/fixtures/f1/live")).toEqual({ type: "requestTurn" });
  });

  it("finished summary rows: the reported snapshot rows render from buildSummaryFeedRows", async () => {
    await mountV2Detail({ ...playedDetail(), live: liveRow({ status: "finished", finishedAt: 999_000 }) });

    const zone = await screen.findByTestId("ui-v2-match-summary");
    const reported = await screen.findByTestId("ui-v2-match-summary-reported");
    expect(reported.textContent).toContain("Partido reportado");
    // Winnings + fans rows at minimum (45.000 / +4 …).
    expect(screen.getAllByTestId("ui-v2-match-summary-row").length).toBeGreaterThanOrEqual(2);
    expect(zone.textContent).toContain("Ganancias");
    // Never-both: the legacy row testids never appear in V2.
    expect(document.querySelector('[data-testid="summary-row-reported"]')).toBeNull();
    expect(document.querySelector('[data-testid="summary-row"]')).toBeNull();
  });

  it("finished unresolved: the resume banner opens the shared resolve modal", async () => {
    const base = detailWithLive(liveRow({ status: "finished", finishedAt: 999_000 }));
    await mountV2Detail({ ...base, result: null });

    const banner = await screen.findByTestId("ui-v2-match-resolve-banner");
    expect(banner.textContent).toContain("Informar del fin del partido");
    fireEvent.click(within(banner).getByRole("button", { name: "Reanudar" }));

    expect(await screen.findByRole("dialog", { name: "Resolver partido" })).toBeTruthy();
  });

  it("share/reset bar parity: share POSTs /share and flips Copiado; reset confirms through the shared modal", async () => {
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockResolvedValue(undefined) },
      configurable: true,
    });
    try {
      const fetchMock = await mountV2Detail(
        detailWithLive(liveRow({ status: "pending", homeConsented: false, awayConsented: false, startedAt: null, events: [] })),
      );

      const share = await screen.findByTestId("ui-v2-match-share");
      expect(share.textContent).toBe("Compartir");
      fireEvent.click(share);
      await waitFor(() => expect(screen.getByTestId("ui-v2-match-share").textContent).toBe("Copiado"));
      expect(postBody(fetchMock, "/api/leagues/l1/fixtures/f1/share")).toEqual({});

      fireEvent.click(screen.getByTestId("ui-v2-match-reset"));
      expect(await screen.findByRole("dialog", { name: "Reiniciar partido en vivo" })).toBeTruthy();
      fireEvent.click(screen.getByRole("button", { name: "Sí, reiniciar" }));
      await waitFor(() =>
        expect(
          fetchMock.mock.calls.some(([u, init]) => String(u).endsWith("/reset") && (init as RequestInit | undefined)?.method === "POST"),
        ).toBe(true),
      );
      await waitFor(() => expect(screen.queryByRole("dialog", { name: "Reiniciar partido en vivo" })).toBeNull());
    } finally {
      Reflect.deleteProperty(navigator, "clipboard");
    }
  });

  it("walkover: a played fixture without a snapshot renders the forfeit panel", async () => {
    await mountV2Detail(walkoverDetail());

    const zone = await screen.findByTestId("ui-v2-match-walkover");
    expect(zone.textContent).toContain("Victoria por incomparecencia.");
    expect(zone.textContent).toContain("2");
    // No live chrome on a walkover (legacy renders no turn/clock header here).
    expect(document.querySelector('[data-testid="ui-v2-match-consent"]')).toBeNull();
    expect(document.querySelector('[data-testid="ui-v2-match-timeline"]')).toBeNull();
  });

  it("played summary: the reported result renders buildMatchSummary sections", async () => {
    await mountV2Detail(playedDetail());

    const zone = await screen.findByTestId("ui-v2-match-played");
    expect(zone.textContent).toContain("Reavers"); // score/teams section
    expect(zone.textContent).toContain("Calor asfixiante"); // weather section (ES)
    expect(zone.textContent).toContain("Ganancias");
    // Never-both: no consent/live chrome on a report-only fixture.
    expect(document.querySelector('[data-testid="ui-v2-match-consent"]')).toBeNull();
    expect(document.querySelector('[data-testid="ui-v2-match-dock"]')).toBeNull();
  });
});
