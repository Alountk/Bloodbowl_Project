export type PlayerPosition =
  | "lineman"
  | "thrower"
  | "blitzer"
  | "catcher"
  | "blocker"
  | "big guy"
  | "runner";

export interface Team {
  id: number;
  name: string;
  league: string;
  positions?: PlayerPosition[];
}
