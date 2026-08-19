"use client";

import { useRef, useState } from "react";
import type { PlayerEntry, Race } from "../types";
import { MAX_PLAYERS } from "../roster";
import { formatRulebookCost } from "../format";
import { translateRole } from "../roster-table/RosterTable";
import { useI18n } from "@/lib/i18n";

export interface HirePlayerDialogProps {
  race: Race;
  roster: PlayerEntry[];
  /** The team's CURRENT spendable balance (STARTING_TREASURY + treasury − costs). */
  balance: number;
  /** Hire-route client (positionalKey); resolves `{ error }` on failure. */
  onHire: (positionalKey: string) => Promise<Record<string, unknown>>;
  onClose: () => void;
}

/**
 * HirePlayerDialog — owner-only hiring panel opened from the team detail
 * (RAU-11). Lists the race's positionals with cost and count/max; a row is
 * disabled when it would exceed the roster cap or the CURRENT spendable
 * balance (which includes accumulated winnings). Rows already at their
 * positional max are hidden. Hiring persists through the hire route; the
 * parent refreshes the team afterwards.
 */
export function HirePlayerDialog({
  race,
  roster,
  balance,
  onHire,
  onClose,
}: HirePlayerDialogProps) {
  const { t } = useI18n();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Guards the backdrop-close against a click retargeted from a re-rendered
  // hire button (see PlayerImproveModal — same race guard).
  const pointerDownOnBackdrop = useRef(false);

  const countFor = (positionalKey: string): number =>
    roster.filter((player) => player.positionalKey === positionalKey).length;

  const rosterFull = roster.length >= MAX_PLAYERS;

  // Like the create wizard, a positional at its max disappears entirely; the
  // rest stay visible but disable when over budget or at the roster cap.
  const rows = race.positionals
    .map((positional) => {
      const count = countFor(positional.key);
      const overBudget = positional.cost > balance;
      return {
        positional,
        count,
        missingCount: positional.max - count,
        overBudget,
        disabled: overBudget || rosterFull,
      };
    })
    .filter((row) => row.missingCount > 0);

  async function hire(positionalKey: string) {
    setBusy(true);
    setError(null);
    const res = await onHire(positionalKey);
    if (typeof res.error === "string") {
      setError(res.error);
      setBusy(false);
      return;
    }
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#0f172a]/55 p-4"
      onMouseDown={(e) => {
        pointerDownOnBackdrop.current = e.target === e.currentTarget;
      }}
      onClick={(e) => {
        if (pointerDownOnBackdrop.current && e.target === e.currentTarget) onClose();
        pointerDownOnBackdrop.current = false;
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("detail.hireDialogAria")}
        data-testid="hire-dialog"
        className="w-full max-w-[520px] overflow-hidden bg-white text-[#1a1a1a] shadow-[0_20px_40px_rgba(0,0,0,0.3)]"
      >
        <header className="flex items-center justify-between bg-[#12225a] py-3.5 pr-4 pl-4 text-white">
          <div>
            <h3 className="text-[17px] font-bold">{t("detail.hireTitle")}</h3>
            <p className="text-[12px] text-[#cbd5e1]">
              {t("detail.hireBalance", { amount: formatRulebookCost(balance) })}
            </p>
          </div>
          <button
            type="button"
            aria-label={t("detail.modal.close")}
            onClick={onClose}
            className="grid h-7 w-7 place-items-center rounded text-[20px] leading-none text-white hover:bg-white/10"
          >
            ×
          </button>
        </header>

        <div className="max-h-[55vh] overflow-auto p-3">
          {rosterFull ? (
            <p className="px-2 py-3 text-[13px] font-medium text-[#d11938]" data-testid="hire-full-note">
              {t("detail.hireFull", { max: MAX_PLAYERS })}
            </p>
          ) : null}
          <div className="divide-y divide-[#e2e8f0]">
            {rows.map(({ positional, count, disabled, overBudget }) => (
              <div key={positional.key} className="flex items-center justify-between gap-3 px-2 py-2.5">
                <div className="min-w-0">
                  <p className="text-[13.5px] font-semibold text-[#1a1a1a]">{positional.name}</p>
                  <p className="text-[11px] text-[#64748b]">
                    ({translateRole(positional.role)}, {race.name}) · {formatRulebookCost(positional.cost)}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <span className="text-[11.5px] font-bold text-[#64748b] tabular-nums">
                    {count}/{positional.max}
                  </span>
                  <button
                    type="button"
                    data-testid={`hire-${positional.key}`}
                    aria-label={t("detail.hireAction", { name: positional.name })}
                    disabled={disabled || busy}
                    onClick={() => void hire(positional.key)}
                    className="rounded bg-[#12225a] px-3 py-1 text-[12.5px] font-bold text-white disabled:cursor-not-allowed disabled:opacity-40"
                  >
                    {overBudget ? t("detail.hireNoFunds") : t("detail.hire")}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {error ? (
          <p role="alert" data-testid="hire-error" className="px-4 pt-1 text-[12px] font-medium text-[#d11938]">
            {error}
          </p>
        ) : null}

        <div className="flex justify-end border-t border-[#e2e8f0] px-4 py-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded bg-[#f1f5f9] px-4 py-2 text-[13px] font-bold text-[#334155]"
          >
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </div>
  );
}
