import { describe, expect, it } from "vitest";
import { render, act, waitFor } from "@testing-library/react";
import { AppProvider, useApp } from "./AppProvider";
import { InMemoryTeamStore } from "@/features/teams/store/InMemoryTeamStore";
import type { TeamStore } from "@/features/teams/store/TeamStore";
import type { Team } from "@/features/teams/types";
import type { CreateTeamValues } from "@/features/teams/create/useCreateTeamForm";

const makeTeam = (id: string, name = `Team ${id}`): Team => ({
  id,
  name,
  raceId: "human",
  roster: [],
});

const makeValues = (name = "New Team"): CreateTeamValues => ({
  name,
  raceId: "human",
  roster: [],
});

/** Renders AppProvider and exposes the context value via a sentinel component. */
function renderProvider(store: TeamStore = new InMemoryTeamStore()) {
  let ctx!: ReturnType<typeof useApp>;
  function Probe() {
    ctx = useApp();
    return null;
  }
  render(
    <AppProvider store={store}>
      <Probe />
    </AppProvider>,
  );
  return { getCtx: () => ctx };
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
    // Default is LocalStorageTeamStore; we just check the context is accessible.
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
    expect(ctx.teams).toEqual([]); // real localStorage is empty in vitest jsdom
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
