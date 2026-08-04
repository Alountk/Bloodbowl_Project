import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { AppProvider } from "@/app/providers/AppProvider";
import { Topbar } from "@/components/Topbar";
import { TeamList } from "./TeamList";
import type { Team } from "./types";

const fixtureTeams: Team[] = [
  {
    id: 1,
    name: "Reikland Reavers",
    raceId: "human",
    roster: [
      { id: "p1", name: "Player 1", positionalKey: "lineman" },
      { id: "p2", name: "Player 2", positionalKey: "lineman" },
      { id: "p3", name: "Player 3", positionalKey: "lineman" },
      { id: "p4", name: "Player 4", positionalKey: "lineman" },
      { id: "p5", name: "Player 5", positionalKey: "lineman" },
      { id: "p6", name: "Player 6", positionalKey: "lineman" },
      { id: "p7", name: "Player 7", positionalKey: "lineman" },
      { id: "p8", name: "Player 8", positionalKey: "blitzer" },
      { id: "p9", name: "Player 9", positionalKey: "blitzer" },
      { id: "p10", name: "Player 10", positionalKey: "blitzer" },
      { id: "p11", name: "Player 11", positionalKey: "blitzer" },
    ],
  },
  {
    id: 2,
    name: "Da Krumpaz",
    raceId: "orc",
    roster: Array.from({ length: 11 }, (_, i) => ({
      id: `op${i}`,
      name: `Player ${i + 1}`,
      positionalKey: "blitzer",
    })),
  },
];

describe("TeamList", () => {
  it("renders team name, race name and roster summary", () => {
    render(
      <AppProvider initialTeams={fixtureTeams}>
        <TeamList />
      </AppProvider>,
    );

    expect(screen.getByRole("heading", { name: "Teams" })).toBeTruthy();
    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    expect(screen.getByText("Human")).toBeTruthy();
    expect(screen.getByText("11 players · 7x Lineman · 4x Blitzer")).toBeTruthy();
    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.getByText("Orc")).toBeTruthy();
    expect(screen.getByText("11 players · 11x Blitzer")).toBeTruthy();
  });

  it("shows an empty state when there are no teams", () => {
    render(
      <AppProvider initialTeams={[]}>
        <TeamList />
      </AppProvider>,
    );

    expect(screen.getByText(/no teams yet/i)).toBeTruthy();
  });

  it("filters by team name from the topbar", () => {
    render(
      <AppProvider initialTeams={fixtureTeams}>
        <Topbar />
        <TeamList />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText(/search teams/i), {
      target: { value: "reikland" },
    });

    expect(screen.getByText("Reikland Reavers")).toBeTruthy();
    expect(screen.queryByText("Da Krumpaz")).toBeNull();
  });

  it("filters by race name from the topbar", () => {
    render(
      <AppProvider initialTeams={fixtureTeams}>
        <Topbar />
        <TeamList />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText(/search teams/i), {
      target: { value: "orc" },
    });

    expect(screen.getByText("Da Krumpaz")).toBeTruthy();
    expect(screen.queryByText("Reikland Reavers")).toBeNull();
  });

  it("shows a no-matches message when the query matches nothing", () => {
    render(
      <AppProvider initialTeams={fixtureTeams}>
        <Topbar />
        <TeamList />
      </AppProvider>,
    );

    fireEvent.change(screen.getByLabelText(/search teams/i), {
      target: { value: "nuffle" },
    });

    expect(screen.getByText(/no teams match your search/i)).toBeTruthy();
  });
});
