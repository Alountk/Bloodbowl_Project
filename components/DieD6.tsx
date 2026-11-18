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
 *
 * T36 (L126): `animateOnMount` plays the roll when the die MOUNTS already
 * holding a value (the prayer reveal step). A CSS transition cannot run on
 * first paint, so the mount flight is an ENTRY ANIMATION (`.die-roll-in`,
 * whose keyframes ride the component-rendered stylesheet below and read the
 * `--die-from` before-pose): same 0.9s spin + wobble, settling via
 * animationend into the same reveal gate — transitionend keeps settling
 * value changes. Under prefers-reduced-motion the entry animation is off and
 * the result is revealed instantly (the RM path).
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
  /** Spanish roll-button label; defaults to «Tirar». T34: migrated call sites
   *  pin exact button names («Tirar 1D6»…) — this text renders verbatim. */
  rollLabel?: string;
  /** T36 (L126): play the roll when the die mounts already holding a value
   *  («que saliera el dado y hiciera la animacion»). Default false: a die
   *  that mounts with a value shows it revealed (hydration cases). */
  animateOnMount?: boolean;
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

/** T36 · the mount-roll entry stylesheet, rendered by the component (the
 * module CSS owns the value-change transition; this owns the FIRST-PAINT
 * flight). `die-roll-in` animates `transform` from `--die-from` (the landing
 * pose WITHOUT the spin) to the inline landing pose = the same cumulative
 * spin a value change would play; `die-wobble` duplicates the wobble
 * keyframes under a literal name so the entry animation can carry both
 * motions (the `.die-roll-in` `animation` shorthand supersedes the
 * `tumbling-*` one during the flight). Reduced motion: no animation. */
const ROLL_IN_STYLE = `@keyframes die-roll-in{from{transform:var(--die-from)}}@keyframes die-wobble{0%,100%{rotate:0deg}30%{rotate:-11deg}65%{rotate:9deg}}.die-roll-in{animation:die-roll-in .9s cubic-bezier(.2,.75,.3,1),die-wobble .9s cubic-bezier(.2,.75,.3,1)}@media (prefers-reduced-motion:reduce){.die-roll-in{animation:none}}`;

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
  /** The animateOnMount roll: settles via its entry animation (animationend)
   *  — cleared by the next value change. */
  mountRoll: boolean;
}

export function DieD6({
  value,
  rolling = false,
  onRoll,
  highlight = "none",
  size = 120,
  label = "Dado 1D6",
  resultText = (n) => `Resultado: ${n}`,
  rollLabel = "Tirar",
  animateOnMount = false,
}: DieD6Props) {
  const [roll, setRoll] = useState<RollState>(() => {
    // T36: animateOnMount + a value on FIRST render = the roll runs at mount
    // (the exact sequence of a value change: spin + wobble + reveal at the
    // end). Reduced motion reuses the instant-reveal path.
    const plays = animateOnMount && value != null;
    return {
      prev: value,
      seq: plays ? 1 : 0,
      spinX: plays ? SPIN.x : 0,
      spinY: plays ? SPIN.y : 0,
      revealed: plays ? (prefersReducedMotion() ? value : null) : value,
      mountRoll: plays,
    };
  });

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
      mountRoll: false,
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

  const handleAnimationEnd = (e: React.AnimationEvent<HTMLDivElement>) => {
    // T36: the mount roll SETTLES through its entry animation (first paint
    // has no transition to end). Any other animation (the wobble keyframes
    // on a normal roll) never settles a result.
    if (e.target !== e.currentTarget || !roll.mountRoll) return;
    if (value != null) {
      setRoll((r) => (r.revealed === value ? r : { ...r, revealed: value }));
    }
  };

  const pose = (value != null && FACE_POSE[value]) || FACE_POSE[1];
  const transform =
    value == null
      ? `rotateX(${SKEW.x}deg) rotateY(${SKEW.y}deg)`
      : `rotateX(${pose.x + roll.spinX + SKEW.x}deg) rotateY(${pose.y + roll.spinY + SKEW.y}deg)`;
  // T36: the entry-animation before-pose = the landing pose WITHOUT the spin.
  const fromTransform = `rotateX(${pose.x + SKEW.x}deg) rotateY(${pose.y + SKEW.y}deg)`;
  const cubeStyle: React.CSSProperties = roll.mountRoll
    ? ({ transform, "--die-from": fromTransform } as React.CSSProperties)
    : { transform };

  const text =
    rolling || (value != null && roll.revealed == null)
      ? FLIGHT_TEXT
      : roll.revealed != null
        ? resultText(roll.revealed)
        : IDLE_TEXT;
  const highlightOn = highlight !== "none" && roll.revealed != null && !rolling;

  return (
    <div className={cx(styles.wrapper, highlight !== "none" && styles[`mode-${highlight}`])}>
      {roll.mountRoll ? <style>{ROLL_IN_STYLE}</style> : null}
      <div
        className={styles.scene}
        style={{ width: size, height: size, transform: `scale(${size / 120})` }}
        role="img"
        aria-label={label}
      >
        <div
          className={cx(
            styles.cube,
            roll.mountRoll && "die-roll-in",
            roll.seq > 0 && (roll.seq % 2 ? styles["tumbling-a"] : styles["tumbling-b"]),
          )}
          style={cubeStyle}
          onTransitionEnd={handleTransitionEnd}
          onAnimationEnd={handleAnimationEnd}
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
          {rollLabel}
        </button>
      )}
    </div>
  );
}
