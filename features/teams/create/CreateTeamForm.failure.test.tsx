import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { CreateTeamForm } from "./CreateTeamForm";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import type { Team } from "@/features/teams/types";

const routerPush = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: routerPush }),
}));

class FailingStore implements TeamStore {
  async list() {
    return [];
  }
  // TS allows omitting params that the interface declares.
  async save(): Promise<Team> {
    throw new Error("API down");
  }
  async remove() {
    return;
  }
}

async function fillAndSubmit(stored: TeamStore) {
  render(
    <AppProvider store={stored}>
      <CreateTeamForm />
    </AppProvider>,
  );
  await waitFor(() => expect(screen.getByLabelText(/team name/i)).toBeTruthy());
  fireEvent.change(screen.getByLabelText(/team name/i), { target: { value: "Reikland" } });
  fireEvent.change(screen.getByLabelText(/race/i), { target: { value: "human" } });
  fireEvent.click(screen.getByRole("button", { name: /siguiente/i }));
  await waitFor(() => expect(screen.getByRole("button", { name: "Add Lineman" })).toBeTruthy());
  // step 2
  for (let i = 0; i < 3; i += 1) {
    fireEvent.click(screen.getByRole("button", { name: "Add Lineman" }));
  }
  fireEvent.click(screen.getByRole("button", { name: /create team/i }));
}

describe("CreateTeamForm API failure", () => {
  beforeEach(() => {
    routerPush.mockClear();
  });

  it("keeps the user on the form and does not navigate when persistence fails", async () => {
    await fillAndSubmit(new FailingStore());

    await waitFor(() => {
      // Still on the form (step 1 restored) and no navigation to home.
      expect(routerPush).not.toHaveBeenCalled();
      expect(screen.getByRole("button", { name: /siguiente/i })).toBeTruthy();
    });
  });
});
