import { Suspense } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { act, render, screen, waitFor } from "@testing-library/react";
import { UiFlagProvider } from "@/lib/ui-flag";
import Page from "@/app/leagues/[id]/fixtures/[fixtureId]/page";
import type { MatchDetail } from "./api";

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
  });
});
