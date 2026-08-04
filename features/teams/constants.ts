import type { PlayerPosition } from "./types";

export const PLAYER_POSITIONS: PlayerPosition[] = [
  "lineman",
  "thrower",
  "blitzer",
  "catcher",
  "blocker",
  "big guy",
  "runner",
];

export const PLAYER_POSITION_LABELS: Record<PlayerPosition, string> = {
  lineman: "Lineman",
  thrower: "Thrower",
  blitzer: "Blitzer",
  catcher: "Catcher",
  blocker: "Blocker",
  "big guy": "Big Guy",
  runner: "Runner",
};
