import type { LiveMatchEventDto, LiveMatchViewState } from "./api";
import { liveState, narrativeEvents } from "./actaFlow.fixtures";

/**
 * Pure demo state machine behind the "Flujo interactivo" Storybook story
 * (Demo phase 1). It backs the interactive sandbox only — product flows keep
 * using `useLiveMatch` + `sendLiveCommand`. Deterministic by design: no
 * `Date.now()`, no `Math.random()`, so Chromatic snapshots stay stable.
 */

/** Named starting points the story's scenario chips jump to. */
export type DemoScenario = "primer-tercio" | "segundo-tercio" | "finalizado";

/**
 * The live view state the `Flow` composition renders, plus the two pieces the
 * demo drives itself: the appended narrative events and the closure toggle.
 */
export interface ActaDemoState extends LiveMatchViewState {
  events: LiveMatchEventDto[];
  closureOpen: boolean;
}

export type ActaDemoAction =
  | {
      type: "registerEvent";
      event: LiveMatchEventDto;
      /** Optional score bump (e.g. a touchdown) for one side. */
      score?: { side: "home" | "away" };
    }
  | { type: "endTurn" }
  | { type: "finish" }
  | { type: "openClosure" }
  | { type: "reset"; scenario: DemoScenario };

/** Turns per half in Blood Bowl; `endTurn` rolls 1T8 → 2T1 and 2T8 → finished. */
const TURNS_PER_HALF = 8;

/** A fresh demo state for a named scenario (fixture viewer context preserved). */
export function demoState(scenario: DemoScenario): ActaDemoState {
  const base = liveState();
  const preset = (
    overrides: Partial<LiveMatchViewState>,
    events: readonly LiveMatchEventDto[],
  ): ActaDemoState => ({
    ...base,
    ...overrides,
    events: [...events],
    closureOpen: false,
  });

  switch (scenario) {
    case "primer-tercio":
      return preset(
        { half: 1, turnNumber: 3, activeSide: "home", homeScore: 1, awayScore: 0 },
        narrativeEvents.slice(0, 1),
      );
    case "segundo-tercio":
      return preset(
        { half: 2, turnNumber: 5, homeScore: 2, awayScore: 1 },
        narrativeEvents.slice(0, 3),
      );
    case "finalizado":
      return preset(
        {
          status: "finished",
          half: 2,
          turnNumber: TURNS_PER_HALF,
          homeScore: 2,
          awayScore: 1,
        },
        narrativeEvents,
      );
  }
}

/**
 * The demo state machine. Pure: every case returns a new state object and the
 * input state is never mutated.
 */
export function actaDemoReducer(
  state: ActaDemoState,
  action: ActaDemoAction,
): ActaDemoState {
  switch (action.type) {
    case "registerEvent": {
      const bumped =
        action.score == null
          ? {}
          : action.score.side === "home"
            ? { homeScore: state.homeScore + 1 }
            : { awayScore: state.awayScore + 1 };
      return {
        ...state,
        ...bumped,
        events: [...state.events, action.event],
      };
    }
    case "endTurn": {
      if (state.status !== "live") return state;
      const activeSide = state.activeSide === "home" ? "away" : "home";
      if (state.half === 2 && state.turnNumber === TURNS_PER_HALF) {
        return { ...state, activeSide, status: "finished" };
      }
      if (state.turnNumber === TURNS_PER_HALF) {
        return { ...state, activeSide, half: 2, turnNumber: 1 };
      }
      return { ...state, activeSide, turnNumber: state.turnNumber + 1 };
    }
    case "finish":
      return state.status === "finished"
        ? state
        : { ...state, status: "finished" };
    case "openClosure":
      return state.status === "finished" && !state.closureOpen
        ? { ...state, closureOpen: true }
        : state;
    case "reset":
      return demoState(action.scenario);
  }
}
