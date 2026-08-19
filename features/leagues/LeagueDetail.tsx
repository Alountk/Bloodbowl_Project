"use client";

import Link from "next/link";
import { useSession } from "next-auth/react";
import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@/lib/i18n";
import { getRaceById } from "@/features/teams/data/races";
import { StartLeagueModal } from "./StartLeagueModal";
import { useLeagueDetail } from "./useLeagueDetail";
import { MatchCard } from "./MatchCard";
import { NegotiationPanel } from "./NegotiationPanel";
import { ForfeitModal } from "./ForfeitModal";
import { ResultModal, type ResultTeamDraft } from "./ResultModal";
import { buildResultPrefill } from "./resultPrefill";
import { getMatchDetail } from "./api";
import type { FixtureDraft, FixtureRound, ResultPayload } from "./api";

interface LeagueDetailProps {
  leagueId: string;
}

/**
 * Role-aware league detail.
 *
 * The visible controls depend on the league status and the session user's
 * relationship to it:
 * - OPEN + owner (admin): member list with "Expulsar" and an "Iniciar liga"
 *   button (enabled once ≥2 members) that opens the StartLeagueModal.
 * - OPEN + non-owner member: the member's own "Desapuntarse" (self-leave).
 * - OPEN + foreign non-member: "Unirse" — a select of the user's own unassigned
 *   teams plus "Apuntarse"; if the user has no eligible team, a hint appears.
 * - STARTED (owner or member): the jornadas (home vs away per round) with an
 *   "Iniciada" badge; no join/leave/expel controls.
 * - Foreign non-member on a STARTED league: the API returns 404 and we render
 *   the not-found page.
 */
