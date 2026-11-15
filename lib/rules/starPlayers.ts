/**
 * BB2025 Season 3 STAR PLAYER roster for the demo (S8 · U9 — ODD T7).
 *
 * The local corpus cannot source star stats: the rulebook PDF is an image
 * scan without a text layer (pdftotext extracts 212 bytes over 400 pages)
 * and docs/research/blood-bowl-2025-match.md has no roster (md:540 only
 * pins «0-2 Jugadores Estrella – precio variable»). Every line below is
 * therefore transcribed from VERIFIED Season-3 web sources (ODD L25),
 * cross-checked on 2026-11-13 across mordorbihan.fr, bloodbowlbase.ru,
 * dugout.benchwarmers.games, bbtactics.com and newrecruit.eu:
 *
 *  - Griff Oberwald      — 300k · MA7 ST4 AG2+ PA3+ AV9+ (all five agree;
 *    the mocks' 250k for H'thark was WRONG, the real price is 300k).
 *  - H'thark the Unstoppable — 300k · MA6 ST6 AG4+ PA6+ AV10+.
 *
 * Demo scope: the two stars of the chosen design A′. Enlarging the roster
 * and enforcing «Juega por» eligibility per team awaits the official Star
 * Players PDF transcription (follow-up — ODD T7/L25).
 */

/** The minimal stat line every Star Player card must show BEFORE purchase
 * (L25: «deberian llevar las minimas stats y skills para saber lo que llevan
 * antes de comprarlos»). `ma`/`st` are numbers; `ag`/`pa`/`av` keep the
 * success-value form («2+», «9+»). */
export interface StarPlayerStats {
  ma: number;
  st: number;
  ag: string;
  pa: string;
  av: string;
}

/** One hireable Star Player (IND-1: «0-2 Jugadores Estrella – precio
 * variable» — each player has a fixed price, the cap is global). */
export interface StarPlayer {
  /** Reserved `star-player-*` namespace (stable cart id). */
  id: string;
  displayName: string;
  /** Standard Season-3 cost in gold. */
  costGp: number;
  /** Spanish position line for the card (verified sources). */
  position: string;
  stats: StarPlayerStats;
  /** Skill names exactly as the sources list them (official identifiers). */
  skills: readonly string[];
  /** The player's special/unique rule, rendered in Spanish on the card. */
  special: { name: string; text: string };
  /** «Juega por: …» — leagues/teams the star may play for (info on the card;
   * eligibility ENFORCEMENT is the follow-up above). */
  playsFor: readonly string[];
}

export const STAR_PLAYERS: readonly StarPlayer[] = [
  {
    id: "star-player-griff-oberwald",
    displayName: "Griff Oberwald",
    costGp: 300_000,
    position: "Humano · Blitzer",
    stats: { ma: 7, st: 4, ag: "2+", pa: "3+", av: "9+" },
    skills: ["Block", "Dodge", "Fend", "Sprint", "Sure Feet", "Loner (3+)"],
    special: {
      name: "Consummate Professional",
      text: "Una vez por partida puede añadir +1 a una prueba de Agilidad, también tras haber tirado.",
    },
    playsFor: ["Old World Classic"],
  },
  {
    id: "star-player-hthark-the-unstoppable",
    displayName: "H'thark the Unstoppable",
    costGp: 300_000,
    position: "Enano del Caos",
    stats: { ma: 6, st: 6, ag: "4+", pa: "6+", av: "10+" },
    skills: [
      "Block",
      "Break Tackle",
      "Defensive",
      "Juggernaut",
      "Sprint",
      "Sure Feet",
      "Thick Skull",
      "Loner (4+)",
    ],
    special: {
      name: "Unstoppable Momentum",
      text: "Al bloquear como parte de un blitz, puede repetir uno de los dados de bloque.",
    },
    playsFor: ["Badlands Brawl", "Favoured of Hashut"],
  },
];
