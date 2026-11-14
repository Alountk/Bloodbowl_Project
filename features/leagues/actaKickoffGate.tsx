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

export function ActaKickoffGate({
  homeName,
  awayName,
  kicking,
  viewerSide,
  kickoff,
  onRoll,
  onRollDuel,
  onRegister,
}: ActaKickoffGateProps) {
  const rolled = kickoff.d1 != null && kickoff.d2 != null;
  const event = rolled ? kickoffEventFor(kickoff.d1!, kickoff.d2!) : null;
  const sum = rolled ? kickoff.d1! + kickoff.d2! : null;
  const names = { home: homeName, away: awayName };
  const nameOf = (side: "home" | "away") => (side === "home" ? homeName : awayName);
  const rivalSide: "home" | "away" = viewerSide === "home" ? "away" : "home";

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

      {/* Row ① — the 2D6 roll. */}
      <div className={`${ROW} mt-3`}>
        <p className={ROW_LABEL}>① Tirada 2D6</p>
        <div className="mt-2">
          <GateDie
            label={`Equipo pateador · ${kicking != null ? nameOf(kicking) : homeName}`}
            value={kickoff.d1}
            dieLabel="Tirar 2D6"
            recorded={rolled}
            onRoll={onRoll}
          />
        </div>
        {rolled ? (
          <p className="mt-2 text-sm font-semibold text-navy">
            {`🎲2D6 = ${kickoff.d1} + ${kickoff.d2} = ${sum}`}
          </p>
        ) : null}
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

          {/* Row ③ — the opposed duel (only on 6/7/11/12). */}
          {event.resolution === "opposed" ? (
            <div className={`${ROW} mt-3`}>
              <p className={ROW_LABEL}>③ Duelo 1D6</p>
              <div className="mt-2">
                <GateDie
                  label={`TÚ · ${nameOf(viewerSide)}`}
                  value={kickoff.followUp?.[viewerSide] ?? null}
                  dieLabel="Tirar 1D6 · TÚ"
                  recorded={kickoff.followUp?.[viewerSide] != null}
                  onRoll={() => onRollDuel(viewerSide)}
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
              </div>
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
