import { useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { FixtureDraft } from "./api";

export interface ForfeitModalProps {
  open: boolean;
  fixture: FixtureDraft;
  teamNameById: Map<string, string>;
  /** Fires with the winning team id to POST forfeit. */
  onAward: (winnerTeamId: string) => void;
  onClose: () => void;
}

/**
 * Admin-only walkover modal. The league owner picks which of the two fixture
 * teams wins (home or away) and confirms; onAward(winnerTeamId) posts the
 * forfeit that derives the fixture `played`. Renders nothing when closed.
 */
export function ForfeitModal({
  open,
  fixture,
  teamNameById,
  onAward,
  onClose,
}: ForfeitModalProps) {
  const [selected, setSelected] = useState<string | null>(null);
  const { t } = useI18n();
  if (!open) return null;

  const homeName = teamNameById.get(fixture.homeTeamId) ?? t("match.teamFallback");
  const awayName = teamNameById.get(fixture.awayTeamId) ?? t("match.teamFallback");

  const confirm = () => {
    if (selected) onAward(selected);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={t("forfeit.dialogAria")}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md border border-[#e2e8f0] bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between bg-[#12225a] px-4 py-3 text-white">
          <h3 className="text-sm font-bold">{t("forfeit.title")}</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label={t("common.close")}
            className="text-xs font-semibold text-white/80 hover:text-white"
          >
            ✕ {t("common.close")}
          </button>
        </header>
        <div className="px-4 py-3">
          <p className="mb-3 text-sm text-slate-600">
            {t("forfeit.prompt")}
          </p>
          <div className="grid grid-cols-2 gap-2">
            <OptionButton
              name={homeName}
              selected={selected === fixture.homeTeamId}
              onSelect={() => setSelected(fixture.homeTeamId)}
            />
            <OptionButton
              name={awayName}
              selected={selected === fixture.awayTeamId}
              onSelect={() => setSelected(fixture.awayTeamId)}
            />
          </div>
          <div className="mt-4 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-sm border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-600 hover:border-slate-400"
            >
              {t("common.cancel")}
            </button>
            <button
              type="button"
              disabled={!selected}
              onClick={confirm}
              className="rounded-sm bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {selected ? t("forfeit.award", { team: teamNameById.get(selected) ?? "" }) : t("forfeit.pickTeam")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function OptionButton({
  name,
  selected,
  onSelect,
}: {
  name: string;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`rounded-md border px-3 py-2 text-sm font-bold ${
        selected
          ? "border-[#d11938] bg-[#d11938] text-white"
          : "border-slate-300 text-[#12225a] hover:border-slate-400"
      }`}
    >
      {name}
    </button>
  );
}
