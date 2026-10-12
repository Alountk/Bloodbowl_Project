import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { AppProvider } from "@/app/providers/AppProvider";
import { UiFlagProvider } from "@/lib/ui-flag";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import { ArchiveGuardError } from "@/features/teams/store/ApiTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import type { Team } from "../types";
import { DEFAULT_COACHING } from "../types";
import { TeamsListViewV2 } from "./TeamsListViewV2";
import Page from "@/app/teams/page";

/**
 * TeamsListViewV2 + seam tests (tasks 1.1 and 2.1/2.5, UIR-2).
 *
 * Slice 1 pins the second declared seam (`app/teams/page.tsx`):
 *  - flag ON (`UiFlagProvider initialUiFlag`) → the V2 surface mounts
 *    (`ui-v2-teams-grid` + provider-backed team cards), the legacy surface
 *    never does;
 *  - flag OFF (provider absent OR `initialUiFlag={false}`) → the legacy
 *    `TeamsPage` mounts (`#teams-unassigned-heading`), V2 never does;
 *  - presentation-only: the V2 source must not import `features/teams/api`.
 *
 * Slice 2 (tasks 2.1 + 2.5) pins the FULL translation against the legacy
 * surface's observable behavior: sections split by `leagueId`, resolved
 * league badge, search filtering across both sections, header create CTA →
 * `/teams/create`, empty / no-match states, full card fields (emblem, name
 * link, race, TV, treasury), delete parity through the SAME store-handler
 * channel legacy uses (`removeTeam` + `TeamDeleteModal`, incl. the Spanish
 * 409 archive-guard copy), and NO legacy markers in markup or source.
 *
 * The legacy surface behind the seam fetches the league-name map (one
 * `listLeagues` call) and each TeamCard its own progression — both stubbed
 * (app/teams/page.test.tsx pattern).
 */
vi.mock("@/features/teams/api", () => ({
  fetchTeamProgression: vi.fn().mockResolvedValue([]),
}));
vi.mock("@/features/leagues/api", () => ({
  listLeagues: vi.fn().mockResolvedValue([]),
}));

import { listLeagues } from "@/features/leagues/api";
const listLeaguesMock = listLeagues as ReturnType<typeof vi.fn>;

/** One unassigned + one assigned team so BOTH sections render somewhere. */
const seededTeam: Team = {
  id: "team-1",
  name: "Reikland Reavers",
  raceId: "human",
  leagueId: null,
  coaching: { ...DEFAULT_COACHING },
  treasury: 0,
  roster: [],
};

const assignedTeam: Team = {
  id: "team-2",
  name: "Da Krumpaz",
  raceId: "orc",
  leagueId: "league-42",
  coaching: { ...DEFAULT_COACHING },
  treasury: 0,
  roster: [],
};

/** Third team (assigned, other race) so search can be checked ACROSS sections. */
const zonTeam: Team = {
  id: "team-3",
  name: "Zon Longbottom",
  raceId: "dwarf",
  leagueId: "league-42",
  coaching: { ...DEFAULT_COACHING },
  treasury: 0,
  roster: [],
};

/**
 * Roster-bearing team for the card-value test: 3 human linemen at 50 000 →
 * TV = roster 150 000 + coaching 0 = 150 000; treasury =
 * 1 000 000 starting − 150 000 roster = 850 000.
 */
const valueTeam: Team = {
  id: "team-9",
  name: "Crimson Crushers",
  raceId: "human",
  leagueId: null,
  coaching: { ...DEFAULT_COACHING },
  treasury: 0,
  roster: [
    { id: "c1", name: "Crusher One", positionalKey: "lineman" },
    { id: "c2", name: "Crusher Two", positionalKey: "lineman" },
    { id: "c3", name: "Crusher Three", positionalKey: "lineman" },
  ],
};

/** League row shape for the `listLeagues` stub (TeamsPage.test.tsx pattern). */
function league(id: string, name: string) {
  return {
    id,
    name,
    description: null,
    ownerId: "u1",
    createdAt: new Date().toISOString(),
    status: "open" as const,
    seasonLength: null,
    startedAt: null,
    championTeamId: null,
    ownerName: "Coach",
    memberCount: 1,
    isMember: false,
    turnClockEnabled: false,
    turnClockSeconds: 120 as const,
    rulesetId: null,
    rulesetName: null,
  };
}