export function LeagueDetail({ leagueId }: LeagueDetailProps) {
  const {
    league,
    unassigned,
    loading,
    error,
    notFound,
    refresh,
    assign,
    expel,
    leave,
    propose,
    accept,
    forfeit,
    submit,
    correct,
  } = useLeagueDetail(leagueId);
  const { data: session } = useSession();
  const { t } = useI18n();
  const [selectedTeamId, setSelectedTeamId] = useState("");
  const [actionError, setActionError] = useState<string | null>(null);
  const [startOpen, setStartOpen] = useState(false);

  const userId = session?.user?.id;
  const isOwner = league?.ownerId === userId;
  const userMemberTeam = league?.teams.find((team) => team.userId === userId);
  const isMember = Boolean(userMemberTeam);

  if (!loading && notFound) {
    return (
      <div className="border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">{t("leagues.notFound")}</p>
        <Link
          href="/leagues"
          className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
        >
          {t("leagues.backToLeagues")}
        </Link>
      </div>
    );
  }

  if (!loading && !league) {
    return (
      <div className="border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">{error ?? t("leagues.loadError")}</p>
      </div>
    );
  }

  if (!league) {
    return (
      <div className="flex min-h-[200px] items-center justify-center bg-white p-8">
        <p className="text-sm text-slate-500" role="status">
          {t("leagues.loading")}
        </p>
      </div>
    );
  }

  const memberCount = league.teams.length;
  const started = league.status === "started";
  const finished = league.status === "finished";
  const championTeam = league.teams.find((team) => team.id === league.championTeamId) ?? null;

  const onJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedTeamId) return;
    setActionError(null);
    try {
      await assign(selectedTeamId);
      setSelectedTeamId("");
    } catch (e) {
      const status = (e as { status?: number }).status;
      setActionError(
        status === 409
          ? t("leagues.assignAlreadyInLeague")
          : e instanceof Error
            ? e.message
            : t("leagues.assignError"),
      );
    }
  };

  const onExpel = async (teamId: string) => {
    setActionError(null);
    try {
      await expel(teamId);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("leagues.expelError"));
    }
  };

  const onLeave = async () => {
    if (!userMemberTeam) return;
    setActionError(null);
    try {
      await leave(userMemberTeam.id);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : t("leagues.leaveError"));
    }
  };

  const onStartCompleted = async () => {
    // StartLeagueModal POSTed /start; refresh so the detail shows the jornadas.
    await refresh();
  };

  return (
    <section aria-labelledby="league-detail-heading">
      {/* Hero */}
      <header className="mb-5 bg-[#12225a] px-4 py-[22px] text-white sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
              <div className="flex items-center gap-3">
                <h1
                  id="league-detail-heading"
                  className="border-b-[3px] border-[#d11938] pb-1 text-2xl font-black tracking-[0.02em] md:text-[24px]"
                >
                  {league?.name}
                </h1>
                {league?.rulesetName ? (
                  <span className="rounded-full bg-white/15 px-2.5 py-0.5 text-[11px] font-semibold text-white">
                    {league.rulesetName}
                  </span>
                ) : null}
                <span
                className={
                  finished
                    ? "rounded-full bg-[#fbbf24] px-2.5 py-0.5 text-[11px] font-bold text-[#12225a]"
                    : started
                      ? "rounded-full bg-white px-2.5 py-0.5 text-[11px] font-bold text-[#12225a]"
                      : "rounded-full bg-green-600 px-2.5 py-0.5 text-[11px] font-bold text-white"
                }
              >
                {finished
                  ? t("leagues.status.finished")
                  : started
                    ? t("leagues.status.started")
                    : t("leagues.status.open")}
              </span>
            </div>
            <p className="mt-1 text-[13px] text-[#cbd5e1]">
              {league?.description ?? t("leagues.noDescription")}
            </p>
            <p className="mt-1 text-[12px] text-[#cbd5e1]">
              {league?.ownerName ?? t("leagues.noOwner")} ·{" "}
              {t(memberCount === 1 ? "leagues.membersOne" : "leagues.membersMany", {
                count: memberCount,
              })}
            </p>
          </div>
          <Link
            href="/leagues"
            className="rounded-md border border-white/40 px-3 py-1.5 text-xs font-semibold text-white hover:border-white"
          >
            {t("leagues.back")}
          </Link>
        </div>
      </header>

      {actionError ? (
        <p role="alert" className="mb-4 text-sm text-red-600">
          {actionError}
        </p>
      ) : null}

      {/* RAU-40: the season champion panel — navy/gold, only on a finished league.
          The member team whose id matches `championTeamId` resolves the name. */}
      {finished && championTeam ? (
        <div
          data-testid="champion-panel"
          className="mb-5 flex flex-wrap items-center justify-between gap-3 border-2 border-[#fbbf24] bg-[#12225a] px-4 py-4 text-white"
        >
          <div className="flex min-w-0 items-center gap-3">
            <span aria-hidden="true" className="text-3xl">
              🏆
            </span>
            <div className="min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[#fbbf24]">
                {t("leagues.championLabel")}
              </p>
              <p className="truncate text-lg font-black">{championTeam.name}</p>
            </div>
          </div>
          <span className="rounded-full bg-[#fbbf24] px-3 py-1 text-[11px] font-bold text-[#12225a]">
            {t("leagues.finishedBadge")}
          </span>
        </div>
      ) : null}

      {started || finished ? (
        <Jornadas
          fixtures={league.fixtures}
          rounds={league.rounds}
          teams={league.teams}
          currentUserId={userId ?? ""}
          isLeagueOwner={isOwner}
          leagueFinished={finished}
          onPropose={propose}
          onAccept={accept}
          onForfeit={forfeit}
          onSubmitResult={submit}
          onCorrectResult={correct}
        />
      ) : (
        <div className="space-y-6">
          {/* Anyone who is not yet a member can join with one of their own
              unassigned teams. This includes the owner, who must add their own
              team (with others) to reach the ≥2 members a season needs. */}
          {!isMember ? (
            <form onSubmit={onJoin} className="rounded-md border border-[#e2e8f0] bg-white p-4">
              <h3 className="mb-2 text-sm font-bold uppercase tracking-wide text-slate-500">
                {t("leagues.join")}
              </h3>
              {unassigned.length === 0 ? (
                <p className="text-sm text-slate-600">{t("leagues.joinHint")}</p>
              ) : (
                <div className="flex flex-wrap items-end gap-3">
                  <div className="min-w-[220px] flex-1">
                    <label htmlFor="league-team-select" className="mb-1 block text-sm font-medium text-slate-700">
                      {t("leagues.yourTeam")}
                    </label>
                    <select
                      id="league-team-select"
                      value={selectedTeamId}
                      onChange={(event) => setSelectedTeamId(event.target.value)}
                      className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-slate-900 outline-none focus:border-blue-500"
                    >
                      <option value="">{t("leagues.selectTeam")}</option>
                      {unassigned.map((team) => (
                        <option key={team.id} value={team.id}>
                          {team.name}
                        </option>
                      ))}
                    </select>
                  </div>
                  <button
                    type="submit"
                    className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48]"
                  >
                    {t("leagues.joinAction")}
                  </button>
                </div>
              )}
            </form>
          ) : null}

          {/* Member list; the owner gets expel and the season start. */}
          <MemberList teams={league.teams} onExpel={onExpel} canExpel={isOwner} />

          {isMember && !isOwner ? (
            <div className="flex justify-end">
              <button
                type="button"
                onClick={onLeave}
                className="rounded-md border border-[#d11938] px-4 py-2 text-sm font-semibold text-[#d11938] hover:bg-[#d11938] hover:text-white"
              >
                {t("leagues.leave")}
              </button>
            </div>
          ) : isOwner ? (
            <>
              <div className="flex justify-end">
                <button
                  type="button"
                  disabled={memberCount < 2}
                  onClick={() => setStartOpen(true)}
                  className="rounded-md bg-[#12225a] px-4 py-2 text-sm font-semibold text-white hover:bg-[#0f1d48] disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {t("leagues.start")}
                </button>
              </div>
              <StartLeagueModal
                open={startOpen}
                leagueId={league.id}
                teamCount={memberCount}
                onClose={() => setStartOpen(false)}
                onStarted={onStartCompleted}
              />
            </>
          ) : null}
        </div>
      )}
    </section>
  );
}

