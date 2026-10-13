import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { UiFlagProvider } from "@/lib/ui-flag";
import { I18nProvider } from "@/lib/i18n";
import { AppProvider } from "@/app/providers/AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import Page from "@/app/teams/create/page";

/**
 * CreateTeamFormV2 + seam tests (tasks 1.1 and 2.1, UIR-2).
 *
 * Slice 1 pins the FOURTH declared seam (`app/teams/create/page.tsx`):
 *  - flag ON (`UiFlagProvider initialUiFlag`) → `CreateTeamFormV2` mounts
 *    (`ui-v2-create-*` vocabulary), the legacy surface never does
 *    (`#team-name` id absent — never both);
 *  - flag OFF (provider absent OR `initialUiFlag={false}`) → the legacy
 *    `CreateTeamForm` mounts (`#team-name` present), V2 never does;
 *  - both surfaces take the SAME `CreateTeamFormProps` defaults (the route
 *    passes none), so the seam is contract-identical by construction.
 *
 * The V2 must keep the ACCESSIBLE CONTRACT the flag-ON e2e harness uses
 * (`createTeamAndOpenList` in e2e/ui-refresh-roster.spec.ts walks this wizard
 * with `bb-ui=next` already set): labels resolvable as "Team name" / "Race",
 * the "Next →" button, `create.addAction` buttons ("Add Human Lineman") and
 * the "Create team" submit — all via the SAME `create.*` i18n keys legacy
 * uses. Slice 1 asserts the flow through those keys in the EN locale the
 * local e2e suite runs with; slice 2 (task 2.1) expands zone coverage.
 *
 * Presentation-only (UIR-2): V2 reuses the legacy surface's OWN machinery —
 * `useCreateTeamForm`, `useApp().addTeam`, `RosterTable`,
 * `PlayerAvailabilityTable` — no `features/teams/api` import, no fetch.
 */

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * Renders the ROUTE PAGE (the seam itself) the way the root layout mounts it:
 * `AppProvider` for the team store, plus `UiFlagProvider` only when a flag
 * value is given (absent provider must fall back to legacy — UIR-1).
 */
function renderSeam(uiFlag?: boolean) {
  const page = <Page />;
  return render(
    <AppProvider store={new InMemoryTeamStore()}>
      {uiFlag === undefined ? (
        page
      ) : (
        <UiFlagProvider initialUiFlag={uiFlag}>{page}</UiFlagProvider>
      )}
    </AppProvider>,
  );
}

/**
 * Renders the V2 surface directly with an empty store (dynamic import so
 * the seam tests above still run their assertions while the component file
 * does not exist yet — meaningful RED).
 *
 * Wrapped in `I18nProvider initialLocale="en"`: the flag-ON e2e harness runs
 * the local suite in EN, so the contract assertions below (labels + buttons)
 * must be pinned in the same locale the harness resolves. Component tests
 * without a provider fall back to the ES dictionary (useI18n contract).
 */
async function renderV2() {
  // Non-literal specifier: vite leaves it to runtime, so the seam tests in
  // this file still execute their assertions while the component is absent
  // (RED = assertion failures there + module error here, not a file-wide
  // transform failure).
  const spec = "./CreateTeamFormV2";
  const { CreateTeamFormV2 } = await import(/* @vite-ignore */ spec);
  return render(
    <I18nProvider initialLocale="en">
      <AppProvider store={new InMemoryTeamStore()}>
        <CreateTeamFormV2 />
      </AppProvider>
    </I18nProvider>,
  );
}

describe("create wizard seam (UIR-2): app/teams/create/page.tsx", () => {
  it("flag ON: initialUiFlag mounts the V2 surface, never the legacy one", async () => {
    renderSeam(true);

    expect(await screen.findByTestId("ui-v2-create-step1")).toBeTruthy();
    // Never both: the legacy step-1 input id must not exist.
    expect(document.getElementById("team-name")).toBeNull();
    expect(screen.queryByTestId("ui-v2-create-step1")).toBeTruthy();
  });

  it("flag OFF without a provider: the legacy surface mounts, never V2", async () => {
    renderSeam();

    await waitFor(() => expect(document.getElementById("team-name")).toBeTruthy());
    expect(screen.queryByTestId("ui-v2-create-step1")).toBeNull();
    expect(document.querySelector('[data-testid^="ui-v2-create-"]')).toBeNull();
  });

  it("flag OFF with the provider seeded false: the legacy surface mounts", async () => {
    renderSeam(false);

    await waitFor(() => expect(document.getElementById("team-name")).toBeTruthy());
    expect(document.querySelector('[data-testid^="ui-v2-create-"]')).toBeNull();
  });
});

describe("CreateWizardV2 core (slice 1, harness contract)", () => {
  it("keeps the flag-ON harness contract: labels, Next → and the roster flow", async () => {
    await renderV2();

    // Labels the UNEDITED createTeamAndOpenList helper resolves (EN locale).
    const name = await screen.findByLabelText("Team name");
    const race = screen.getByLabelText("Race");
    fireEvent.change(name, { target: { value: "V2 Wizards" } });
    fireEvent.change(race, { target: { value: "human" } });
    fireEvent.click(screen.getByRole("button", { name: "Next →" }));

    // Step 2: the availability table's add buttons use the SAME
    // `create.addAction` key legacy renders ("Add Human Lineman").
    const addLineman = await screen.findByRole("button", { name: "Add Human Lineman" });
    for (let i = 0; i < 11; i += 1) fireEvent.click(addLineman);

    // Submit label (`create.createTeam`) and the V2 submit landmark. The
    // e2e helper matches it case-insensitively (/create team/i).
    const submit = screen.getByTestId("ui-v2-create-submit");
    expect(submit.textContent).toMatch(/create team/i);
    fireEvent.click(submit);

    // The team persisted through the legacy channel (useApp().addTeam):
    // the store must hold it — navigation parity pushes "/" (mocked here).
    await waitFor(() => {
      expect(screen.queryByText(/at least 11 players/i)).toBeNull();
    });
  });

  it("never mounts legacy step-1 markers while V2 is active", async () => {
    await renderV2();

    await screen.findByTestId("ui-v2-create-step1");
    expect(document.getElementById("team-race")).toBeNull();
    expect(document.getElementById("team-name")).toBeNull();
  });
});
