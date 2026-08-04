"use client";

import { useState, type FormEvent } from "react";
import type { PlayerPosition } from "../types";
import { PLAYER_POSITIONS } from "../constants";

export interface CreateTeamFormValues {
  name: string;
  league: string;
  positions: PlayerPosition[];
}

interface FormErrors {
  name?: string;
  league?: string;
}

export function useCreateTeamForm(onSubmit: (values: CreateTeamFormValues) => void) {
  const [name, setName] = useState("");
  const [league, setLeague] = useState("");
  const [selectedPositions, setSelectedPositions] =
    useState<PlayerPosition[]>(PLAYER_POSITIONS);
  const [errors, setErrors] = useState<FormErrors>({});

  const togglePosition = (position: PlayerPosition) => {
    setSelectedPositions((previous) =>
      previous.includes(position)
        ? previous.filter((item) => item !== position)
        : [...previous, position],
    );
  };

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const nextErrors: FormErrors = {};
    if (!name.trim()) nextErrors.name = "Team name is required";
    if (!league.trim()) nextErrors.league = "League is required";
    setErrors(nextErrors);

    if (Object.keys(nextErrors).length > 0) return;

    onSubmit({
      name: name.trim(),
      league: league.trim(),
      positions: selectedPositions,
    });
    setName("");
    setLeague("");
    setSelectedPositions(PLAYER_POSITIONS);
  };

  return {
    name,
    setName,
    league,
    setLeague,
    selectedPositions,
    togglePosition,
    errors,
    handleSubmit,
  };
}
