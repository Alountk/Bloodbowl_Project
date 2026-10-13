import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
 * uses. Assertions run in the EN locale the local e2e suite resolves.
 *
 * Slice 2 (task 2.1) pins the FINISHED V2 surface against the legacy parity
 * contract: every step-2 zone (roster, availability, budget, COACHING, submit),
 * the Stitch stepper + budget card chrome, the race-change confirmation
 * dialog, validation errors identical to legacy (name required, min players,
 * budget), success navigating home through the legacy channel, and the
 * presentation-only source contract (no `features/teams/api`, no `fetch`, no
 * legacy DOM ids — never both, UIR-2).
 */

const pushMock = vi.hoisted(() => vi.fn());
const refreshMock = vi.hoisted(() => vi.fn());

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, refresh: refreshMock }),
}));

afterEach(() => {
  vi.unstubAllGlobals();
  pushMock.mockReset();
  refreshMock.mockReset();
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
 * Renders the V2 surface directly (dynamic import so the seam tests above
 * still execute their assertions while the component file may be absent).
 *
 * Wrapped in `I18nProvider initialLocale="en"`: the flag-ON e2e harness runs
 * the local suite in EN, so the contract assertions below (labels + buttons)
 * are pinned in the same locale the harness resolves. Component tests without
 * a provider fall back to the ES dictionary (useI18n contract).
 */
async function renderV2(store = new InMemoryTeamStore()) {
  // Non-literal specifier: vite leaves it to runtime, so the seam tests in
  // this file still execute their assertions while the component is absent.
  const spec = "./CreateTeamFormV2";
  const { CreateTeamFormV2 } = await import(/* @vite-ignore */ spec);
  const result = render(
    <I18nProvider initialLocale="en">
      <AppProvider store={store}>
        <CreateTeamFormV2 />
      </AppProvider>
    </I18nProvider>,
  );
  return { store, ...result };
}

/** Walks the harness flow to step 2 (name + race + Next →). */
async function goToStep2(name: string) {
  fireEvent.change(await screen.findByLabelText("Team name"), {
    target: { value: name },
  });
  fireEvent.change(screen.getByLabelText("Race"), { target: { value: "human" } });
  fireEvent.click(screen.getByRole("button", { name: "Next →" }));
  await screen.findByTestId("ui-v2-create-step2");
}

describe("create wizard seam (UIR-2): app/teams/create/page.tsx", () => {
  it("flag ON: initialUiFlag mounts the V2 surface, never the legacy one", async () => {
    renderSeam(true);

    expect(await screen.findByTestId("ui-v2-create-step1")).toBeTruthy();
    // Never both: the legacy step-1 input id must not exist.
    expect(document.getElementById("team-name")).toBeNull();
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

    // Submit label (`create.createTeam`) and the V2 submit landmark.
    const submit = screen.getByTestId("ui-v2-create-submit");
    expect(submit.textContent).toMatch(/create team/i);
    fireEvent.click(submit);

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

describe("CreateWizardV2 full surface (slice 2, task 2.1 — parity + Stitch chrome)", () => {
  it("step 1 shows the Stitch stepper and budget card while keeping the harness labels", async () => {
    await renderV2();

    // Stepper: two honest milestones (frozen 2-step flow) with the current
    // step marked for assistive tech.
    const stepper = await screen.findByTestId("ui-v2-create-stepper");
    expect(within(stepper).getByText("Name & race")).toBeTruthy();
    expect(within(stepper).getByText("Roster & coaching")).toBeTruthy();
    expect(stepper.querySelectorAll('[aria-current="step"]')).toHaveLength(1);

    // Budget card (Stitch "M 06" PRESUPUESTO DISPONIBLE) on the starting pot.
    const budget = screen.getByTestId("ui-v2-create-treasury");
    expect(budget.textContent).toContain("Available budget");
    expect(budget.textContent).toContain("1,000k");

    // The harness contract survives the chrome.
    expect(screen.getByLabelText("Team name", { exact: true })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Next →" })).toBeTruthy();
  });

  it("step 2 renders every zone: roster, availability, budget, coaching, submit", async () => {
    await renderV2();
    await goToStep2("Zone Team");

    expect(screen.getByTestId("ui-v2-create-roster")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-create-availability")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-create-budget")).toBeTruthy();
    // The parity gap slice 1 left: the coaching zone on the SAME data channel.
    expect(screen.getByTestId("ui-v2-create-coaching")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-create-submit")).toBeTruthy();

    // Never-both: the legacy coaching input ids stay out of V2.
    expect(document.getElementById("coaching-rerolls")).toBeNull();
    expect(document.getElementById("coaching-apothecary")).toBeNull();
  });

  it("coaching quantities feed the shared budget and block an over-budget submit", async () => {
    await renderV2();
    await goToStep2("Coaching Math");

    // 11 linemen = 550k; 8 rerolls (8 × 50k) + 6 assistant coaches (6 × 10k)
    // = 1,010k > 1M — reachable only through the coaching inputs.
    const addLineman = screen.getByRole("button", { name: "Add Human Lineman" });
    for (let i = 0; i < 11; i += 1) fireEvent.click(addLineman);
    fireEvent.change(screen.getByLabelText("Rerolls"), { target: { value: "8" } });
    fireEvent.change(screen.getByLabelText("Assistant Coaches"), { target: { value: "6" } });

    // Budget row flips to the over-budget copy (same key legacy renders).
    expect(screen.getByText(/Over budget by/i)).toBeTruthy();

    fireEvent.click(screen.getByTestId("ui-v2-create-submit"));
    expect(
      await screen.findByText("Roster exceeds the 1,000,000 gc budget"),
    ).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("race change with a roster asks for confirmation; confirm clears it, cancel keeps it", async () => {
    await renderV2();
    await goToStep2("Race Changers");

    fireEvent.click(screen.getByRole("button", { name: "Add Human Lineman" }));
    // Back to step 1 preserving the roster, then change the race select.
    fireEvent.click(screen.getByRole("button", { name: "Edit name/race" }));
    await screen.findByTestId("ui-v2-create-step1");
    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "orc" } });

    // Pending confirmation (same role/aria-label/copy keys legacy renders).
    const dialog = await screen.findByRole("alertdialog");
    expect(dialog.getAttribute("aria-label")).toBe("Confirm race change");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    // Controlled select reverts: raceId never changed while pending.
    expect((screen.getByLabelText("Race") as HTMLSelectElement).value).toBe("human");

    // Confirm path: race applies AND the roster is cleared (hook parity).
    fireEvent.change(screen.getByLabelText("Race"), { target: { value: "orc" } });
    const confirmDialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(confirmDialog).getByRole("button", { name: "Confirm" }));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect((screen.getByLabelText("Race") as HTMLSelectElement).value).toBe("orc");

    fireEvent.click(screen.getByRole("button", { name: "Next →" }));
    await screen.findByTestId("ui-v2-create-step2");
    expect(screen.getByText(/0 players/i)).toBeTruthy();
  });

  it("validation parity: name required before advancing, min players before submit", async () => {
    await renderV2();

    fireEvent.click(await screen.findByRole("button", { name: "Next →" }));
    expect(await screen.findByText("Team name is required")).toBeTruthy();
    expect(screen.getByTestId("ui-v2-create-step1")).toBeTruthy();

    await goToStep2("Short Squad");
    fireEvent.click(screen.getByTestId("ui-v2-create-submit"));
    expect(await screen.findByText("Select at least 11 players")).toBeTruthy();
    expect(pushMock).not.toHaveBeenCalled();
  });

  it("successful submit persists through addTeam and pushes home (parity)", async () => {
    const { store } = await renderV2();

    await goToStep2("Parity Squad");
    const addLineman = screen.getByRole("button", { name: "Add Human Lineman" });
    for (let i = 0; i < 11; i += 1) fireEvent.click(addLineman);
    fireEvent.click(screen.getByTestId("ui-v2-create-submit"));

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"));
    expect(refreshMock).toHaveBeenCalled();
    await waitFor(async () => expect((await store.list()).length).toBe(1));
    const [team] = await store.list();
    expect(team.name).toBe("Parity Squad");
    expect(team.raceId).toBe("human");
    expect(team.roster.length).toBe(11);
  });

  it("stays presentation-only and never-both in its source (UIR-2)", () => {
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const content = readFileSync(path.join(dir, "CreateTeamFormV2.tsx"), "utf8");

    // No data-fetching beyond the legacy surface's own machinery.
    const specifiers = Array.from(content.matchAll(/from\s+["']([^"']+)["']/g)).map(
      (m) => m[1],
    );
    expect(
      specifiers.some((s) => s.includes("features/teams/api") || s.includes("/api/")),
    ).toBe(false);
    expect(content).not.toMatch(/\bfetch\s*\(/);
    expect(content).toContain("useCreateTeamForm");

    // Never-both vocabulary: legacy DOM ids are never reused by V2 source.
    expect(content).not.toMatch(
      /id="team-name"|id="team-race"|id="coaching-rerolls"|id="coaching-apothecary"/,
    );
  });
});
