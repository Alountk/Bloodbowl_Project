import { useState } from "react";

import {
  KICKOFF_EVENTS,
  KICKOFF_FREE_RECEPTION_QUOTE,
  KICKOFF_INTRO_QUOTE,
  KICKOFF_LANDING_QUOTE,
  kickoffEventFor,
  type KickoffEvent,
} from "@/lib/rules/kickoffEvents";

import {
  kickoffDuelLine,
  kickoffRegisterLine,
  type ActaDemoKickoff,
} from "./actaDemoReducer";

/**
 * S3 · T4 — the kickoff gate, design C «Acta secuencial» (L29, Stitch screen
 * 18b6c19103be40ac84d6321392022231): the kickoff moment builds as sequential
 * ACTA rows — ① roll 2D6 → ② event (sum + name + verbatim effect) → ③
 * opposed duel (TÚ vs RIVAL, only on 6/7/11/12) → ④ registro — with the
 * 11-face table below and the ball-landing footnote. Shown INSTEAD of the
 * turn timeline + dock while `matchStarted && !kickoff.registered`; registering
 * stamps the rows into `state.events` and the match continues normally.
 *
 * Mobile-first (390), rulebook-light (#12225a navy / #d11938 red / #f8fafc
 * background, white square panels), inline SVG dice, Spanish. No back button,
 * no P2P/HASH/network chrome. DEMO-ONLY surface: the production server never
 * emits `kickoff` events (openspec MVT-6 forbids surfacing kickoff-table
 * events in the production feed).
 */

const BTN =
  "rounded-sm border border-navy/30 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide text-navy hover:bg-fill-hover disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY =
  "rounded-sm bg-navy px-4 py-2 font-display text-xs font-bold uppercase tracking-wide text-white hover:bg-navy-hover disabled:cursor-not-allowed disabled:opacity-40";
const ROW =
  "border border-navy/15 bg-white px-4 py-3";
const ROW_LABEL =
  "font-display text-xs font-bold uppercase tracking-[0.16em] text-red";

export interface ActaKickoffGateProps {
  homeName: string;
  awayName: string;
  /** The KICKING side («Patea») — the other side receives. Null → undecided. */
  kicking: "home" | "away" | null;
  /** The viewing coach's side (the TÚ vs RIVAL duel buttons). */
  viewerSide: "home" | "away";
  /** The kickoff dice slice from the reducer. */
  kickoff: ActaDemoKickoff;
  /** Row ①: roll the kickoff 2D6 (two `rollD6()` in the reducer). */
  onRoll: () => void;
  /** Row ③: roll one side's opposed follow-up 1D6. */
  onRollDuel: (side: "home" | "away") => void;
  /** Row ④ / footer: stamp the rows into the acta and continue. */
  onRegister: () => void;
  /** U12 · L32: type a kickoff face by hand (1-6, or null to clear). */
  onSetDie: (die: 1 | 2, value: number | null) => void;
  /** U12 · L32: type a coach's opposed 1D6 by hand (1-6, or null). */
  onSetDuelDie: (side: "home" | "away", value: number | null) => void;
  /** U12 · L32: the table resolves the duel manually (skip the rolls). */
  onSkipDuel: () => void;
}

/** Editorial die card (the wizard's DieCard pattern): face + dice BUTTON. */
function GateDie({
  label,
  value,
  dieLabel,
  recorded,
  onRoll,
}: {
  label: string;
  value: number | null;
  dieLabel: string;
  recorded: boolean;
  onRoll: () => void;
}) {
  const [rollSeq, setRollSeq] = useState(0);
  const rolled = rollSeq > 0;
  return (
    <div className="flex flex-wrap items-center gap-3">
      <p className="w-full font-display text-xs font-bold uppercase tracking-wide text-navy">
        {label}
      </p>
      <span
        key={`glyph-${rollSeq}`}
        aria-hidden
        data-testid="die-glyph"
        className={`flex h-10 w-10 items-center justify-center border border-navy/30 bg-white font-display text-lg font-bold text-navy${
          rolled ? " dice-roll" : ""
        }`}
      >
        {value ?? "–"}
      </span>
      <button
        type="button"
        className={BTN}
        disabled={recorded}
        onClick={() => {
          setRollSeq((seq) => seq + 1);
          onRoll();
        }}
      >
        {dieLabel}
      </button>
      <span
        key={`status-${rollSeq}`}
        role="status"
        className={`font-display text-xs font-bold uppercase tracking-wide ${
          recorded ? "text-red" : "text-ink/60"
        }${rolled ? " dice-reveal" : ""}`}
      >
        {recorded ? "Registrado" : "Pendiente"}
      </span>
    </div>
  );
}

