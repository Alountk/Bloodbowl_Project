import type { Race } from "../types";
import { getSkillById, getSkillByName } from "./skills";

const EXPECTED_RACE_COUNT = 30;
const VALID_ACCESS_LETTERS = new Set(["A", "F", "G", "M", "P", "T"]);
const VALID_AG = new Set(["2+", "3+", "4+", "5+"]);
const VALID_PA = new Set(["2+", "3+", "4+", "5+", "6+", "—"]);
const VALID_AV = new Set(["6+", "7+", "8+", "9+", "10+", "11+"]);

function checkAccessLetters(
  letters: readonly string[],
  field: string,
  label: string,
  violations: string[],
): void {
  if (!Array.isArray(letters)) {
    violations.push(`${label}: ${field} must be an array`);
    return;
  }

  const invalid = [...new Set(letters.filter((letter) => !VALID_ACCESS_LETTERS.has(letter)))];
  if (invalid.length > 0) {
    violations.push(`${label}: ${field} contains invalid letter(s): ${invalid.join(", ")}`);
  }

  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const letter of letters) {
    if (seen.has(letter)) duplicates.push(letter);
    seen.add(letter);
  }
  if (duplicates.length > 0) {
    violations.push(`${label}: ${field} contains duplicate letter(s): ${[...new Set(duplicates)].join(", ")}`);
  }
}

export function validateRaceCatalog(races: readonly Race[]): string[] {
  const violations: string[] = [];

  if (races.length !== EXPECTED_RACE_COUNT) {
    violations.push(`catalog must contain exactly ${EXPECTED_RACE_COUNT} races, got ${races.length}`);
  }

  const seenRaceIds = new Set<string>();
  for (const race of races) {
    if (!race.id || seenRaceIds.has(race.id)) {
      violations.push(race.id ? `duplicate race id: ${race.id}` : "race with missing id");
    }
    seenRaceIds.add(race.id);

    if (typeof race.name !== "string" || race.name.trim() === "") {
      violations.push(`${race.id}: name must be a non-empty string`);
    }

    if (typeof race.rerollCost !== "number" || race.rerollCost <= 0) {
      violations.push(`${race.id}: rerollCost must be > 0`);
    }

    if (!Array.isArray(race.positionals) || race.positionals.length === 0) {
      violations.push(`${race.id}: must have at least one positional`);
      continue;
    }

    const seenKeys = new Set<string>();
    for (const positional of race.positionals) {
      const label = `${race.id}/${positional.key}`;

      if (seenKeys.has(positional.key)) {
        violations.push(`${label}: duplicate positional key`);
      }
      seenKeys.add(positional.key);

      if (typeof positional.name !== "string" || positional.name.trim() === "") {
        violations.push(`${label}: name must be a non-empty string`);
      }

      if (typeof positional.role !== "string" || positional.role.trim() === "") {
        violations.push(`${label}: role must be a non-empty string`);
      }

      if (typeof positional.cost !== "number" || positional.cost <= 0) {
        violations.push(`${label}: cost must be > 0`);
      }

      if (!Number.isInteger(positional.max) || positional.max < 1 || positional.max > 16) {
        violations.push(`${label}: max must be an integer between 1 and 16`);
      }

      if (positional.min !== undefined) {
        const minOutOfRange =
          !Number.isInteger(positional.min) ||
          positional.min < 0 ||
          (Number.isInteger(positional.max) && positional.min > positional.max);
        if (minOutOfRange) {
          violations.push(`${label}: min must be an integer between 0 and max`);
        }
      }

      if (!Number.isInteger(positional.ma) || positional.ma < 1 || positional.ma > 9) {
        violations.push(`${label}: ma must be an integer between 1 and 9`);
      }

      if (!Number.isInteger(positional.st) || positional.st < 1 || positional.st > 8) {
        violations.push(`${label}: st must be an integer between 1 and 8`);
      }

      if (!VALID_AG.has(positional.ag)) {
        violations.push(`${label}: ag must be one of 2+, 3+, 4+, 5+`);
      }

      if (!VALID_PA.has(positional.pa)) {
        violations.push(`${label}: pa must be one of 2+, 3+, 4+, 5+, 6+, —`);
      }

      if (!VALID_AV.has(positional.av)) {
        violations.push(`${label}: av must be one of 6+, 7+, 8+, 9+, 10+, 11+`);
      }

      checkAccessLetters(positional.accessPrimary, "accessPrimary", label, violations);
      checkAccessLetters(positional.accessSecondary, "accessSecondary", label, violations);

      if (!Array.isArray(positional.skills)) {
        violations.push(`${label}: skills must be an array`);
      } else {
        const unresolved = positional.skills.filter(
          (ref) => !getSkillById(ref) && !getSkillByName(ref),
        );
        if (unresolved.length > 0) {
          violations.push(`${label}: skills contains unresolvable ref(s): ${[...new Set(unresolved)].join(", ")}`);
        }
      }
    }
  }

  return violations;
}