beforeEach(() => {
  listLeaguesMock.mockReset();
  listLeaguesMock.mockResolvedValue([]);
});

/**
 * Renders the ROUTE PAGE (the seam itself) the way the root layout mounts it:
 * `AppProvider` for the team store, plus `UiFlagProvider` only when a flag
 * value is given (absent provider must fall back to legacy — UIR-1).
 */
function renderSeam(uiFlag?: boolean) {
  const page = <Page />;
  return render(
    <AppProvider store={new InMemoryTeamStore([seededTeam, assignedTeam])}>
      {uiFlag === undefined ? (
        page
      ) : (
        <UiFlagProvider initialUiFlag={uiFlag}>{page}</UiFlagProvider>
      )}
    </AppProvider>,
  );
}

/** Renders the V2 surface directly with a seeded store (or a custom one). */
function renderV2(teams: Team[], store?: TeamStore) {
  return render(
    <AppProvider store={store ?? new InMemoryTeamStore(teams)}>
      <TeamsListViewV2 />
    </AppProvider>,
  );
}

describe("teams list seam (UIR-2): app/teams/page.tsx", () => {
  it("flag ON: initialUiFlag mounts the V2 skeleton, never the legacy surface", async () => {
    renderSeam(true);

    expect(await screen.findByTestId("ui-v2-teams-grid")).toBeTruthy();
    // Provider data flows through the zero-props V2: the seeded team is
    // reachable (navigation parity with the legacy TeamCard link).
    expect(screen.getByTestId("ui-v2-teams-card-team-1")).toBeTruthy();
    // Never both surfaces: the legacy section heading id must not exist.
    expect(document.getElementById("teams-unassigned-heading")).toBeNull();
  });

  it("flag OFF without a provider: the legacy surface mounts, never V2", async () => {
    renderSeam();

    await waitFor(() =>
      expect(document.getElementById("teams-unassigned-heading")).toBeTruthy(),
    );
    expect(screen.queryByTestId("ui-v2-teams-grid")).toBeNull();
    expect(screen.queryByTestId("ui-v2-teams-card-team-1")).toBeNull();
  });

  it("flag OFF with the provider seeded false: the legacy surface mounts", async () => {
    renderSeam(false);

    await waitFor(() =>
      expect(document.getElementById("teams-unassigned-heading")).toBeTruthy(),
    );
    expect(screen.queryByTestId("ui-v2-teams-grid")).toBeNull();
    expect(screen.queryByTestId("ui-v2-teams-card-team-1")).toBeNull();
  });
});

describe("TeamsListViewV2 core (slice 1, zero props)", () => {
  it("renders the grid, both leagueId sections and the navigation rows with zero props", async () => {
    renderV2([seededTeam, assignedTeam]);

    expect(await screen.findByTestId("ui-v2-teams-grid")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-teams-section-unassigned")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-teams-section-assigned")).toBeTruthy();

    // Navigation rows: the detail route stays reachable from the V2 list —
    // the flag-ON e2e harness (and real flag-ON users) depend on it, since
    // the local store dies on reload and home/nav carry no team links.
    const card = screen.getByTestId("ui-v2-teams-card-team-1");
    const link = card.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/teams/team-1");
    // The full card carries the name among its content (slice 2 translation).
    expect(link?.textContent).toContain("Reikland Reavers");
    expect(screen.getByTestId("ui-v2-teams-card-team-2")).toBeTruthy();

    // Legacy heading ids are never reused by V2 (never-both vocabulary).
    expect(document.getElementById("teams-unassigned-heading")).toBeNull();
  });

  it("stays presentation-only: no features/teams/api import (UIR-2)", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const content = readFileSync(path.join(dir, "TeamsListViewV2.tsx"), "utf8");
    const specifiers = Array.from(content.matchAll(/from\s+["']([^"']+)["']/g)).map(
      (m) => m[1],
    );
    expect(
      specifiers.find((s) => s.endsWith("features/teams/api")),
      "TeamsListViewV2 must not import features/teams/api",
    ).toBeUndefined();
  });
});

