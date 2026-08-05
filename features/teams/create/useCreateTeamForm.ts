"use client";

import { useState, type FormEvent } from "react";
import { getRaceById } from "../data/races";
import {
  MAX_PLAYERS,
  MIN_PLAYERS,
  STARTING_TREASURY,
  computeRosterCostFromPlayers,
} from "../roster";
import type { PlayerEntry } from "../types";

export interface CreateTeamValues {
  name: string;
  raceId: string;
  roster: PlayerEntry[];
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
  const [pendingRaceId, setPendingRaceId] = useState<string | null>(null);
  const [errors, setErrors] = useState<FormErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const race = raceId ? getRaceById(raceId) : undefined;
  const cost = race ? computeRosterCostFromPlayers(race, players) : 0;
  const playerCount = players.length;
  const remainingBudget = STARTING_TREASURY - cost;

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
    const nextCost = cost + positional.cost;
    if (nextCost > STARTING_TREASURY) return;

    const nextNumber = players.length + 1;
    const newPlayer: PlayerEntry = {
      id: crypto.randomUUID(),
      name: `Player ${nextNumber}`,
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

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = "Team name is required";
    if (playerCount < MIN_PLAYERS) {
      nextErrors.players = `Select at least ${MIN_PLAYERS} players`;
    }
    if (cost > STARTING_TREASURY) nextErrors.budget = "Roster exceeds the 1,000,000 gc budget";
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0 || !race) return;

    setIsSubmitting(true);
    onSubmit({
      name: name.trim(),
      raceId,
      roster: players,
    }).finally(() => {
      setIsSubmitting(false);
      setName("");
      setRaceId("");
      setPlayers([]);
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
    playerCount,
    remainingBudget,
    isSubmitting,
    handleSubmit,
  };
}
