/**
 * DieD16 — shared 3D sixteen-sided die (T33), built from the APPROVED
 * artboards `design/die-roll/02-dice3d-16.html` (octagonal bipyramid) and
 * `design/die-roll/03-d16-result-highlights.html` (the five result-highlight
 * modes with their L114/L116 fixes). Strictly TWO separate components first
 * (L111): DieD6 and DieD16 stay independent until green, then a merge may be
 * considered — hence this module owns its own copy of the shared API.
 *
 * Geometry is kept EXACTLY as the artboards leave it: d=55, face 46x78, tilt
 * 45, bottom faces at i*45 aligned (no 22.5° offset), south-pole numbers
 * de-mirrored with margin-top 30 (L115/L117 as-is). Landing poses use the
 * CORRECTED faces map (L112): x:∓45, y:-i*45 (the inverse azimuth — the old
 * +i*45 map landed on the mirrored face) + SKEW {-8, 12} scaled from the d6's
 * jico skew (inter-face angle 31.4° vs 90°).
 *
 * Controlled API (RNG stays with the caller — lib/random conventions): the die
 * animates when `value` CHANGES (wobble + cumulative spin to the face pose),
 * reveals the result on transitionend (instantly under prefers-reduced-motion,
 * never waiting for transitionend — the artboard-03 bug from L112) and
 * announces it in an aria-live region. `rolling` forces the mid-flight
 * presentation («Tirando…», no effects, disabled button) while the caller
 * resolves. `highlight` defaults to "none": the landing face shows with NO
 * effect (L118) unless a-e is picked.
 *
 * Implementation note: the roll is a pure derivation over the `value` history,
 * so the state is adjusted DURING render when `value` changes (the React
 * "adjusting state when a prop changes" pattern) — no effects, no refs. The
 * mid-flight wobble is a class toggle between two IDENTICAL keyframes: each
 * roll flips `tumbling-a`/`tumbling-b`, and switching animation names restarts
 * the keyframe while the independent `rotate` property stays composable with
 * the landing `transform`.
 */
import { useState } from "react";
import styles from "./DieD16.module.css";

export type HighlightMode = "none" | "a" | "b" | "c" | "d" | "e";

export interface DieD16Props {
  /** Rolled face 1-16, or null before the first roll (controlled). */
  value: number | null;
  /** Mid-flight presentation while the caller resolves a roll. */
  rolling?: boolean;
  /** Roll trigger for the die button; the RNG stays with the caller. */
  onRoll?: () => void;
  /** Result-highlight mode; defaults to "none" (no effect at all). */
  highlight?: HighlightMode;
  /** Die footprint in px (the scene scales around its center). */
  size?: number;
  /** Spanish accessible label for the die. */
  label?: string;
  /** Spanish result text; defaults to «Resultado: n». */
  resultText?: (n: number) => string;
  /** Spanish roll-button label; defaults to «Tirar». T34: migrated call sites
   *  pin exact button names («Tirar 1D6»…) — this text renders verbatim. */
  rollLabel?: string;
}

/** Scaled jico skew (L112 judgment call kept: -8/12 vs the d6's -16/24). */
const SKEW = { x: -8, y: 12 };
/** Cumulative spin per roll: +1 turn on X, +2 turns on Y. */
const SPIN = { x: 360, y: 720 };
const FLIGHT_TEXT = "Tirando…";
const IDLE_TEXT = "Pulsa para tirar";

function cx(...parts: Array<string | false | null | undefined>): string {
  return parts.filter(Boolean).join(" ");
}

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

function effectClass(highlight: HighlightMode): string | false {
  switch (highlight) {
    case "a":
      return styles.halo;
    case "b":
      return styles.pulse;
    case "d":
      return styles.lit;
    case "e":
      return styles.flash;
    default:
      return false; // "c" pops the badge; "none" has no effect at all
  }
}