describe("TeamsListViewV2 full translation (task 2.1)", () => {
  it("renders the Equipos header, the create CTA pointing to /teams/create, and both leagueId sections", async () => {
    renderV2([seededTeam, assignedTeam]);

    expect(await screen.findByTestId("ui-v2-teams-grid")).toBeTruthy();
    // Page header per Stitch "05 teams": title + primary CTA.
    expect(screen.getByRole("heading", { name: "Equipos", level: 1 })).toBeTruthy();
    const cta = screen.getByTestId("ui-v2-teams-create-cta");
    expect(cta.getAttribute("href")).toBe("/teams/create");
    // Section headings by leagueId (legacy parity copy).
    expect(screen.getByRole("heading", { name: "Sin liga" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "En liga" })).toBeTruthy();
  });

  it("hides a section whose leagueId bucket is empty", async () => {
    renderV2([seededTeam]);

    expect(await screen.findByRole("heading", { name: "Sin liga" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "En liga" })).toBeNull();
  });

  it("resolves the league badge for the assigned team from the shared league map", async () => {
    listLeaguesMock.mockResolvedValue([league("league-42", "Liga de Verano")]);
    renderV2([seededTeam, assignedTeam]);

    await waitFor(() => expect(screen.getByText("Liga de Verano")).toBeTruthy());
    // The badge lives on the assigned card only; unassigned has no badge.
    const assignedCard = screen.getByTestId("ui-v2-teams-card-team-2");
    expect(within(assignedCard).getByText("Liga de Verano")).toBeTruthy();
    const unassignedCard = screen.getByTestId("ui-v2-teams-card-team-1");
    expect(within(unassignedCard).queryByText("Liga de Verano")).toBeNull();
    // One shared listLeagues fetch — no per-team detail call (legacy parity).
    expect(listLeaguesMock).toHaveBeenCalledTimes(1);
  });

  it("renders the full card: emblem, name link, race, TV and treasury", async () => {
    renderV2([valueTeam]);

    const card = await screen.findByTestId("ui-v2-teams-card-team-9");
    // Emblem via TeamEmblem, exactly like the legacy card does.
    expect(within(card).getByTestId("emblem-team-9")).toBeTruthy();
    // Name link KEEPS the /teams/{id} href the e2e harness clicks.
    const link = card.querySelector("a");
    expect(link?.getAttribute("href")).toBe("/teams/team-9");
    expect(link?.textContent).toContain("Crimson Crushers");
    // Race resolves from the catalog.
    expect(within(card).getByText("Human")).toBeTruthy();
    // TV = roster 150 000 + coaching 0; treasury = 1 000 000 − 150 000.
    expect(
      within(card).getByTestId("ui-v2-teams-card-team-9-tv").textContent,
    ).toBe("150 000");
    expect(
      within(card).getByTestId("ui-v2-teams-card-team-9-treasury").textContent,
    ).toBe("850 000");
  });

  it("filters BOTH sections by the search query", async () => {
    renderV2([seededTeam, assignedTeam, zonTeam]);

    expect(await screen.findByText("Reikland Reavers")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/buscar equipos/i), {
      target: { value: "krumpaz" },
    });

    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.queryByText("Reikland Reavers")).toBeNull();
    expect(screen.queryByText("Zon Longbottom")).toBeNull();
  });

  it("shows the empty state with a create CTA when there are no teams", async () => {
    renderV2([]);

    const empty = await screen.findByTestId("ui-v2-teams-empty");
    expect(empty.textContent).toMatch(/no hay equipos todavía/i);
    const cta = within(empty).getByRole("link", { name: /crear equipo/i });
    expect(cta.getAttribute("href")).toBe("/teams/create");
    expect(screen.queryByTestId("ui-v2-teams-section-unassigned")).toBeNull();
    expect(screen.queryByTestId("ui-v2-teams-section-assigned")).toBeNull();
  });

  it("shows the no-match state when the search matches nothing", async () => {
    renderV2([seededTeam]);

    expect(await screen.findByText("Reikland Reavers")).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/buscar equipos/i), {
      target: { value: "zzzz" },
    });

    const noMatch = await screen.findByTestId("ui-v2-teams-no-match");
    expect(noMatch.textContent).toMatch(/ningún equipo coincide con tu búsqueda/i);
    expect(screen.queryByTestId("ui-v2-teams-card-team-1")).toBeNull();
  });

  it("never renders legacy markers at runtime (never both, UIR-2)", async () => {
    renderV2([seededTeam, assignedTeam]);

    await screen.findByTestId("ui-v2-teams-card-team-1");
    expect(document.getElementById("teams-unassigned-heading")).toBeNull();
    expect(document.getElementById("teams-assigned-heading")).toBeNull();
    expect(document.getElementById("teams-heading")).toBeNull();
    expect(document.querySelector('[data-testid="team-ctv"]')).toBeNull();
    expect(document.querySelector('[data-testid="team-treasury"]')).toBeNull();
  });

  it("never references legacy markers in its source (never-both vocabulary)", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const content = readFileSync(path.join(dir, "TeamsListViewV2.tsx"), "utf8");
    expect(content).not.toMatch(
      /teams-unassigned-heading|teams-assigned-heading|team-ctv|team-treasury|id="teams-heading"/,
    );
  });
});

