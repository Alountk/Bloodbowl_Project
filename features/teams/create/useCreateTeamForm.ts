"use client";

import { useState, type FormEvent } from "react";
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
  TeamLeagueType,
} from "../types";
import { DEFAULT_COACHING, DEFAULT_LEAGUE_TYPE } from "../types";

export interface CreateTeamValues {
  name: string;
  raceId: string;
  roster: PlayerEntry[];
  coaching: CoachingStaff;
  leagueType: TeamLeagueType;
}

interface FormErrors {
  name?: string;
  players?: string;
  budget?: string;
}

export function useCreateTeamForm(onSubmit: (values: CreateTeamValues) => Promise<void>) {
  const [name, setName] = useState("");
  const [raceId, setRaceId] = useState("");
  const [players, setPlayers] = useState<PlayerEntry[]>([]);
  const [coaching, setCoachingState] = useState<CoachingStaff>({ ...DEFAULT_COACHING });
  const [leagueType, setLeagueTypeState] = useState<TeamLeagueType>(DEFAULT_LEAGUE_TYPE);
  const [pendingRaceId, setPendingRaceId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const race = raceId ? getRaceById(raceId) : undefined;
  const cost = race ? computeRosterCostFromPlayers(race, players) : 0;
  const coachingCost = race ? computeCoachingCost(race, coaching) : 0;
  const totalCost = cost + coachingCost;
  const playerCount = players.length;
  const remainingBudget = STARTING_TREASURY - totalCost;

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

  const addPlayer = (positionalKey: string) => {
    if (!race) return;
    const positional = race.positionals.find((p) => p.key === positionalKey);
    if (!positional) return;
    if (players.length >= MAX_PLAYERS) return;
    const countForPositional = players.filter((p) => p.positionalKey === positionalKey).length;
    if (countForPositional >= positional.max) return;
    const nextCost = totalCost + positional.cost;
    if (nextCost > STARTING_TREASURY) return;

    const baseName = positional.name;
    // Default the player name to the positional name, appending a counter
    // for duplicates (e.g. "Hobgoblin Lineman", "Hobgoblin Lineman 2").
    const name = countForPositional === 0 ? baseName : `${baseName} ${countForPositional + 1}`;
    const newPlayer: PlayerEntry = {
      id: createId(),
      name,
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

  const setLeagueType = (next: TeamLeagueType) => {
    setLeagueTypeState(next);
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = "Team name is required";
    if (playerCount < MIN_PLAYERS) {
      nextErrors.players = `Select at least ${MIN_PLAYERS} players`;
    }
    if (totalCost > STARTING_TREASURY) nextErrors.budget = "Roster exceeds the 1,000,000 gc budget";
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !race) return;

    setIsSubmitting(true);
    onSubmit({
      name: name.trim(),
      raceId,
      roster: players,
      coaching,
      leagueType,
    }).finally(() => {
      setIsSubmitting(false);
      setName("");
      setRaceId("");
      setPlayers([]);
      setCoachingState({ ...DEFAULT_COACHING });
      setLeagueTypeState(DEFAULT_LEAGUE_TYPE);
      setPendingRaceId(null);
    });
  };

  return {
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
    isSubmitting,
    handleSubmit,
    coaching,
    setCoaching,
    leagueType,
    setLeagueType,
  };
}