/** Member team list; `canExpel` toggles the owner's Expulsar button. */
function MemberList({
  teams,
  onExpel,
  canExpel,
}: {
  teams: { id: string; name: string; raceId: string; roster: unknown }[];
  onExpel: (teamId: string) => void;
  canExpel: boolean;
}) {
  const { t } = useI18n();
  return (
    <ul className="divide-y divide-[#e2e8f0] rounded-md border border-[#e2e8f0] bg-white">
      {teams.length === 0 ? (
        <li className="p-6 text-center text-sm text-slate-600">{t("leagues.noMembers")}</li>
      ) : (
        teams.map((team) => {
          const race = getRaceById(team.raceId);
          const playerCount = Array.isArray(team.roster) ? team.roster.length : 0;
          return (
            <li
              key={team.id}
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3"
            >
              <div className="min-w-0">
                <p className="font-semibold text-[#12225a]">{team.name}</p>
                <p className="text-xs text-slate-500">
                  {race?.name ?? team.raceId} ·{" "}
                  {t(playerCount === 1 ? "leagues.playersOne" : "leagues.playersMany", {
                    count: playerCount,
                  })}
                </p>
              </div>
              {canExpel ? (
                <button
                  type="button"
                  onClick={() => onExpel(team.id)}
                  className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-semibold text-[#d11938] hover:border-[#d11938] hover:bg-[#d11938] hover:text-white"
                >
                  {t("leagues.expel")}
                </button>
              ) : null}
            </li>
          );
        })
      )}
    </ul>
  );
}

/**
 * Jornadas (Pattern B): round tabs with the first/current round selected by
 * default. Each round renders its fixtures as MatchCards (centered VS with the
 * owner below each team, team→scouting link, status badge) and a round
 * completion badge once every fixture is played. Clicking a card opens the
 * participant-only NegotiationPanel; the league owner gets an admin-only
 * ForfeitModal per card.
 */
function Jornadas({
  fixtures,
  rounds,
  teams,
  currentUserId,
  isLeagueOwner,
  leagueFinished = false,
  onPropose,
  onAccept,
  onForfeit,
  onSubmitResult,
  onCorrectResult,
}: {
  fixtures: FixtureDraft[];
  rounds: FixtureRound[];
  teams: { id: string; name: string; raceId?: string; roster: unknown }[];
  currentUserId: string;
  isLeagueOwner: boolean;
  /** RAU-40: a finished league hides the result/forfeit/negotiation affordances
   * while keeping the jornadas (and thus the standings) visible. */
  leagueFinished?: boolean;
  onPropose: (fixtureId: string, date: string) => Promise<void>;
  onAccept: (fixtureId: string, proposalId: string) => Promise<void>;
  onForfeit: (fixtureId: string, winnerTeamId: string) => void;
  onSubmitResult: (fixtureId: string, payload: ResultPayload) => void;
  onCorrectResult: (fixtureId: string, payload: ResultPayload) => void;
}) {
  const teamNameById = useMemo(
    () => new Map(teams.map((team) => [team.id, team.name])),
    [teams],
  );
  const raceNameById = useMemo(
    () =>
      new Map(
        teams.map((team) => [
          team.id,
          team.raceId ? getRaceById(team.raceId)?.name ?? team.raceId : "",
        ]),
      ),
    [teams],
  );
  const roundNumbers = useMemo(
    () => Array.from(new Set(fixtures.map((f) => f.round))).sort((a, b) => a - b),
    [fixtures],
  );
  // Default to the first INCOMPLETE round — the current/active jornada (the old
  // default always opened on round 1 even when it was already complete). Jornadas
  // only mounts once the league (and thus fixtures/rounds) have loaded, so the
  // initializer is authoritative; it is one-shot, so a refresh that completes the
  // viewed round does NOT auto-advance the selection.
  const firstRound = roundNumbers[0] ?? null;
  const [selectedRound, setSelectedRound] = useState<number | null>(
    rounds.find((round) => !round.complete)?.round ?? firstRound,
  );

  const [negotiateFixture, setNegotiateFixture] = useState<FixtureDraft | null>(null);
  const [proposalError, setProposalError] = useState<string | null>(null);
  const [forfeitFixture, setForfeitFixture] = useState<FixtureDraft | null>(null);
  const { t } = useI18n();

  // The fixture whose ResultModal is open, plus its mode ("load" on a scheduled
  // fixture by a captain/admin; "correct" by admin on a played result).
  const [resultFixture, setResultFixture] = useState<FixtureDraft | null>(null);
  const [resultMode, setResultMode] = useState<"load" | "correct">("load");

  // Pure: the home/away rosters (id + name) for a fixture, from the member teams.
  const rostersFor = (fixture: FixtureDraft | null) => {
    const rosterOf = (teamId: string) =>
      (teams.find((t) => t.id === teamId)?.roster as { id: string; name: string }[] | null) ?? [];
    if (!fixture) return [rosterOf(""), rosterOf("")] as const;
    return [rosterOf(fixture.homeTeamId), rosterOf(fixture.awayTeamId)] as const;
  };

  if (roundNumbers.length === 0) {
    return (
      <div className="border border-slate-200 bg-white p-8 text-center">
        <p className="text-sm text-slate-600">{t("leagues.noRounds")}</p>
      </div>
    );
  }

  const activeRound = selectedRound ?? firstRound ?? roundNumbers[0];
  const roundFixtures = fixtures.filter((f) => f.round === activeRound);
  const roundComplete = rounds.find((r) => r.round === activeRound)?.complete ?? false;

  return (
    <div>
      {/* Round tabs — defaults to the current (first incomplete) round. */}
      <div role="tablist" aria-label={t("leagues.rounds")} className="flex gap-1 overflow-x-auto border-b border-[#e2e8f0]">
        {roundNumbers.map((round) => (
          <button
            key={round}
            type="button"
            role="tab"
            aria-selected={round === activeRound}
            aria-label={t("leagues.jornada", { round })}
            onClick={() => setSelectedRound(round)}
            className={`whitespace-nowrap px-4 py-2 text-[13px] font-bold ${
              round === activeRound
                ? "border-b-[3px] border-[#d11938] text-[#12225a]"
                : "text-slate-400 hover:text-slate-600"
            }`}
          >
            {t("leagues.jornada", { round })}
          </button>
        ))}
      </div>

      {/* Round completion badge */}
      <div className="mt-3 flex items-center justify-between px-1">
        <h3 className="text-sm font-bold uppercase tracking-wide text-slate-500">
          {t("leagues.jornada", { round: activeRound })}
        </h3>
        {roundComplete ? (
          <span className="rounded-full bg-green-600 px-2.5 py-0.5 text-[11px] font-bold text-white">
            {t("leagues.roundComplete")}
          </span>
        ) : null}
      </div>

      {/* Match cards for the active round */}
      <div role="region" aria-label={t("leagues.jornada", { round: activeRound })} className="mt-2 grid grid-cols-1 gap-3 md:grid-cols-2">
        {roundFixtures.map((fixture) => (
          <MatchCard
            key={fixture.id}
            fixture={fixture}
            teamNameById={teamNameById}
            raceNameById={raceNameById}
            currentUserId={currentUserId}
            isLeagueOwner={isLeagueOwner}
            leagueFinished={leagueFinished}
            onNegotiate={(f) => {
              setProposalError(null);
              setNegotiateFixture(f);
            }}
            onForfeit={setForfeitFixture}
            onLoadResult={(f) => {
              setResultMode("load");
              setResultFixture(f);
            }}
            onCorrectResult={(f) => {
              setResultMode("correct");
              setResultFixture(f);
            }}
          />
        ))}
      </div>

      {negotiateFixture ? (
        <NegotiationPanel
          fixture={negotiateFixture}
          teamNameById={teamNameById}
          currentUserId={currentUserId}
          isParticipant={
            negotiateFixture.homeOwner?.id === currentUserId ||
            negotiateFixture.awayOwner?.id === currentUserId
          }
          isLeagueOwner={isLeagueOwner}
          onPropose={async (date) => {
            setProposalError(null);
            try {
              await onPropose(negotiateFixture.id, date);
              setNegotiateFixture(null);
            } catch (e) {
              setProposalError(
                e instanceof Error
                  ? t("negotiation.proposeErrorWithMsg", { message: e.message })
                  : t("negotiation.proposeError"),
              );
            }
          }}
          onAccept={async (proposalId) => {
            setProposalError(null);
            try {
              await onAccept(negotiateFixture.id, proposalId);
              setNegotiateFixture(null);
            } catch (e) {
              setProposalError(
                e instanceof Error
                  ? t("negotiation.acceptErrorWithMsg", { message: e.message })
                  : t("negotiation.acceptError"),
              );
            }
          }}
          onClose={() => {
            setProposalError(null);
            setNegotiateFixture(null);
          }}
          submitError={proposalError}
        />
      ) : null}

      {forfeitFixture ? (
        <ForfeitModal
          open
          fixture={forfeitFixture}
          teamNameById={teamNameById}
          onAward={(winnerTeamId) => {
            void onForfeit(forfeitFixture.id, winnerTeamId);
            setForfeitFixture(null);
          }}
          onClose={() => setForfeitFixture(null)}
        />
      ) : null}

      {resultFixture ? (
        <ResultModalFor
          key={resultMode === "correct" ? `c-${resultFixture.id}` : `l-${resultFixture.id}`}
          fixture={resultFixture}
          teamNameById={teamNameById}
          rostersFor={rostersFor}
          mode={resultMode}
          onClose={() => setResultFixture(null)}
          onSubmit={async (payload) => {
            const fixture = resultFixture;
            if (resultMode === "correct") {
              await onCorrectResult(fixture.id, payload);
            } else {
              await onSubmitResult(fixture.id, payload);
            }
            // Only close on success: ResultModal surfaces rejections (e.g. a
            // 409 race) in its alert and keeps itself open.
            setResultFixture(null);
          }}
        />
      ) : null}
    </div>
  );
}

/** Mounts the ResultModal for a fixture, resolving its home/away rosters. */
function ResultModalFor({
  fixture,
  teamNameById,
  rostersFor,
  mode,
  onSubmit,
  onClose,
}: {
  fixture: FixtureDraft;
  teamNameById: Map<string, string>;
  rostersFor: (fixture: FixtureDraft) => readonly [
    { id: string; name: string }[],
    { id: string; name: string }[],
  ];
  mode: "load" | "correct";
  onSubmit: (payload: ResultPayload) => Promise<void>;
  onClose: () => void;
}) {
  const [homeRoster, awayRoster] = rostersFor(fixture);
  // Resolve the finished-live-match prefill (scores + ΣTD) from the fixture GET
  // before mounting the modal, so ResultModal reads it as INITIAL state (the
  // parent keys the modal per fixture — initial only, no reset effect). A
  // fixture without a finished live match opens with an empty draft.
  const [prefill, setPrefill] = useState<{ home: ResultTeamDraft; away: ResultTeamDraft } | undefined>(undefined);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    getMatchDetail(fixture.leagueId, fixture.id)
      .then((match) => {
        if (cancelled) return;
        if (match.live && match.live.status === "finished") {
          setPrefill(buildResultPrefill(match.live));
        }
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setReady(true);
      });
    return () => {
      cancelled = true;
    };
  }, [fixture.leagueId, fixture.id]);

  if (!ready) return null;

  return (
    <ResultModal
      open
      fixture={fixture}
      teamNameById={teamNameById}
      homeRoster={homeRoster}
      awayRoster={awayRoster}
      mode={mode}
      initial={prefill}
      onSubmit={onSubmit}
      onClose={onClose}
    />
  );
}
