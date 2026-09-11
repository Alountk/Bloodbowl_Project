"use client";

import { useEffect, useState } from "react";
import { useI18n } from "@/lib/i18n";
import type { WatchLiveView, WatchMatchDto, WatchTeam } from "@/lib/watchAccess";
import { useWatchLive } from "./useWatchLive";
import { useLiveClock } from "./useLiveClock";
import { LiveEventCards } from "./liveEventCards";
import { MatchTimelineBar } from "./matchTimelineBar";
import { Icon } from "./icons";
import type { MatchTeamDetail } from "./api";

/**
 * The PUBLIC guest watch page (MSL-6). A lean, read-only view of a shared match:
 * score, clock and the event timeline. It consumes the reduced
 * `GET /api/watch/[token]` DTO for the first paint and `useWatchLive` for the
 * streamed updates.
 *
 * PRIVACY: the guest DTO carries no roster, owner, PE, MVP, resolution,
 * inducements, consent or winnings — so this view reuses the presentational
 * `MatchTimelineBar`/`LiveEventCards` (adapted through `toMatchTeamDetail`) but
 * NEVER mounts any member control. `viewerSide` is forced `null`, which is the
 * existing gate that hides every coach affordance (share, begin, concede, ✓/✗).
 */

/** Formats a millisecond value as H:MM:SS (mirrors MatchView's FormatHms). */
function formatHms(ms: number): string {
  const totalSeconds = Math.floor(Math.max(ms, 0) / 1000);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;
  return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

/**
 * Adapts a reduced guest team to the presentational `MatchTeamDetail` shape the
 * shared feed/timeline components expect. The guest DTO deliberately carries no
 * roster or owner, so `players` is empty and `user` is null — the cards render
 * their player-less fallback and never leak private data.
 */
function toMatchTeamDetail(team: WatchTeam): MatchTeamDetail {
  return { id: team.id, name: team.name, raceId: team.raceId, user: null, players: [] };
}

function scoreText(value: number | null): string {
  return value == null ? "–" : String(value);
}

export function WatchMatchView({ token }: { token: string }) {
  const { t } = useI18n();
  const [dto, setDto] = useState<WatchMatchDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/watch/${encodeURIComponent(token)}`);
        if (cancelled) return;
        // The server returns ONE generic 404 for unknown OR expired links — the
        // guest shows the identical copy and never distinguishes the two.
        if (res.status === 404) {
          setUnavailable(true);
          return;
        }
        if (!res.ok) throw new Error(`Request failed (${res.status})`);
        const body = (await res.json()) as WatchMatchDto;
        if (!cancelled) setDto(body);
      } catch {
        if (!cancelled) setUnavailable(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  // The streamed reduced view wins once it arrives; before that the DTO's
  // persisted `live` paints the first frame.
  const { live: streamed } = useWatchLive({ token });
  const live: WatchLiveView | null = streamed ?? dto?.live ?? null;
  const clock = useLiveClock(live);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p role="status" className="text-sm text-slate-500">
          {t("watch.loading")}
        </p>
      </div>
    );
  }

  if (unavailable || dto == null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background px-4">
        <p role="alert" className="text-center text-sm font-bold text-navy">
          {t("watch.closed")}
        </p>
      </div>
    );
  }

  const homeTeam = toMatchTeamDetail(dto.homeTeam);
  const awayTeam = toMatchTeamDetail(dto.awayTeam);
  const isLive = live?.status === "live";
  const isFinished = live?.status === "finished";
  const scoreHome = live ? live.homeScore : dto.fixture.homeScore;
  const scoreAway = live ? live.awayScore : dto.fixture.awayScore;

  return (
    <div className="min-h-screen bg-background" data-testid="watch-page">
      <div
        data-testid="watch-header"
        className="sticky top-0 z-40 border-b border-navy-tint bg-navy shadow-[0_6px_16px_rgba(15,23,42,0.18)]"
      >
        <div className="flex items-center gap-2.5 px-3 py-2">
          <p className="min-w-0 truncate text-[11px] font-bold uppercase tracking-[0.04em] text-border-subtle">
            {t("watch.title")}
          </p>
          <span className="ml-auto flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wide">
            {isLive ? (
              <span className="rounded-full bg-red px-2 py-0.5 text-white">{t("match.liveBadge")}</span>
            ) : null}
            {isFinished ? (
              <span className="rounded-full bg-navy-tint px-2 py-0.5 text-white">
                {t("watch.finished")}
              </span>
            ) : null}
            <span className="rounded-full border border-white/30 px-2 py-0.5 text-border-subtle">
              {t("watch.shared")}
            </span>
          </span>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-x-3 px-3 pb-3">
          <p className="truncate text-center text-sm font-bold text-white">{dto.homeTeam.name}</p>
          <p className="font-display text-2xl font-semibold leading-none tabular-nums text-white">
            <span data-testid="watch-score-home">{scoreText(scoreHome)}</span>
            <span aria-hidden="true"> - </span>
            <span data-testid="watch-score-away">{scoreText(scoreAway)}</span>
          </p>
          <p className="truncate text-center text-sm font-bold text-white">{dto.awayTeam.name}</p>
        </div>
        <div className="flex items-center justify-center gap-1 border-t border-white/10 px-3 py-1.5 text-xs font-extrabold tabular-nums text-white">
          <Icon name="timer" className="h-3.5 w-3.5 text-border-subtle" />
          <span data-testid="watch-clock">{live ? formatHms(clock.elapsed) : "–"}</span>
        </div>
      </div>

      {live ? (
        <div className="bg-panel border border-border">
          <MatchTimelineBar
            events={live.events}
            startedAt={live.startedAt}
            finishedAt={live.finishedAt}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
          />
          <LiveEventCards
            events={live.events}
            startedAt={live.startedAt}
            homeTeam={homeTeam}
            awayTeam={awayTeam}
            // MSL-6: forced null — the existing viewerSide gates hide every control.
            viewerSide={null}
            now={live.startedAt != null ? live.startedAt + live.elapsed : 0}
            onAck={() => undefined}
          />
        </div>
      ) : null}
    </div>
  );
}
