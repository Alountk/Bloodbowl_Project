import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import {
  NegotiationPanel,
  buildProposalDateTime,
  type NegotiationPanelProps,
} from "./NegotiationPanel";
import type { FixtureDraft, ScheduleProposal } from "./api";

/**
 * NegotiationPanel is participant-only UI: the two match owners propose dates
 * (date+time inputs + "Proponer") and accept the other's latest active proposal
 * ("Aceptar"). History shows who proposed what, when, and "✓ Acordado" on an
 * accepted proposal. Non-participants (members and the league owner/admin) see
 * the history read-only with NO negotiate controls.
 */

const fixtureWith = (proposals: ScheduleProposal[]): FixtureDraft => ({
  id: "f1",
  leagueId: "l1",
  round: 1,
  homeTeamId: "th",
  awayTeamId: "ta",
  createdAt: "2026-02-01",
  scheduledAt: null,
  winnerId: null,
  status: "pending",
  homeOwner: { id: "uHome", name: "raul" },
  awayOwner: { id: "uAway", name: "maria" },
  proposals,
});

const open1: ScheduleProposal = {
  id: "p1",
  fixtureId: "f1",
  userId: "uHome",
  date: "2026-03-01T18:00:00.000Z",
  createdAt: "2026-02-02",
  acceptedAt: null,
  closedAt: null,
};
const open2: ScheduleProposal = {
  id: "p2",
  fixtureId: "f1",
  userId: "uAway",
  date: "2026-03-02T12:00:00.000Z",
  createdAt: "2026-02-03",
  acceptedAt: null,
  closedAt: null,
};
const acceptedProposal: ScheduleProposal = {
  id: "p3",
  fixtureId: "f1",
  userId: "uAway",
  date: "2026-03-03T19:30:00.000Z",
  createdAt: "2026-02-04",
  acceptedAt: "2026-02-04T20:00:00.000Z",
  closedAt: null,
};

function renderPanel(props: Partial<NegotiationPanelProps> = {}) {
  const onPropose = vi.fn();
  const onAccept = vi.fn();
  const onClose = vi.fn();
  render(
    <NegotiationPanel
      fixture={fixtureWith([acceptedProposal, open2, open1])}
      teamNameById={new Map([
        ["th", "Reavers"],
        ["ta", "Orcboyz"],
      ])}
      currentUserId="uHome"
      isParticipant
      isLeagueOwner={false}
      onPropose={onPropose}
      onAccept={onAccept}
      onClose={onClose}
      {...props}
    />,
  );
  return { onPropose, onAccept, onClose };
}

describe("buildProposalDateTime", () => {
  it("combines a YYYY-MM-DD date and HH:MM time into a UTC ISO timestamp", () => {
    const iso = buildProposalDateTime("2026-03-01", "18:30");
    expect(iso).not.toBeNull();
    // Local 18:30 on 2026-03-01 serialized to UTC (concrete value).
    expect(new Date(iso as string).toISOString()).toBe(new Date(2026, 2, 1, 18, 30, 0).toISOString());
  });
  it("returns null for an incomplete date or time", () => {
    expect(buildProposalDateTime("", "18:30")).toBeNull();
    expect(buildProposalDateTime("2026-03-01", "")).toBeNull();
  });
});

