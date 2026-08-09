import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { ForfeitModal, type ForfeitModalProps } from "./ForfeitModal";
import type { FixtureDraft } from "./api";

/**
 * ForfeitModal is the admin-only walkover flow: the league owner picks which of
 * the two teams wins, and onAward(winnerTeamId) POSTs the forfeit. The modal
 * lists both teams so the admin can choose home or away.
 */

const teamNameById = new Map([
  ["th", "Reavers"],
  ["ta", "Orcboyz"],
]);

const pendingFixture: FixtureDraft = {
  id: "f1",
  leagueId: "l1",
  round: 1,
  homeTeamId: "th",
  awayTeamId: "ta",
  createdAt: "2026-02-01",
  scheduledAt: null,
  winnerId: null,
  status: "pending",
  homeOwner: { id: "u1", name: "raul" },
  awayOwner: { id: "u2", name: "maria" },
  proposals: [],
};

function renderModal(props: Partial<ForfeitModalProps> = {}) {
  const onAward = vi.fn();
  const onClose = vi.fn();
  render(
    <ForfeitModal
      open
      fixture={pendingFixture}
      teamNameById={teamNameById}
      onAward={onAward}
      onClose={onClose}
      {...props}
    />,
  );
  return { onAward, onClose };
}

describe("ForfeitModal", () => {
  it("renders as a dialog listing both teams by name", () => {
    renderModal();
    expect(screen.getByRole("dialog", { name: /Otorgar victoria/ })).toBeTruthy();
    expect(screen.getByText("Reavers")).toBeTruthy();
    expect(screen.getByText("Orcboyz")).toBeTruthy();
  });

  it("awards the selected home team via onAward when confirmed", () => {
    const { onAward } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Reavers/ }));
    fireEvent.click(screen.getByRole("button", { name: /Otorgar victoria a Reavers/ }));
    expect(onAward).toHaveBeenCalledWith("th");
  });

  it("awards the selected away team via onAward when confirmed", () => {
    const { onAward } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Orcboyz/ }));
    fireEvent.click(screen.getByRole("button", { name: /Otorgar victoria a Orcboyz/ }));
    expect(onAward).toHaveBeenCalledWith("ta");
  });

  it("does not render at all when closed", () => {
    renderModal({ open: false });
    expect(screen.queryByRole("dialog", { name: /Otorgar victoria/ })).toBeNull();
  });

  it("closes via the close action", () => {
    const { onClose } = renderModal();
    fireEvent.click(screen.getByRole("button", { name: /Cerrar/ }));
    expect(onClose).toHaveBeenCalled();
  });
});
