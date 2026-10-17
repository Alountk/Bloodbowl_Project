"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useI18n } from "@/lib/i18n";
import { getMatchDetail, type MatchDetail } from "./api";
import { useLeague } from "./useLeagueName";

interface MatchViewV2Props {
  leagueId: string;
  fixtureId: string;
}

/**
 * Live match V2 skeleton (ui-refresh seam 6, UIR-2): presentation-only
 * rewrite of the fixture surface. It reuses the legacy surface's OWN channel —
 * `getMatchDetail` (single `GET /api/leagues/{id}/fixtures/{fid}`) and
 * `useLeague` (`GET /api/leagues/{id}`) — and mirrors the legacy loading /
 * not-found / error semantics with `ui-v2-match-*` markers.
 *
 * Slice 1 ships the header + score strip on the pending fixture; slice 2 grows
 * the consent/acta/dock zones on the shared atoms (`MatchTimelineBar`,
 * `LiveActionDock`, `LiveEventCardsActa`, modals) per Stitch "Partido en
 * Directo (Acta en Vivo)"). No direct network calls here: the endpoint lives
 * only in `features/leagues/api.ts`, which legacy itself imports
 * (presentation-only).
 */
export function MatchViewV2({ leagueId, fixtureId }: MatchViewV2Props) {
  const { t } = useI18n();
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);
  const league = useLeague(leagueId);

  useEffect(() => {
    // Cancelled-flag guard: a stale response must not regress the state
    // (same contract as the legacy `useMatchDetail`).
    let cancelled = false;
    getMatchDetail(leagueId, fixtureId)
      .then((match) => {
        if (cancelled) return;
        setDetail(match);
        setError(null);
        setNotFound(false);
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        const status = (e as { status?: number }).status;
        if (status === 404) {
          setNotFound(true);
        } else {
          setError(e instanceof Error ? e.message : t("match.loadError"));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, fixtureId, t]);

  if (notFound) {
    return (
      <div data-testid="ui-v2-match-not-found" className="border border-border bg-panel p-8 text-center">
        <p className="text-sm text-slate-600">{t("match.notFound")}</p>
        <Link
          href="/leagues"
          className="mt-4 inline-block bg-navy px-4 py-2 text-sm font-bold text-white hover:bg-navy-hover"
        >
          {t("leagues.backToLeagues")}
        </Link>
      </div>
    );
  }

  if (!loading && !detail) {
    return (
      <div data-testid="ui-v2-match-error" className="border border-border bg-panel p-8 text-center">
        <p className="text-sm text-slate-600">{error ?? t("match.loadError")}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div
        data-testid="ui-v2-match-loading"
        className="flex min-h-[200px] items-center justify-center bg-panel p-8"
      >
        <p className="text-sm text-slate-500" role="status">
          {t("match.loading")}
        </p>
      </div>
    );
  }

  // Legacy label pattern verbatim (`MatchView.tsx:1742`): "{league} · Jornada {n}".
  const label = `${league.name ? `${league.name} · ` : ""}${t("match.jornada", { round: detail.fixture.round })}`;
  return (
    <div className="bg-panel border border-border">
      <div
        data-testid="ui-v2-match-header"
        className="sticky top-0 z-40 border-b border-navy-tint bg-navy px-4 py-3 shadow-[0_6px_16px_rgba(15,23,42,0.18)]"
      >
        <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.04em] text-border-subtle">
          {label}
        </p>
      </div>
      <div data-testid="ui-v2-match-score" className="flex items-center justify-between gap-4 px-4 py-6">
        <span className="min-w-0 flex-1 truncate text-right text-lg font-extrabold text-navy">
          {detail.homeTeam.name}
        </span>
        <span aria-hidden="true" className="shrink-0 text-xs font-bold text-slate-400">
          –
        </span>
        <span className="min-w-0 flex-1 truncate text-lg font-extrabold text-navy">
          {detail.awayTeam.name}
        </span>
      </div>
    </div>
  );
}
