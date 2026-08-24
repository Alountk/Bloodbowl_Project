"use client";

import { CreateTeamForm } from "@/features/teams/create/CreateTeamForm";
import { useI18n } from "@/lib/i18n";
import type { RulesetDto } from "@/lib/rulesets";

interface CreateLeagueTeamModalProps {
  open: boolean;
  leagueId: string;
  /** The league's ruleset (RAU-56): preconfigures the wizard — allowed races,
   * treasury, min/max players and TV cap. Null = rulebook defaults. */
  ruleset: RulesetDto | null;
  onClose: () => void;
  /** Called after a successful creation so the hosting detail closes + refreshes. */
  onCreated?: () => void;
}

/**
 * RAU-56 modal: creates a team ALREADY assigned to this league, governed by its
 * ruleset. The wizard filters races and applies the ruleset budget/bounds; the
 * server enforces the same rules on POST. On success the hosting detail closes
 * the modal and refreshes — the new member team appears immediately.
 */
export function CreateLeagueTeamModal({
  open,
  leagueId,
  ruleset,
  onClose,
  onCreated,
}: CreateLeagueTeamModalProps) {
  const { t } = useI18n();

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        type="button"
        aria-label={t("leagues.joinCreate.closeAria")}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={t("leagues.joinCreateTitle")}
        className="relative max-h-[92vh] w-full max-w-[900px] overflow-y-auto rounded-md border border-[#e2e8f0] bg-white"
      >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-[#e2e8f0] bg-[#12225a] px-4 py-3 text-white">
          <h2 className="text-sm font-black uppercase tracking-wide">
            {t("leagues.joinCreateTitle")}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 text-lg font-bold leading-none hover:bg-white/10"
            aria-label={t("leagues.joinCreate.closeAria")}
          >
            ×
          </button>
        </div>
        <div className="p-4">
          {ruleset ? (
            <p className="mb-3 text-[12px] text-slate-600">{t("leagues.joinCreateHint")}</p>
          ) : null}
          <CreateTeamForm ruleset={ruleset} leagueId={leagueId} onCreated={onCreated} />
        </div>
      </div>
    </div>
  );
}