/** The per-event tie rule, verbatim in substance (6/7 highest, 11/12 lowest). */
function tieRuleText(event: KickoffEvent): string {
  return event.sum === 6 || event.sum === 7
    ? "Regla: gana el total más alto (1D6) · empate → ambos ganan el beneficio"
    : "Regla: sufre el total más bajo (1D6) · empate → ambos sufren el efecto";
}

/**
 * U12 · L32 — manual entry: "" clears (null), 1-6 sets, anything else is
 * silently ignored (the controlled input keeps its last valid face).
 */
function parseDieInput(raw: string): number | null | undefined {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = Number(trimmed);
  return Number.isInteger(n) && n >= 1 && n <= 6 ? n : undefined;
}

/** One die FIELD (U12 · L32): the face glyph + a manual 1-6 entry. */
function ManualDie({
  label,
  value,
  disabled,
  onChange,
}: {
  label: string;
  value: number | null;
  disabled: boolean;
  onChange: (raw: string) => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span
        aria-hidden
        className="flex h-10 w-10 items-center justify-center border border-navy/30 bg-white font-display text-lg font-bold text-navy"
      >
        {value ?? "–"}
      </span>
      <input
        type="number"
        min={1}
        max={6}
        inputMode="numeric"
        aria-label={label}
        className="w-16 border border-navy/30 bg-white px-2 py-1.5 text-center font-display text-sm font-bold text-navy disabled:opacity-40"
        value={value ?? ""}
        disabled={disabled}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
}

export function ActaKickoffGate({
  homeName,
  awayName,
  kicking,
  viewerSide,
  kickoff,
  onRoll,
  onRollDuel,
  onRegister,
  onSetDie,
  onSetDuelDie,
  onSkipDuel,
}: ActaKickoffGateProps) {
  const rolled = kickoff.d1 != null && kickoff.d2 != null;
  const event = rolled ? kickoffEventFor(kickoff.d1!, kickoff.d2!) : null;
  const sum = rolled ? kickoff.d1! + kickoff.d2! : null;
  const names = { home: homeName, away: awayName };
  const nameOf = (side: "home" | "away") => (side === "home" ? homeName : awayName);
  const rivalSide: "home" | "away" = viewerSide === "home" ? "away" : "home";
  // U12 · L32 — manual/automatic 2D6 + the optional per-coach duel.
  const kickoffLocked = kickoff.registered || kickoff.source === "auto";
  const canRollKickoff =
    !kickoff.registered &&
    kickoff.source !== "auto" &&
    kickoff.d1 == null &&
    kickoff.d2 == null;
  const bothDuelDiceNull =
    (kickoff.followUp?.home ?? null) == null &&
    (kickoff.followUp?.away ?? null) == null;
  const commitDie = (die: 1 | 2, raw: string): void => {
    const parsed = parseDieInput(raw);
    if (parsed !== undefined) onSetDie(die, parsed);
  };
  const commitDuelDie = (side: "home" | "away", raw: string): void => {
    const parsed = parseDieInput(raw);
    if (parsed !== undefined) onSetDuelDie(side, parsed);
  };

  return (
    <section
      aria-label="Patada inicial"
      data-testid="acta-kickoff-gate"
      className="mt-4 border border-navy/20 bg-white p-4"
    >
      {/* Header — «PATADA INICIAL · EVENTO 2D6» + Patea/Recibe chips. */}
      <div className="border-l-2 border-red pl-3">
        <h3 className="font-display text-lg font-bold uppercase tracking-wide text-navy">
          PATADA INICIAL · EVENTO 2D6
        </h3>
        {kicking != null ? (
          <div className="mt-2 flex flex-wrap gap-2">
            <span className="rounded-sm bg-navy px-2 py-1 font-display text-xs font-bold uppercase tracking-wide text-white">
              Patea · {nameOf(kicking)}
            </span>
            <span className="rounded-sm border border-red px-2 py-1 font-display text-xs font-bold uppercase tracking-wide text-red">
              Recibe · {nameOf(kicking === "home" ? "away" : "home")}
            </span>
          </div>
        ) : null}
        <p className="mt-2 text-xs text-ink">{KICKOFF_INTRO_QUOTE}</p>
      </div>

      {/* Row ① — the 2D6 roll: TWO die fields, automatic OR manual (U12 · L32). */}
      <div className={`${ROW} mt-3`}>
        <p className={ROW_LABEL}>① Tirada 2D6</p>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <ManualDie
            label="Dado 1 del kickoff"
            value={kickoff.d1}
            disabled={kickoffLocked}
            onChange={(raw) => commitDie(1, raw)}
          />
          <ManualDie
            label="Dado 2 del kickoff"
            value={kickoff.d2}
            disabled={kickoffLocked}
            onChange={(raw) => commitDie(2, raw)}
          />
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-3">
          <button
            type="button"
            className={BTN}
            disabled={!canRollKickoff}
            onClick={() => {
              // Real browsers never click a disabled button; the guard keeps
              // the reducer idle under synthetic events too.
              if (!canRollKickoff) return;
              onRoll();
            }}
          >
            Tirar 2D6
          </button>
          <span
            role="status"
            className={`font-display text-xs font-bold uppercase tracking-wide ${
              kickoff.registered ? "text-red" : "text-ink/60"
            }`}
          >
            {kickoff.registered
              ? "Registrado"
              : rolled
                ? "Tirada registrada"
                : "Pendiente"}
          </span>
        </div>
        <p className="mt-2 text-xs text-ink">
          Automático con la app o introduce cada dado (1-6) a mano — no es
          obligatorio tirar.
        </p>
      </div>

      {rolled && event != null ? (
        <>
          {/* Row ② — the rolled event (sum + name + verbatim effect). */}
          <div className={`${ROW} mt-3`}>
            <p className={ROW_LABEL}>② Evento</p>
            <p className="mt-2 font-display text-xl font-bold text-red">
              {`2D6 = ${sum}`}
            </p>
            <p className="mt-1 font-display text-lg font-bold text-navy">
              {event.name}
            </p>
            <p className="mt-2 text-sm text-ink">{event.effect}</p>
            {event.resolution === "manual" ? (
              <p className="mt-2 inline-block border border-red/40 px-2 py-1 text-xs font-semibold text-red">
                Aplicación manual en la demo
              </p>
            ) : null}
            {event.resolution === "weather" ? (
              <p className="mt-2 inline-block border border-red/40 px-2 py-1 text-xs font-semibold text-red">
                Nueva tirada de Clima al registrar (2D6 → tabla de Clima)
              </p>
            ) : null}
          </div>

          {/* Row ③ — the opposed duel (only on 6/7/11/12): OPTIONAL, and
              each coach throws (or types) their OWN 1D6 (U12 · L32). */}
          {event.resolution === "opposed" ? (
            <div className={`${ROW} mt-3`}>
              <p className={ROW_LABEL}>③ Duelo 1D6</p>
              <p className="mt-2 text-xs text-ink">
                Cada entrenador tira su propio dado (o introduce el suyo) — la
                tirada enfrentada es opcional.
              </p>
              {kickoff.duelManual ? (
                <p className="mt-2 inline-block border border-red/40 px-2 py-1 text-xs font-semibold text-red">
                  Duelo resuelto manualmente en la mesa
                </p>
              ) : (
                <>
                  <div className="mt-2">
                    <GateDie
                      label={`TÚ · ${nameOf(viewerSide)}`}
                      value={kickoff.followUp?.[viewerSide] ?? null}
                      dieLabel="Tirar 1D6 · TÚ"
                      recorded={kickoff.followUp?.[viewerSide] != null}
                      onRoll={() => onRollDuel(viewerSide)}
                    />
                    <ManualDie
                      label="Dado TÚ (manual)"
                      value={kickoff.followUp?.[viewerSide] ?? null}
                      disabled={kickoff.registered}
                      onChange={(raw) => commitDuelDie(viewerSide, raw)}
                    />
                  </div>
                  <div className="mt-3">
                    <GateDie
                      label={`RIVAL · ${nameOf(rivalSide)}`}
                      value={kickoff.followUp?.[rivalSide] ?? null}
                      dieLabel="Tirar 1D6 · RIVAL"
                      recorded={kickoff.followUp?.[rivalSide] != null}
                      onRoll={() => onRollDuel(rivalSide)}
                    />
                    <ManualDie
                      label="Dado RIVAL (manual)"
                      value={kickoff.followUp?.[rivalSide] ?? null}
                      disabled={kickoff.registered}
                      onChange={(raw) => commitDuelDie(rivalSide, raw)}
                    />
                  </div>
                  {bothDuelDiceNull ? (
                    <button
                      type="button"
                      className={`${BTN} mt-3`}
                      onClick={onSkipDuel}
                    >
                      Duelo resuelto manualmente
                    </button>
                  ) : null}
                </>
              )}
              <p className="mt-3 text-xs text-ink">{tieRuleText(event)}</p>
              <p className="mt-2 text-sm font-semibold text-navy">
                {kickoffDuelLine(event, kickoff.followUp, names)}
              </p>
            </div>
          ) : null}

          {/* Row ④ — the registro line. */}
          <div className={`${ROW} mt-3`}>
            <p className={ROW_LABEL}>④ Registro</p>
            <p className="mt-2 font-display text-sm font-bold text-navy">
              {kickoffRegisterLine(event, kickoff.followUp, names)}
            </p>
          </div>
        </>
      ) : null}

      {/* The 11-event table as chips — the rolled sum is highlighted. */}
      <div className="mt-4">
        <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-navy">
          Tabla de eventos de patada inicial (2D6)
        </p>
        <ul className="mt-2 flex flex-wrap gap-1.5">
          {KICKOFF_EVENTS.map((face) => {
            const active = face.sum === sum;
            return (
              <li
                key={face.id}
                data-testid="kickoff-face-chip"
                data-sum={face.sum}
                className={`rounded-sm px-2 py-1 text-[11px] font-semibold ${
                  active
                    ? "bg-red text-white"
                    : "border border-navy/20 text-navy"
                }`}
              >
                {`${face.sum} · ${face.name}`}
              </li>
            );
          })}
        </ul>
      </div>

      {/* Footnote — the ball lands AFTER the event; free reception if out. */}
      <div className="mt-4 border-t border-navy/10 pt-3">
        <p className="text-sm font-semibold text-navy">
          El balón aterriza después del evento — Recepción libre si sale de
          banda.
        </p>
        <p className="mt-2 text-xs text-ink">{KICKOFF_LANDING_QUOTE}</p>
        <p className="mt-2 text-xs text-ink">{KICKOFF_FREE_RECEPTION_QUOTE}</p>
      </div>

      {/* Footer CTA — disabled until the 2D6 roll. */}
      <button
        type="button"
        className={`${PRIMARY} mt-4 w-full px-4 py-3 text-sm`}
        disabled={!rolled || kickoff.registered}
        onClick={() => {
          // Real browsers never click a disabled button; the guard keeps the
          // demo reducer idle under synthetic events too.
          if (!rolled || kickoff.registered) return;
          onRegister();
        }}
      >
        REGISTRAR EN ACTA Y CONTINUAR
      </button>
    </section>
  );
}
