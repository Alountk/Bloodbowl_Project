import { describe, expect, it } from "vitest";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { PE_MVP } from "@/lib/rules";
import type { RosterPlayerRef } from "../MatchResolveModal";
import { buildActaPayload, emptyActaState, type ActaState } from "./actaState";
import { StepMvp } from "./StepMvp";

/**
 * s3a (RAU-122) — Step 3 · MVP (MAW-5). DIRECT selection of exactly ONE MVP per
 * team (no random mode, no six-nomination list); the grantee rides the wizard
 * state and `buildActaPayload` emits it as `mvp.grantee`. Assertions use
 * textContent/regex — this repo has no jest-dom matchers.
 */

const homeName = "Águilas de Khemri";
const awayName = "Colmillos del Caos";

const homeRoster: RosterPlayerRef[] = [
  { id: "h1", name: "Khalid el Impávido" },
  { id: "h2", name: "Ushtep el Mensajero" },
];
const awayRoster: RosterPlayerRef[] = [
  { id: "a1", name: "Grishnak Mordaz" },
  { id: "a2", name: "Durburz Puño de Hierro" },
];

const homeMvp = (player: string) => `MVP · ${homeName} · ${player}`;
const awayMvp = (player: string) => `MVP · ${awayName} · ${player}`;

/** A stateful harness so the payload built from the captured state is visible. */
function Harness() {
  const [state, setState] = useState<ActaState>(emptyActaState);
  return (
    <>
      <StepMvp
        state={state}
        onChange={setState}
        homeName={homeName}
        awayName={awayName}
        homeRoster={homeRoster}
        awayRoster={awayRoster}
      />
      <output data-testid="payload">{JSON.stringify(buildActaPayload(state))}</output>
    </>
  );
}

function payloadGrantee(side: "home" | "away"): string | null {
  const raw = screen.getByTestId("payload").textContent ?? "{}";
  const payload = JSON.parse(raw) as { home: { mvp: { grantee: string | null } }; away: { mvp: { grantee: string | null } } };
  return payload[side].mvp.grantee;
}

describe("StepMvp", () => {
  it("selects exactly one MVP per team and emits it as mvp.grantee", () => {
    render(<Harness />);
    const home = screen.getByRole("radio", { name: homeMvp("Khalid el Impávido") }) as HTMLInputElement;
    const away = screen.getByRole("radio", { name: awayMvp("Grishnak Mordaz") }) as HTMLInputElement;
    fireEvent.click(home);
    fireEvent.click(away);
    expect(home.checked).toBe(true);
    expect(away.checked).toBe(true);
    expect(payloadGrantee("home")).toBe("h1");
    expect(payloadGrantee("away")).toBe("a1");
  });

  it("replaces the previous MVP when a second player is selected in the same team", () => {
    render(<Harness />);
    const first = screen.getByRole("radio", { name: homeMvp("Khalid el Impávido") }) as HTMLInputElement;
    const second = screen.getByRole("radio", { name: homeMvp("Ushtep el Mensajero") }) as HTMLInputElement;
    fireEvent.click(first);
    fireEvent.click(second);
    expect(second.checked).toBe(true);
    expect(first.checked).toBe(false);
    expect(payloadGrantee("home")).toBe("h2");
    const homeRadios = [first, second].filter((radio) => radio.checked);
    expect(homeRadios).toHaveLength(1);
  });

  it("shows the ★PE note using the real PE_MVP constant", () => {
    render(<Harness />);
    expect(screen.getByText(new RegExp(`★${PE_MVP} PE`))).toBeTruthy();
  });

  it("leaves the grantee unset until a player is picked", () => {
    render(<Harness />);
    expect(payloadGrantee("home")).toBeNull();
    expect(payloadGrantee("away")).toBeNull();
  });
});