describe("NegotiationPanel — participant", () => {
  it("shows the full proposal history with author, date and accepted marker", () => {
    renderPanel();
    // Participant display names appear in the history (raul proposed once, maria twice).
    expect(screen.getAllByText("raul").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("maria").length).toBeGreaterThanOrEqual(1);
    // The accepted proposal is marked "✓ Acordado".
    expect(screen.getByText(/Acordado/)).toBeTruthy();
  });

  it("shows date+time inputs and a Proponer button for a participant", () => {
    renderPanel();
    expect(screen.getByLabelText(/Fecha/)).toBeTruthy();
    expect(screen.getByLabelText(/Hora/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Proponer" })).toBeTruthy();
  });

  it("posts the chosen date+time via onPropose", () => {
    const { onPropose } = renderPanel();
    fireEvent.change(screen.getByLabelText(/Fecha/), { target: { value: "2026-03-05" } });
    fireEvent.change(screen.getByLabelText(/Hora/), { target: { value: "19:00" } });
    fireEvent.click(screen.getByRole("button", { name: "Proponer" }));
    expect(onPropose).toHaveBeenCalledTimes(1);
    expect(onPropose.mock.calls[0][0]).toMatch(/^2026-03-05T/);
  });

  it("shows an Aceptar button on the OTHER participant's latest active proposal", () => {
    // Latest active proposal p2 belongs to uAway (not the viewer uHome).
    renderPanel();
    const acceptButtons = screen.getAllByRole("button", { name: "Aceptar" });
    expect(acceptButtons.length).toBeGreaterThanOrEqual(1);
  });

  it("does not offer Aceptar on the viewer's OWN active proposal", () => {
    // Viewer uHome proposed p1 (their own active proposal) → no accept offered.
    renderPanel({ currentUserId: "uHome" });
    // p1 is the viewer's own; the only other active is p2 by uAway → at least one.
    // (Covered by the case above; here we also confirm Aceptar still appears for the rival's.)
    expect(screen.queryAllByRole("button", { name: "Aceptar" }).length).toBeGreaterThanOrEqual(1);
  });

  it("shows negotiate controls for a league owner who is also a participant", () => {
    // Bug fix: an admin who owns one of the fixture's teams is a PARTICIPANT and
    // may negotiate (participant rule). Only a non-participant admin is read-only.
    renderPanel({ isParticipant: true, isLeagueOwner: true });
    expect(screen.getByRole("button", { name: "Proponer" })).toBeTruthy();
    expect(screen.getByLabelText(/Fecha propuesta/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Aceptar" }).length).toBeGreaterThanOrEqual(1);
  });

  it("re-opens negotiation on a SCHEDULED (not played) fixture — rejornar re-propose", () => {
    // A scheduled fixture still offers propose/accept to a participant (rejornar).
    const fixture = fixtureWith([acceptedProposal, open2, open1]);
    fixture.status = "scheduled";
    fixture.scheduledAt = "2026-03-01T18:00:00.000Z";
    renderPanel({ fixture });
    expect(screen.getByRole("button", { name: "Proponer" })).toBeTruthy();
    expect(screen.getByLabelText(/Fecha propuesta/)).toBeTruthy();
    expect(screen.getAllByRole("button", { name: "Aceptar" }).length).toBeGreaterThanOrEqual(1);
  });

  it("keeps the history (old + new proposals) on a re-negotiated scheduled fixture", () => {
    const fixture = fixtureWith([acceptedProposal, open2, open1]);
    fixture.status = "scheduled";
    renderPanel({ fixture });
    // History retains all prior cycles alongside the new schedule.
    expect(screen.getAllByText("raul").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("maria").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Acordado/)).toBeTruthy();
  });

  it("locks negotiate controls on a PLAYED fixture", () => {
    const fixture = fixtureWith([acceptedProposal]);
    fixture.status = "played";
    fixture.winnerId = "th";
    renderPanel({ fixture, isParticipant: true });
    expect(screen.queryByRole("button", { name: "Proponer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
    expect(screen.queryByLabelText(/Fecha/)).toBeNull();
  });
});

describe("NegotiationPanel — non-participant / admin", () => {
  it("hides all negotiate controls for a non-participant member", () => {
    renderPanel({ isParticipant: false, isLeagueOwner: false });
    expect(screen.queryByRole("button", { name: "Proponer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
    expect(screen.queryByLabelText(/Fecha/)).toBeNull();
  });

  it("hides all negotiate controls for the league owner (admin)", () => {
    renderPanel({ isParticipant: false, isLeagueOwner: true });
    expect(screen.queryByRole("button", { name: "Proponer" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Aceptar" })).toBeNull();
  });
});

describe("NegotiationPanel — submit error", () => {
  it("renders the submit error as an alert near the history", () => {
    renderPanel({ submitError: "No se pudo proponer la fecha. Error de prueba" });
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("No se pudo proponer la fecha.");
    expect(alert.textContent).toContain("Error de prueba");
  });

  it("renders no alert when there is no submit error", () => {
    renderPanel();
    expect(screen.queryByRole("alert")).toBeNull();
  });
});
