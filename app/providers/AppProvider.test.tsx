import { describe, expect, it, vi } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { AppProvider, useApp } from "./AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import type { Team } from "@/features/teams/types";
import { DEFAULT_COACHING } from "@/features/teams/types";
import type { CreateTeamValues } from "@/features/teams/create/useCreateTeamForm";

const makeTeam = (id: string, name = `Team ${id}`): Team => ({
  id,
  name,
  raceId: "human",
  roster: [],
  coaching: { ...DEFAULT_COACHING },
  leagueId: null,
  treasury: 0,
});

const makeValues = (name = "New Team"): CreateTeamValues => ({
  name,
  raceId: "human",
  roster: [],
  coaching: { ...DEFAULT_COACHING },
});

/** Renders AppProvider and exposes the context value via a sentinel component. */
function renderProvider(store: TeamStore = new InMemoryTeamStore()) {
  let ctx!: ReturnType<typeof useApp>;
  function Probe() {
    ctx = useApp();
    return null;
  }
  const view = render(
    <AppProvider store={store} reloadVersion={0}>
      <Probe />
    </AppProvider>,
  );
  return { getCtx: () => ctx, rerender: (reloadVersion: number) =>
    view.rerender(
      <AppProvider store={store} reloadVersion={reloadVersion}>
        <Probe />
      </AppProvider>,
    ),
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

class ControlledStore implements TeamStore {
  readonly listCall = deferred<Team[]>();
  readonly saveCall = deferred<Team>();
  readonly removeCall = deferred<void>();
  lastSaved: Team | null = null;
  lastRemovedId: string | null = null;

  list(): Promise<Team[]> {
    return this.listCall.promise;
  }

  save(team: Team): Promise<Team> {
    this.lastSaved = team;
    return this.saveCall.promise;
  }

  remove(id: string): Promise<void> {
    this.lastRemovedId = id;
    return this.removeCall.promise;
  }
}

describe("AppProvider — hydration", () => {
  it("isHydrated is false before mount resolves and true after", async () => {
    const store = new InMemoryTeamStore([makeTeam("1")]);
    const { getCtx } = renderProvider(store);
    // After waitFor the store.list() promise has resolved
    await waitFor(() => expect(getCtx().isHydrated).toBe(true));
    expect(getCtx().teams).toHaveLength(1);
  });

  it("teams stays empty until hydration resolves", async () => {
    const store = new ControlledStore();
    const { getCtx } = renderProvider(store);

    expect(getCtx().isHydrated).toBe(false);
    expect(getCtx().teams).toEqual([]);

    await act(async () => {
      store.listCall.resolve([makeTeam("1")]);
      await store.listCall.promise;
    });

    await waitFor(() => expect(getCtx().isHydrated).toBe(true));
    expect(getCtx().teams).toEqual([makeTeam("1")]);
  });

  it("uses a default store when no store prop is provided", async () => {
    // Default is a fresh InMemoryTeamStore; we just check the context is accessible.
    let ctx!: ReturnType<typeof useApp>;
    function Probe() {
      ctx = useApp();
      return null;
    }
    render(
      <AppProvider>
        <Probe />
      </AppProvider>,
    );
    await waitFor(() => expect(ctx.isHydrated).toBe(true));
    expect(ctx.teams).toEqual([]); // a fresh in-memory store starts empty
  });
});

describe("AppProvider — re-hydration after migration", () => {
  it("re-lists the store when reloadVersion changes (migrated teams appear)", async () => {
    // A store whose list() grows over time, simulating teams POSTed by the
    // migration behind the store's back.
    const mutable = new InMemoryTeamStore();
    const { getCtx, rerender } = renderProvider(mutable);
    await waitFor(() => expect(getCtx().isHydrated).toBe(true));
    expect(getCtx().teams).toHaveLength(0);

    // The migration adds the team directly into the store (as /api/teams would).
    await act(async () => {
      await mutable.save(makeTeam("m1", "Legacy Reavers"));
    });

    // Bumping reloadVersion must re-list so the migrated team appears.
    rerender(1);
    await waitFor(() => expect(getCtx().teams).toHaveLength(1));
    expect(getCtx().teams[0].name).toBe("Legacy Reavers");
  });

  it("does NOT re-list on a plain re-render with the same reloadVersion", async () => {
    const store = new InMemoryTeamStore([makeTeam("1")]);
    const listSpy = vi.spyOn(store, "list");
    const { rerender } = renderProvider(store);
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));

    rerender(0); // same reloadVersion as the initial render
    await waitFor(() => expect(listSpy).toHaveBeenCalledTimes(1));
  });
});

