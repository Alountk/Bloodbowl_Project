import { describe, expect, it } from "vitest";
import {
  PE_TD,
  PE_MVP,
  PE_INTERCEPTION,
  PE_CASUALTY,
  PE_COMPLETION,
  PE_TTM,
  PE_LANDED_SAFE,
  awardPeForActions,
  selectMvpWinner,
} from "./pe";

describe("pe awards (bb2025-rules R1)", () => {
  it("pins each action's PE value to the user-validated table", () => {
    expect(PE_TD).toBe(3);
    expect(PE_MVP).toBe(4);
    expect(PE_INTERCEPTION).toBe(2);
    expect(PE_CASUALTY).toBe(2);
    expect(PE_COMPLETION).toBe(1);
    expect(PE_TTM).toBe(1);
    expect(PE_LANDED_SAFE).toBe(1);
  });

  it("awards PE per action in the combined payload", () => {
    const pe = awardPeForActions({
      tds: 2,
      casualties: 1,
      completions: 3,
      interceptions: 1,
      fouls: 5,
      throwTeamMates: 2,
      landedSafe: 1,
    });
    // 2*3 + 1*2 + 3*1 + 1*2 + 0(fouls) + 2*1 + 1*1 = 6+2+3+2+0+2+1 = 16
    expect(pe).toBe(16);
  });

  it("awards zero PE for an empty action set", () => {
    expect(
      awardPeForActions({ tds: 0, casualties: 0, completions: 0, interceptions: 0, fouls: 0, throwTeamMates: 0, landedSafe: 0 }),
    ).toBe(0);
  });

  it("selects the MVP winner by nomination die", () => {
    const nominations = ["lineman-1", "blitzer-2", "thrower-3", "catcher-4", "lineman-5", "linewoman-6"];
    expect(selectMvpWinner(nominations, 1)).toBe("lineman-1");
    expect(selectMvpWinner(nominations, 4)).toBe("catcher-4");
    expect(selectMvpWinner(nominations, 6)).toBe("linewoman-6");
  });
});