describe("TeamsListViewV2 — delete parity (task 2.5)", () => {
  it("card delete opens the modal with the Spanish copy; confirming removes the team through the store channel", async () => {
    renderV2([seededTeam, assignedTeam]);

    expect(await screen.findByText("Reikland Reavers")).toBeTruthy();

    // Same accessible name convention as the legacy TeamCard control.
    fireEvent.click(screen.getByRole("button", { name: "Eliminar Reikland Reavers" }));

    // The reused TeamDeleteModal carries the irreversible Spanish copy.
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("heading", { name: "Reikland Reavers" })).toBeTruthy();
    expect(dialog.textContent).toMatch(/esta acción no se puede deshacer/i);

    // Confirm fires the SAME handler channel legacy TeamsPage wires: removeTeam
    // (store.remove) from useApp.
    fireEvent.click(within(dialog).getByRole("button", { name: "Eliminar" }));

    await waitFor(() => expect(screen.queryByText("Reikland Reavers")).toBeNull());
    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("surfaces the Spanish 409 archive-guard copy with the league name from the map", async () => {
    listLeaguesMock.mockResolvedValue([league("league-42", "Liga de Verano")]);

    // Store that rejects archiving a league member (legacy TeamsPage.test.tsx
    // GuardedStore pattern — same ArchiveGuardError channel).
    const guardTeams: Team[] = [assignedTeam];
    class GuardedStore implements TeamStore {
      list(): Promise<Team[]> {
        return Promise.resolve([...guardTeams]);
      }
      save(_team: Team): Promise<Team> {
        void _team;
        throw new Error("not needed");
      }
      remove(id: string): Promise<void> {
        const team = guardTeams.find((t) => t.id === id);
        if (team?.leagueId) {
          return Promise.reject(new ArchiveGuardError("expel first"));
        }
        return Promise.resolve();
      }
    }
    renderV2([], new GuardedStore());

    await waitFor(() => expect(screen.getByText("Da Krumpaz")).toBeTruthy());

    fireEvent.click(screen.getByRole("button", { name: "Eliminar Da Krumpaz" }));
    fireEvent.click(within(await screen.findByRole("dialog")).getByRole("button", { name: "Eliminar" }));

    await waitFor(() =>
      expect(
        screen.getByText(
          "No se puede borrar este equipo — pertenece a la liga Liga de Verano. Para poder borrarlo, primero expulsalo de la liga.",
        ),
      ).toBeTruthy(),
    );
    // Guard resolved from the shared map — only the single listLeagues call.
    expect(listLeaguesMock).toHaveBeenCalledTimes(1);
    // A single acknowledgement button; the team is NOT removed.
    expect(screen.getByRole("button", { name: "Entendido" })).toBeTruthy();
    expect(screen.getAllByText("Da Krumpaz").length).toBeGreaterThanOrEqual(1);
  });
});
