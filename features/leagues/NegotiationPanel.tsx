import type { FixtureDraft, ScheduleProposal } from "./api";

/** Pure: builds a UTC ISO timestamp from a YYYY-MM-DD date and HH:MM time. */
export function buildProposalDateTime(date: string, time: string): string | null {
  if (!date || !time) return null;
  const [y, m, d] = date.split("-").map(Number);
  const [hh, mm] = time.split(":").map(Number);
  if (!y || !m || !d || Number.isNaN(hh) || Number.isNaN(mm)) return null;
  return new Date(y, m - 1, d, hh, mm, 0, 0).toISOString();
}

export interface NegotiationPanelProps {
  fixture: FixtureDraft;
  /** Maps a member team id → team display name. */
  teamNameById: Map<string, string>;
  /** Session user id, used to detect self vs other participant proposals. */
  currentUserId: string;
  /** True when the viewer owns the fixture's home or away team. */
  isParticipant: boolean;
  /** True when the viewer owns the league (admin). Retained for the caller's
   * role contract; the participant rule alone decides the controls. */
  isLeagueOwner: boolean;
  /** Fires with an ISO timestamp to POST propose. */
  onPropose: (date: string) => void;
  /** Fires with a proposal id to POST accept. */
  onAccept: (proposalId: string) => void;
  onClose: () => void;
  /** A failed propose/accept message to surface near the history (keeps the panel open). */
  submitError?: string | null;
}

/** Finds the single active (open, unaccepted) proposal, if any. */
function latestActiveProposal(proposals: ScheduleProposal[]): ScheduleProposal | null {
  // The API returns proposals orderBy createdAt desc → newest first.
  return (
    proposals.find((p) => p.acceptedAt === null && p.closedAt === null) ?? null
  );
}

/**
 * Negotiation panel (modal) for agreeing a match date. Only the two match
 * participants get the propose/accept controls (a league owner who owns one of
 * the fixture's teams counts as a participant); non-participants, including a
 * league owner who does NOT play the fixture, see the history read-only with no
 * controls. History shows the author, the proposed date/time and — on an
 * accepted proposal — "✓ Acordado".
 */
export function NegotiationPanel({
  fixture,
  teamNameById,
  currentUserId,
  isParticipant,
  onPropose,
  onAccept,
  onClose,
  submitError,
}: NegotiationPanelProps) {
  const canNegotiate = isParticipant;
  // Re-negotiation (rejornar) stays open for a scheduled-but-not-played fixture;
  // only a pending OR scheduled participant may propose/accept before play.
  const negotiationOpen =
    canNegotiate &&
    (fixture.status === "pending" || fixture.status === "scheduled");
  const active = latestActiveProposal(fixture.proposals);
  const otherActive = active && active.userId !== currentUserId ? active : null;
  const homeName = teamNameById.get(fixture.homeTeamId) ?? "Equipo";
  const awayName = teamNameById.get(fixture.awayTeamId) ?? "Equipo";
  // Resolve proposer display names from the two participants (home/away owners).
  const ownerNameByUserId = new Map<string, string>();
  for (const owner of [fixture.homeOwner, fixture.awayOwner]) {
    if (owner) ownerNameByUserId.set(owner.id, owner.name ?? owner.id);
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`Acordar fecha · ${homeName} vs ${awayName}`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-[#e2e8f0] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between bg-[#12225a] px-4 py-3 text-white">
          <h3 className="text-sm font-bold">
            Acordar fecha · {homeName} vs {awayName}
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Cerrar panel de negociación"
            className="text-xs font-semibold text-white/80 hover:text-white"
          >
            ✕ Cerrar
          </button>
        </header>

        <div className="px-4 py-3">
          <h4 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">
            Historial de propuestas
          </h4>
          {submitError ? (
            <p role="alert" className="mb-2 text-xs text-red-600">
              {submitError}
            </p>
          ) : null}
          <ul className="divide-y divide-[#f1f5f9]">
            {fixture.proposals.length === 0 ? (
              <li className="py-2 text-sm text-slate-500">
                Todavía no hay propuestas de fecha.
              </li>
            ) : (
              fixture.proposals.map((proposal) => (
                <li
                  key={proposal.id}
                  className={`flex flex-wrap items-center justify-between gap-2 py-2 text-sm ${
                    proposal.acceptedAt ? "bg-green-50 px-2" : ""
                  }`}
                >
                  <span className="min-w-[70px] font-bold text-[#12225a]">
                    {ownerNameByUserId.get(proposal.userId) ?? proposal.userId}
                  </span>
                  <span className="text-[#475569]">
                    {formatProposalDateTime(proposal.date)} · {authorDisplay(proposal)}
                  </span>
                  {proposal.acceptedAt ? (
                    <span className="font-bold text-green-600">✓ Acordado</span>
                  ) : otherActive?.id === proposal.id && negotiationOpen ? (
                    <button
                      type="button"
                      onClick={() => onAccept(proposal.id)}
                      className="rounded-sm bg-[#12225a] px-2.5 py-1 text-xs font-semibold text-white hover:bg-[#0f1d4d]"
                    >
                      Aceptar
                    </button>
                  ) : null}
                </li>
              ))
            )}
          </ul>

          {fixture.status === "scheduled" && canNegotiate ? (
            <p className="mt-3 text-xs font-bold uppercase tracking-wide text-[#12225a]">
              Re-programar
            </p>
          ) : null}

          {negotiationOpen ? (
            <ProposeForm onPropose={onPropose} />
          ) : canNegotiate ? (
            <p className="mt-3 text-xs text-slate-500">
              La negociación quedó cerrada — el partido ya se jugó.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function authorDisplay(proposal: ScheduleProposal): string {
  return proposal.acceptedAt ? "acepta" : "propone";
}

/** Pure: formats a proposal ISO date for the history list with its time. */
export function formatProposalDateTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString("es-ES", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ProposeForm({ onPropose }: { onPropose: (date: string) => void }) {
  return (
    <form
      className="mt-3 border-t border-[#e2e8f0] pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        const iso = buildProposalDateTime(
          String(form.get("date") ?? ""),
          String(form.get("time") ?? ""),
        );
        if (iso) onPropose(iso);
      }}
    >
      <div className="flex gap-2">
        <label className="flex-1 text-xs font-medium text-slate-600">
          Fecha
          <input
            name="date"
            type="date"
            required
            aria-label="Fecha propuesta"
            className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
          />
        </label>
        <label className="flex-1 text-xs font-medium text-slate-600">
          Hora
          <input
            name="time"
            type="time"
            required
            aria-label="Hora propuesta"
            className="mt-1 w-full rounded-sm border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
          />
        </label>
        <button
          type="submit"
          className="self-end rounded-sm bg-[#12225a] px-4 py-1.5 text-sm font-bold text-white hover:bg-[#0f1d4d]"
        >
          Proponer
        </button>
      </div>
    </form>
  );
}