interface RollState {
  /** Last `value` seen — the roll happens exactly once per change. */
  prev: number | null;
  /** Rolls so far; parity drives the wobble keyframe restart. */
  seq: number;
  spinX: number;
  spinY: number;
  /** Result revealed (transitionend / reduced-motion / initial value). */
  revealed: number | null;
}

export function DieD16({
  value,
  rolling = false,
  onRoll,
  highlight = "none",
  size = 120,
  label = "Dado 1D16",
  resultText = (n) => `Resultado: ${n}`,
  rollLabel = "Tirar",
}: DieD16Props) {
  const [roll, setRoll] = useState<RollState>(() => ({
    prev: value,
    seq: 0,
    spinX: 0,
    spinY: 0,
    revealed: value,
  }));

  // Adjust state when the controlled `value` changes: one roll per change.
  if (roll.prev !== value) {
    const instant = value != null && prefersReducedMotion();
    setRoll({
      prev: value,
      seq: roll.seq + 1,
      spinX: value == null ? roll.spinX : roll.spinX + SPIN.x,
      spinY: value == null ? roll.spinY : roll.spinY + SPIN.y,
      // Reduced motion lands instantly and reveals: with no transition there
      // is no transitionend to wait for (L112).
      revealed: instant ? value : null,
    });
  }

  const handleTransitionEnd = (e: React.TransitionEvent<HTMLDivElement>) => {
    // Only the landing `transform` settles the result (face effects also
    // transition on bubbling events).
    if (e.target !== e.currentTarget || e.propertyName !== "transform") return;
    if (value != null) {
      setRoll((r) => (r.revealed === value ? r : { ...r, revealed: value }));
    }
  };

  const n = value != null && value >= 1 && value <= 16 ? value : 1;
  const top = n <= 8;
  const i = top ? n - 1 : n - 9;
  const transform =
    value == null
      ? `translate(-50%,-50%) rotateX(-14deg) rotateY(20deg)`
      : `translate(-50%,-50%) rotateX(${(top ? -45 : 45) + roll.spinX + SKEW.x}deg) rotateY(${
          -i * 45 + roll.spinY + SKEW.y
        }deg)`;

  const text =
    rolling || (value != null && roll.revealed == null)
      ? FLIGHT_TEXT
      : roll.revealed != null
        ? resultText(roll.revealed)
        : IDLE_TEXT;
  const highlightOn = highlight !== "none" && roll.revealed != null && !rolling;

  return (
    <div className={cx(styles.wrapper, highlight !== "none" && styles[`mode-${highlight}`])}>
      <div
        className={styles.scene}
        style={{ transform: `scale(${size / 120})` }}
        role="img"
        aria-label={label}
      >
        <div
          className={cx(
            styles.poly,
            roll.seq > 0 && (roll.seq % 2 ? styles["tumbling-a"] : styles["tumbling-b"]),
          )}
          style={{ transform }}
          onTransitionEnd={handleTransitionEnd}
        >
          {Array.from({ length: 16 }, (_, idx) => {
            const face = idx + 1;
            return (
              <div
                key={face}
                className={cx(
                  styles.face,
                  face <= 8 ? styles[`t${idx}`] : styles[`b${idx - 8}`],
                  highlightOn && roll.revealed === face && styles.on,
                  highlightOn && roll.revealed === face && effectClass(highlight),
                )}
              >
                <span>{face}</span>
              </div>
            );
          })}
        </div>
      </div>
      {highlight === "c" && (
        <span className={cx(styles.badge, highlightOn && styles.on)}>
          <span className={styles.badgeLabel}>Resultado</span>
          {roll.revealed ?? ""}
        </span>
      )}
      <p className={styles.result} aria-live="polite">
        {text}
      </p>
      {onRoll && (
        <button type="button" className={styles.btn} onClick={onRoll} disabled={rolling}>
          {rollLabel}
        </button>
      )}
    </div>
  );
}