describe("AppProvider — addTeam", () => {
  it("addTeam generates a string id and appends the team", async () => {
    const store = new InMemoryTeamStore();
    const { getCtx } = renderProvider(store);
    await waitFor(() => expect(getCtx().isHydrated).toBe(true));

    await act(async () => {
      await getCtx().addTeam(makeValues("Reavers"));
    });

    expect(getCtx().teams).toHaveLength(1);
    expect(typeof getCtx().teams[0].id).toBe("string");
    expect(getCtx().teams[0].name).toBe("Reavers");
  });

  it("addTeam persists to store", async () => {
    const store = new InMemoryTeamStore();
    const { getCtx } = renderProvider(store);
    await waitFor(() => expect(getCtx().isHydrated).toBe(true));

    await act(async () => {
      await getCtx().addTeam(makeValues("Krumpaz"));
    });

    const persisted = await store.list();
    expect(persisted).toHaveLength(1);
    expect(persisted[0].name).toBe("Krumpaz");
  });

  it("addTeam waits for store.save before updating local state", async () => {
    const store = new ControlledStore();
    const { getCtx } = renderProvider(store);

    await act(async () => {
      store.listCall.resolve([]);
      await store.listCall.promise;
    });
    await waitFor(() => expect(getCtx().isHydrated).toBe(true));

    const pending = getCtx().addTeam(makeValues("Delayed Team"));
    expect(store.lastSaved?.name).toBe("Delayed Team");
    expect(getCtx().teams).toEqual([]);

    await act(async () => {
      store.saveCall.resolve(store.lastSaved!);
      await pending;
    });

    expect(getCtx().teams).toHaveLength(1);
    expect(getCtx().teams[0].name).toBe("Delayed Team");
  });
});

describe("AppProvider — removeTeam", () => {
  it("removeTeam removes the team from context", async () => {
    const store = new InMemoryTeamStore([makeTeam("a")]);
    const { getCtx } = renderProvider(store);
    await waitFor(() => expect(getCtx().isHydrated).toBe(true));

    await act(async () => {
      await getCtx().removeTeam("a");
    });

    expect(getCtx().teams).toHaveLength(0);
  });

  it("removeTeam persists removal to store", async () => {
    const store = new InMemoryTeamStore([makeTeam("a")]);
    const { getCtx } = renderProvider(store);
    await waitFor(() => expect(getCtx().isHydrated).toBe(true));

    await act(async () => {
      await getCtx().removeTeam("a");
    });

    expect(await store.list()).toHaveLength(0);
  });

  it("removeTeam waits for store.remove before updating local state", async () => {
    const store = new ControlledStore();
    const team = makeTeam("a");
    const { getCtx } = renderProvider(store);

    await act(async () => {
      store.listCall.resolve([team]);
      await store.listCall.promise;
    });
    await waitFor(() => expect(getCtx().teams).toEqual([team]));

    const pending = getCtx().removeTeam("a");
    expect(store.lastRemovedId).toBe("a");
    expect(getCtx().teams).toEqual([team]);

    await act(async () => {
      store.removeCall.resolve();
      await pending;
    });

    expect(getCtx().teams).toEqual([]);
  });
});
