/**
 * DieD6 — shared 3D six-sided die (T33), built from the APPROVED artboard
 * `design/die-roll/01-dice3d.html` (jico translucent blue cube, canonical
 * pips, skewed landing, cumulative spin) plus the five result-highlight modes
 * of `design/die-roll/03-d16-result-highlights.html` with their L114/L116
 * fixes. Strictly TWO separate components first (L111): DieD6 and DieD16 stay
 * independent until green, then a merge may be considered.
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
 * Landing poses are the INVERSE of each face placement — the L112 sign lesson
 * from the d16: a face placed at rotateY(+90) lands with rotateY(-90). The
 * approved artboard's map had 3/4 swapped by that same mirror-azimuth bug, so
 * it is corrected here (a rolled 3 must show the 3-pip face).
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
import styles from "./DieD6.module.css";

export type HighlightMode = "none" | "a" | "b" | "c" | "d" | "e";

export interface DieD6Props {
  /** Rolled face 1-6, or null before the first roll (controlled). */
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
}

/** Jico skewed landing (approved v3): never face-on. */
const SKEW = { x: -16, y: 24 };
/** Cumulative spin per roll: +1 turn on X, +2 turns on Y. */
const SPIN = { x: 360, y: 720 };
/** Landing pose per face = inverse of the face placement (+ SKEW + spin). */
const FACE_POSE: Record<number, { x: number; y: number }> = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: 180 },
  3: { x: 0, y: -90 },
  4: { x: 0, y: 90 },
  5: { x: -90, y: 0 },
  6: { x: 90, y: 0 },
};
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

export function DieD6({
  value,
  rolling = false,
  onRoll,
  highlight = "none",
  size = 120,
  label = "Dado 1D6",
  resultText = (n) => `Resultado: ${n}`,
}: DieD6Props) {
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

  const pose = (value != null && FACE_POSE[value]) || FACE_POSE[1];
  const transform =
    value == null
      ? `rotateX(${SKEW.x}deg) rotateY(${SKEW.y}deg)`
      : `rotateX(${pose.x + roll.spinX + SKEW.x}deg) rotateY(${pose.y + roll.spinY + SKEW.y}deg)`;

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
            styles.cube,
            roll.seq > 0 && (roll.seq % 2 ? styles["tumbling-a"] : styles["tumbling-b"]),
          )}
          style={{ transform }}
          onTransitionEnd={handleTransitionEnd}
        >
          {[1, 2, 3, 4, 5, 6].map((face) => (
            <div
              key={face}
              className={cx(
                styles.face,
                styles[`f${face}`],
                highlightOn && roll.revealed === face && styles.on,
                highlightOn && roll.revealed === face && effectClass(highlight),
              )}
            >
              {Array.from({ length: face }, (_, i) => (
                <span key={i} className={styles.p} />
              ))}
            </div>
          ))}
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
          Tirar
        </button>
      )}
    </div>
  );
}
