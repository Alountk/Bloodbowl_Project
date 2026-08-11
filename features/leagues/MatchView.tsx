"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { PE_MVP } from "@/lib/rules";
import { getMatchDetail, type MatchDetail } from "./api";
import { buildMatchSummary, type MatchSummarySection } from "./matchSummary";
import { formatMatchDate } from "./MatchCard";

/**
 * Internal single-match fetch hook mirroring `useLeagueDetail`: loads the match
 * detail and flags `notFound` on a 404 so the view collapses to the not-found
 * panel (D2, matches LeagueDetail). Cancelled-flag guards late setState.
 */
function useMatchDetail(leagueId: string, fixtureId: string) {
  const [detail, setDetail] = useState<MatchDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [notFound, setNotFound] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const match = await getMatchDetail(leagueId, fixtureId);
      setDetail(match);
      setError(null);
      setNotFound(false);
    } catch (e) {
      const status = (e as { status?: number }).status;
      if (status === 404) {
        setNotFound(true);
      } else {
        setError(e instanceof Error ? e.message : "No se pudo cargar el partido.");
      }
    } finally {
      setLoading(false);
    }
  }, [leagueId, fixtureId]);

  useEffect(() => {
    let cancelled = false;
    getMatchDetail(leagueId, fixtureId)
      .then((match) => {
        if (!cancelled) setDetail(match);
      })
      .catch((e) => {
        if (cancelled) return;
        const status = (e as { status?: number }).status;
        if (status === 404) {
          setNotFound(true);
        } else {
          setError(e instanceof Error ? e.message : "No se pudo cargar el partido.");
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [leagueId, fixtureId]);

  return { detail, loading, error, notFound, refresh };
}

/**
 * Inert live shells (MV-5): receive `live` but never render a visible
 * placeholder — for static fixtures the parent passes `null` and these render
 * nothing, so no turn/clock/event UI ever appears until a future live change
 * feeds real data.
 */
function LiveTurnBar({ live }: { live: null }) {
  void live;
  return null;
}
function LiveClock({ live }: { live: null }) {
  void live;
  return null;
}
function LiveEventFeed({ live }: { live: null }) {
  void live;
  return null;
}

function Coins({ value }: { value: number | null | undefined }) {
  return <>{value?.toLocaleString("es-ES") ?? ""}</>;
}

function SectionRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <li className="flex items-baseline justify-between gap-3 border-b border-[#e2e8f0] py-2 px-3 last:border-b-0">
      <span className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{label}</span>
      <span className="text-right text-sm text-slate-800">{children}</span>
    </li>
  );
}

function PlayedSections({ sections }: { sections: MatchSummarySection[] }) {
  const score = sections.find((s): s is Extract<MatchSummarySection, { type: "score" }> => s.type === "score");
  const teams = sections.find((s): s is Extract<MatchSummarySection, { type: "teams" }> => s.type === "teams");
  const fans = sections.find((s): s is Extract<MatchSummarySection, { type: "fans" }> => s.type === "fans");
  const winnings = sections.find((s): s is Extract<MatchSummarySection, { type: "winnings" }> => s.type === "winnings");
  const casualties = sections.find((s): s is Extract<MatchSummarySection, { type: "casualties" }> => s.type === "casualties");
  const weather = sections.find((s): s is Extract<MatchSummarySection, { type: "weather" }> => s.type === "weather");
  const pe = sections.find((s): s is Extract<MatchSummarySection, { type: "pe" }> => s.type === "pe");
  const mvp = sections.find((s): s is Extract<MatchSummarySection, { type: "mvp" }> => s.type === "mvp");

  return (
    <div className="bg-white border border-[#e2e8f0]">
      {/* Scoreboard */}
      {score ? (
        <div className="px-4 py-4 text-center">
          <p className="text-3xl font-black text-[#12225a]">
            {score.home} <span className="text-[#d11938]">–</span> {score.away}
          </p>
          <p className="mt-1 text-sm font-semibold text-[#d11938]">{score.winnerName}</p>
        </div>
      ) : null}

      <div className="flex flex-wrap gap-3 px-4 pb-4 sm:flex-nowrap">
        {teams ? (
          <>
            <div className="flex-1 border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <p className="text-sm font-bold text-[#12225a]">{teams.home.name}</p>
              <p className="text-xs text-slate-500">
                {teams.home.raceName ?? "—"} · {teams.home.coachName ?? "—"}
              </p>
            </div>
            <div className="flex-1 border border-[#e2e8f0] bg-[#f8fafc] p-3">
              <p className="text-sm font-bold text-[#12225a]">{teams.away.name}</p>
              <p className="text-xs text-slate-500">
                {teams.away.raceName ?? "—"} · {teams.away.coachName ?? "—"}
              </p>
            </div>
          </>
        ) : null}
      </div>

      <ul className="px-4 pb-4">
        {fans ? (
          <SectionRow label="Afición">
            {fans.home} · {fans.away}
          </SectionRow>
        ) : null}
        {winnings ? (
          <SectionRow label="Ganancias">
            <Coins value={winnings.home} /> · <Coins value={winnings.away} />
          </SectionRow>
        ) : null}
        {weather ? <SectionRow label="Clima">{weather.label}</SectionRow> : null}
        {casualties ? (
          <SectionRow label="Heridas">
            {casualties.items.map((c) => (
              <span key={`${c.label}:${c.playerName}`} className="block">
                {c.playerName} · {c.label}
              </span>
            ))}
          </SectionRow>
        ) : null}
      </ul>

      {pe && pe.home.concat(pe.away).length > 0 ? (
        <div className="border-t border-[#e2e8f0] px-4 py-3">
          <h3 className="mb-2 text-[11px] font-bold uppercase tracking-wide text-slate-500">PE</h3>
          <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
            {pe.home.map((row, i) => (
              <li key={`home:${row.playerName}:${i}`} className="flex justify-between text-sm">
                <span>{row.playerName}</span>
                <span className="text-slate-600">{row.pe} PE</span>
              </li>
            ))}
            {pe.away.map((row, i) => (
              <li key={`away:${row.playerName}:${i}`} className="flex justify-between text-sm">
                <span>{row.playerName}</span>
                <span className="text-slate-600">{row.pe} PE</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {mvp ? (
        <div className="border-t-2 border-[#d11938] bg-[#12225a] px-4 py-3 text-white">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[#cbd5e1]">Jugador del partido</p>
          <div className="mt-1 flex flex-wrap justify-between gap-2">
            <p className="text-sm font-bold">
              {mvp.home ? `${mvp.home.playerName} · +${PE_MVP} PE` : "—"}
            </p>
            <p className="text-sm font-bold">
              {mvp.away ? `${mvp.away.playerName} · +${PE_MVP} PE` : "—"}
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/**
 * The match view page (client, D2): fetches the match detail and renders the
 * three lifecycle states plus the walkover notice and inert live shells.
 * League-section copy is Spanish; only rulebook-light tokens are used (MV-7).
 */
export function MatchView({ leagueId, fixtureId }: { leagueId: string; fixtureId: string }) {
  const { detail, loading, error, notFound } = useMatchDetail(leagueId, fixtureId);

  // Inert shells receive live:null → render nothing (MV-5/MV-6).
  const live: null = null;

  if (notFound) {
    return (
      <div className="border border-[#e2e8f0] bg-white p-8 text-center">
        <p className="text-sm text-slate-600">Partido no encontrado.</p>
        <Link
          href="/leagues"
          className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
        >
          Volver a mis ligas
        </Link>
      </div>
    );
  }

  if (!loading && !detail) {
    return (
      <div className="border border-[#e2e8f0] bg-white p-8 text-center">
        <p className="text-sm text-slate-600">{error ?? "No se pudo cargar el partido."}</p>
      </div>
    );
  }

  if (!detail) {
    return (
      <div className="flex min-h-[200px] items-center justify-center bg-white p-8">
        <p className="text-sm text-slate-500" role="status">
          Cargando partido…
        </p>
      </div>
    );
  }

  const summary = buildMatchSummary(detail);

  let body: React.ReactNode;
  if (summary.walkover) {
    body = (
      <div className="border border-[#e2e8f0] bg-white px-4 py-4 text-center">
        <p className="text-3xl font-black text-[#12225a]">
          {detail.fixture.homeScore} <span className="text-[#d11938]">–</span> {detail.fixture.awayScore}
        </p>
        <p className="mt-2 text-sm font-semibold text-[#d11938]">Victoria por incomparecencia.</p>
      </div>
    );
  } else if (detail.fixture.status === "scheduled") {
    body = (
      <div className="border border-[#e2e8f0] bg-white px-4 py-6 text-center">
        <p className="text-sm font-semibold text-slate-600">
          Programado: {formatMatchDate(detail.fixture.scheduledAt)}
        </p>
      </div>
    );
  } else if (detail.fixture.status === "pending") {
    body = (
      <div className="border border-[#e2e8f0] bg-white px-4 py-6 text-center">
        <p className="text-sm font-semibold text-slate-600">Sin jornada programada todavía.</p>
      </div>
    );
  } else {
    body = <PlayedSections sections={summary.sections} />;
  }

  return (
    <section aria-label={`Partido ${detail.fixture.round}`}>
      <header className="mb-5 bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h1 className="border-b-[3px] border-[#d11938] pb-1 text-2xl font-black tracking-[0.02em] md:text-[24px]">
              Partido {detail.fixture.round}
            </h1>
            <p className="mt-1 text-[13px] text-[#cbd5e1]">
              {detail.homeTeam.name} vs {detail.awayTeam.name}
            </p>
          </div>
          <Link
            href={`/leagues/${leagueId}`}
            className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:border-white"
          >
            Volver
          </Link>
        </div>
      </header>

      {body}

      <LiveTurnBar live={live} />
      <LiveClock live={live} />
      <LiveEventFeed live={live} />
    </section>
  );
}
