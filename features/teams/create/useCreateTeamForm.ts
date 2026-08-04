"use client";

import { useState, type FormEvent } from "react";
import { getRaceById } from "../data/races";
import {
  MIN_PLAYERS,
  STARTING_TREASURY,
  computeRosterCost,
  countPlayers,
  type Quantities,
} from "../roster";
import type { RosterEntry } from "../types";

export interface CreateTeamValues {
  name: string;
  raceId: string;
  roster: RosterEntry[];
}

interface FormErrors {
  name?: string;
  players?: string;
  budget?: string;
}

export function useCreateTeamForm(onSubmit: (values: CreateTeamValues) => void) {
  const [name, setName] = useState("");
  const [raceId, setRaceId] = useState("");
  const [quantities, setQuantities] = useState<Quantities>({});
  const [errors, setErrors] = useState<FormErrors>({});

  const race = raceId ? getRaceById(raceId) : undefined;
  const cost = race ? computeRosterCost(race, quantities) : 0;
  const playerCount = countPlayers(quantities);
  const remainingBudget = STARTING_TREASURY - cost;

  const changeRace = (nextRaceId: string) => {
    setRaceId(nextRaceId);
    setQuantities({});
  };

  const increment = (positionalKey: string) => {
    if (!race) return;
    const positional = race.positionals.find((candidate) => candidate.key === positionalKey);
    if (!positional) return;
    const current = quantities[positionalKey] ?? 0;
    if (current >= positional.max) return;
    setQuantities((previous) => ({ ...previous, [positionalKey]: current + 1 }));
  };

  const decrement = (positionalKey: string) => {
    setQuantities((previous) => {
      const current = previous[positionalKey] ?? 0;
      const next = { ...previous };
      if (current <= 1) {
        delete next[positionalKey];
      } else {
        next[positionalKey] = current - 1;
      }
      return next;
    });
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

    const roster: RosterEntry[] = Object.entries(quantities)
      .filter(([, quantity]) => quantity > 0)
      .map(([positionalKey, quantity]) => ({ positionalKey, quantity }));

    onSubmit({
      name: name.trim(),
      raceId,
      roster,
    });
    setName("");
    setRaceId("");
    setQuantities({});
  };

  return {
    name,
    setName,
    raceId,
    setRaceId: changeRace,
    quantities,
    increment,
    decrement,
    errors,
    cost,
    playerCount,
    remainingBudget,
    countPlayers: () => countPlayers(quantities),
    handleSubmit,
  };
}
