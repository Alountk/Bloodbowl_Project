"use client";

import { useState, type FormEvent } from "react";
import { useI18n } from "@/lib/i18n";
import { randomPlayerName } from "../data/playerNames";
import { getRaceById } from "../data/races";
import { createId } from "../id";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_TREASURY,
  computeCoachingCost,
  computeRosterCostFromPlayers,
} from "../roster";
import type {
  CoachingStaff,
  PlayerEntry,
} from "../types";
import { DEFAULT_COACHING } from "../types";

export interface CreateTeamValues {
  name: string;
  raceId: string;
  roster: PlayerEntry[];
  coaching: CoachingStaff;
  /** RAU-56: when set, the team is created ALREADY assigned to this league
   * (the server validates the league's ruleset before persisting). */
  leagueId?: string;
}

interface FormErrors {
  name?: string;
  race?: string;
  players?: string;
  budget?: string;
  tvCap?: string;
}

type Step = 1 | 2;

/** RAU-56: rulebook defaults overridden by the league ruleset when present. */
export interface CreateFormOptions {
  /** The drafting budget base (default 1M). */
  startingTreasury?: number;
  /** Minimum roster size to submit (default 11). */
  minPlayers?: number;
  /** Maximum roster size while adding (default 16). */
  maxPlayers?: number;
  /** League TV cap; null/absent means no cap. */
  tvCap?: number | null;
}

export function useCreateTeamForm(
  onSubmit: (values: CreateTeamValues) => Promise<void>,
  options: CreateFormOptions = {},
) {
  const { t } = useI18n();
  const budget = options.startingTreasury ?? STARTING_TREASURY;
  const minPlayers = options.minPlayers ?? MIN_PLAYERS;
  const maxPlayers = options.maxPlayers ?? MAX_PLAYERS;
  const tvCap = options.tvCap ?? null;
  const [name, setName] = useState("");
  const [raceId, setRaceId] = useState("");
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [coaching, setCoachingState] = useState<CoachingStaff>({ ...DEFAULT_COACHING });
  const [pendingRaceId, setPendingRaceId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [step, setStep] = useState<Step>(1);

  const race = raceId ? getRaceById(raceId) : undefined;
  const cost = race ? computeRosterCostFromPlayers(race, players) : 0;
  const coachingCost = race ? computeCoachingCost(race, coaching) : 0;
  const totalCost = cost + coachingCost;
  const playerCount = players.length;
  const remainingBudget = budget - totalCost;

  // Race change — with pending confirmation if roster is non-empty
  const changeRace = (nextRaceId: string) => {
    if (players.length === 0) {
      setRaceId(nextRaceId);
      setPendingRaceId(null);
    } else {
      setPendingRaceId(nextRaceId);
    }
  };

  const confirmRaceChange = () => {
    if (pendingRaceId !== null) {
      setRaceId(pendingRaceId);
      setPlayers([]);
      setPendingRaceId(null);
    }
  };

  const cancelRaceChange = () => {
    setPendingRaceId(null);
  };

  const goToStep = (next: Step) => {
    setStep(next);
  };

  /** Advances to step 2 only when a name and race are present; otherwise shows errors. */
  const nextStep = () => {
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = t("create.errors.nameRequired");
    if (!raceId) nextErrors.race = t("create.errors.selectRace");
    setErrors(nextErrors);
    if (Object.keys(nextErrors).length > 0) return;
    setStep(2);
  };

  /** Returns to step 1 while preserving all entered state. */
  const backStep = () => {
    setStep(1);
  };

  const addPlayer = (positionalKey: string) => {
    if (!race) return;
    const positional = race.positionals.find((p) => p.key === positionalKey);
    if (!positional) return;
    if (players.length >= maxPlayers) return;
    const countForPositional = players.filter((p) => p.positionalKey === positionalKey).length;
    if (countForPositional >= positional.max) return;
    const nextCost = totalCost + positional.cost;
    if (nextCost > budget) return;

    const newPlayer: PlayerEntry = {
      id: createId(),
      name: randomPlayerName(race.id, new Set(players.map((p) => p.name))),
      positionalKey,
    };
    setPlayers((prev) => [...prev, newPlayer]);
  };

  const removePlayer = (id: string) => {
    setPlayers((prev) => prev.filter((p) => p.id !== id));
  };

  const renamePlayer = (id: string, playerName: string) => {
    setPlayers((prev) =>
      prev.map((p) => (p.id === id ? { ...p, name: playerName } : p)),
    );
  };

  const setCoaching = (patch: Partial<CoachingStaff>) => {
    setCoachingState((prev) => ({ ...prev, ...patch }));
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = t("create.errors.nameRequired");
    if (playerCount < minPlayers) {
      nextErrors.players = t("create.errors.minPlayers", { min: minPlayers });
    }
    if (totalCost > budget) nextErrors.budget = t("create.errors.budget");
    if (tvCap !== null && totalCost > tvCap) nextErrors.tvCap = t("create.errors.tvCap");
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !race) return;

    setIsSubmitting(true);
    onSubmit({
      name: name.trim(),
      raceId,
      roster: players,
      coaching,
    }).finally(() => {
      setIsSubmitting(false);
      setName("");
      setRaceId("");
      setPlayers([]);
      setCoachingState({ ...DEFAULT_COACHING });
      setPendingRaceId(null);
      setStep(1);
    });
  };

  return {
    step,
    goToStep,
    nextStep,
    backStep,
    name,
    setName,
    raceId,
    changeRace,
    players,
    addPlayer,
    removePlayer,
    renamePlayer,
    pendingRaceId,
    confirmRaceChange,
    cancelRaceChange,
    errors,
    cost,
    coachingCost,
    totalCost,
    playerCount,
    remainingBudget,
    /** RAU-56: the league TV cap driving the submit validation (null = none). */
    tvCap,
    isSubmitting,
    handleSubmit,
    coaching,
    setCoaching,
  };
}
