import { useState, type ReactNode } from "react";

import { rollD3, rollD6 } from "@/lib/random";
import {
  listInducements,
  type InducementCartItem,
  type PersistedInducements,
} from "@/lib/rules/inducements";
import { weatherFromRoll } from "@/lib/rules/weather";

import type { FanFactorLine } from "./actaPreMatch";
import { sideCompleteOf } from "./actaDemoReducer";
import { formatMo } from "./actaSheetHeader";

export interface PreMatchWeather {
  /** The 2D6 sum (one 1D6 per coach). */
  roll: number;
  /** The weather kind resolved from the roll (lib/rules/weather). */
  value: string;
}

export interface ActaPreMatchSnapshot {
  /** Confirmed fan lines per side (derived acta feed). */
  fans: { home: FanFactorLine | null; away: FanFactorLine | null };
  /** Resolved weather (both dice confirmed), else null. */
  weather: PreMatchWeather | null;
  /** Per-side confirmed weather dice (capture progress). */
  weatherDice: { home: number | null; away: number | null };
  /** Confirmed inducement carts per side. */
  inducements: PersistedInducements;
  /** Per-side inducement confirmation. */
  inducementsDone: { home: boolean; away: boolean };
  /** Per-side confirmed kick dice (the opposed 1D6). */
  kickDice: { home: number | null; away: number | null };
  /** Winner's decision: who kicks. */
  kicking: "home" | "away" | null;
}

export type PreMatchCommit =
  | { step: "fanRoll"; side: "home" | "away"; line: FanFactorLine }
  | { step: "weatherRoll"; side: "home" | "away"; die: number }
  | { step: "inducements"; side: "home" | "away"; items: InducementCartItem[] }
  | { step: "kickRoll"; side: "home" | "away"; die: number }
  | { step: "kickTie" }
  | { step: "kicking"; kicking: "home" | "away" };

export interface ActaPreMatchCaptureProps {
  homeName: string;
  awayName: string;
  /** Dedicated-fans attribute per side (the +N in the attendance roll). */
  homeBase: number;
  awayBase: number;
  /** Which coach is viewing: the capture shows ONLY this side. */
  viewerSide: "home" | "away";
  snapshot: ActaPreMatchSnapshot;
  onCommit: (commit: PreMatchCommit) => void;
  /** Injectable dice (auto roll); defaults to the real dice in lib/random. */
  dice?: { d3: () => number; d6: () => number };
}

/**
 * S6 · Modal wizard «Antes del partido» (design «Opción 5 · Editorial
 * Minimalista», Stitch screen b021a39ac4dc47dc9b856786bb5f58e6).
 *
 * Contract (user, 2026-11-13): the pre-match capture is a MODAL that shows
 * ONE step at a time («las steps no deberian verse de golpe, deberia ir por
 * pasos»); the automatic roll is a DICE BUTTON — clicking it rolls and
 * records the result directly («si le dan hara una tirada automatica y la
 * apuntara directamente, en vez de tener lo que tenemos ahora»), replacing
 * the Manual/Auto toggle; the die button is the ONLY entry for rolls — there
 * is no manual field (S7.2); after the LAST step the modal closes and
 * everything derives into
 * the acta («todo saldra como debiera (en la informacion de arriba y
 * abajo)»). Capture stays PER SIDE (S2c): the coach records only their own
 * rolls; the rival appears read-only, confirmed facts only.
 */

export interface ActaPreMatchWizardProps extends ActaPreMatchCaptureProps {
  /** Renders nothing while closed. */
  open: boolean;
  /** «Cerrar» — close without finishing. */
  onDismiss: () => void;
  /** «Finalizar» — the last step is done; the parent closes and derives. */
  onFinish: () => void;
}

type Side = "home" | "away";

const STEPS = [
  { name: "Los Hinchas", next: "Avanzar al Clima" },
  { name: "El Clima", next: "Avanzar a Incentivos" },
  { name: "Incentivos", next: "Avanzar al Equipo pateador" },
  { name: "Equipo pateador", next: "Finalizar" },
] as const;

const BTN =
  "rounded-sm border border-navy/30 px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide text-navy hover:bg-fill-hover disabled:cursor-not-allowed disabled:opacity-40";
const PRIMARY =
  "rounded-sm bg-navy px-4 py-2 font-display text-xs font-bold uppercase tracking-wide text-white hover:bg-navy-hover disabled:cursor-not-allowed disabled:opacity-40";
/** Official BB2025 weather table (digest §B); the resolved row is marked. */
function WeatherTable({ sum }: { sum: number | null }) {
  const rows: [string, string, string][] = [
    ["2 – 3", "Frío glacial", "−1 a tiradas de A Por Ellos"],
    ["4 – 5", "Ventisca / nieve", "Pases limitados a Pase Rápido"],
    ["6 – 8", "Clima perfecto", "Sin modificadores"],
    ["9 – 10", "Lluvia torrencial", "−1 a la tirada de Atrapar"],
    ["11 – 12", "Calor asfixiante", "Posible desmayo 1D6 tras TD"],
  ];
  const activeIndex = sum == null ? -1 : sum <= 3 ? 0 : sum <= 5 ? 1 : sum <= 8 ? 2 : sum <= 10 ? 3 : 4;
  return (
    <table
      aria-label="Tabla oficial de clima"
      className="mt-3 w-full border-collapse text-left text-xs text-ink"
    >
      <thead>
        <tr className="border-b border-navy/20 font-display uppercase tracking-wide text-navy">
          <th className="py-1 pr-2 font-bold">2D6</th>
          <th className="py-1 pr-2 font-bold">Clima</th>
          <th className="py-1 text-right font-bold">Modificador</th>
        </tr>
      </thead>
      <tbody>
        {rows.map(([range, name, mod], index) => (
          <tr
            key={range}
            className={
              index === activeIndex
                ? "border-b border-navy/10 bg-red text-white"
                : "border-b border-navy/10"
            }
          >
            <td className="py-1 pr-2 font-display font-bold">{range}</td>
            <td className="py-1 pr-2">{name}</td>
            <td className="py-1 text-right">{mod}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Editorial die card: face + dice BUTTON (roll records directly) with the
 * roll animation — LOCKED once recorded: a finished roll never re-rolls (the
 * only re-roll path is the kick tie's «Repetir tirada»). */
function DieCard({
  teamLabel,
  value,
  dieLabel,
  recorded,
  onRoll,
  totalLine,
  rivalLine,
}: {
  teamLabel: string;
  value: number | null;
  dieLabel: string;
  recorded: boolean;
  onRoll: () => void;
  totalLine: ReactNode;
  rivalLine: ReactNode;
}) {
  const [rollSeq, setRollSeq] = useState(0);
  const rolled = rollSeq > 0;
  return (
    <div className="mt-3 border border-navy/15 bg-white px-4 py-3">
      <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-navy">
        {teamLabel}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span
          key={`glyph-${rollSeq}`}
          aria-hidden="true"
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
          className={`${
            recorded
              ? "font-display text-xs font-bold uppercase tracking-wide text-red"
              : "font-display text-xs font-bold uppercase tracking-wide text-ink/60"
          }${rolled ? " dice-reveal" : ""}`}
        >
          {recorded ? "Registrado" : "Pendiente"}
        </span>
      </div>
      <div className="mt-2 flex items-center gap-2">
        <p className="text-sm text-navy">{totalLine}</p>
      </div>
      {rivalLine}
    </div>
  );
}

export function ActaPreMatchWizard({
  homeName,
  awayName,
  homeBase,
  awayBase,
  viewerSide,
  snapshot,
  onCommit,
  dice = { d3: rollD3, d6: rollD6 },
  open,
  onDismiss,
  onFinish,
}: ActaPreMatchWizardProps) {
  const stepDone = [
    snapshot.fans[viewerSide] != null,
    snapshot.weather != null,
    snapshot.inducementsDone[viewerSide],
    snapshot.kicking != null,
  ];
  const pendingIndex = stepDone.findIndex((done) => !done);
  const firstPending = pendingIndex === -1 ? STEPS.length - 1 : pendingIndex;

  const [lastOpen, setLastOpen] = useState(open);
  const [stepIndex, setStepIndex] = useState(firstPending);
  const [fanRecorded, setFanRecorded] = useState<number | null>(null);
  const [weatherRecorded, setWeatherRecorded] = useState<number | null>(null);
  const [kickRecorded, setKickRecorded] = useState<number | null>(null);
  const [kickChoice, setKickChoice] = useState<Side | null>(null);
  const [cart, setCart] = useState<PersistedInducements>(() => ({
    home: snapshot.inducements.home.map((item) => ({ ...item })),
    away: snapshot.inducements.away.map((item) => ({ ...item })),
  }));

  const nameOf = (side: Side) => (side === "home" ? homeName : awayName);
  const baseOf = (side: Side) => (side === "home" ? homeBase : awayBase);
  const rivalSide: Side = viewerSide === "home" ? "away" : "home";

  // Reopen at the first step still pending for my side (render-phase state
  // adjustment: runs once per open transition, never mid-flow).
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setStepIndex(firstPending);
      setFanRecorded(null);
      setWeatherRecorded(null);
      setKickRecorded(null);
      setKickChoice(null);
      setCart({
        home: snapshot.inducements.home.map((item) => ({ ...item })),
        away: snapshot.inducements.away.map((item) => ({ ...item })),
      });
    }
  }

  const shownFan = fanRecorded ?? snapshot.fans[viewerSide]?.dice ?? null;
  const shownWeather = weatherRecorded ?? snapshot.weatherDice[viewerSide];
  const rivalWeatherDie = snapshot.weatherDice[rivalSide];
  const weatherSum =
    shownWeather != null && rivalWeatherDie != null
      ? shownWeather + rivalWeatherDie
      : null;
  const shownKick = kickRecorded ?? snapshot.kickDice[viewerSide];
  const kickBoth =
    snapshot.kickDice.home != null && snapshot.kickDice.away != null;
  const kickTie =
    kickBoth && snapshot.kickDice.home === snapshot.kickDice.away;
  const kickWinner: Side | null =
    kickBoth && !kickTie
      ? snapshot.kickDice.home! > snapshot.kickDice.away!
        ? "home"
        : "away"
      : null;

  const bumpCart = (id: string, delta: number) => {
    const max = listInducements().find((entry) => entry.id === id)?.max ?? 1;
    setCart((prev) => {
      const items: InducementCartItem[] = prev[viewerSide].map((item) => ({
        ...item,
      }));
      const index = items.findIndex((item) => item.id === id);
      const current = index >= 0 ? items[index].count : 0;
      const next = Math.max(0, Math.min(max, current + delta));
      if (index >= 0) {
        if (next === 0) items.splice(index, 1);
        else items[index].count = next;
      } else if (next > 0) {
        items.push({ id, count: next });
      }
      return { ...prev, [viewerSide]: items };
    });
  };

  // S7 rules: a roll is entered ONCE (the die locks), and the forward button
  // only unlocks when this step's marks are in — the kick step also needs a
  // resolved toss and, for the winner, the kicking pick.
  const recordedFan = fanRecorded != null || snapshot.fans[viewerSide] != null;
  const recordedWeather =
    weatherRecorded != null || snapshot.weatherDice[viewerSide] != null;
  const recordedKick =
    kickRecorded != null || snapshot.kickDice[viewerSide] != null;
  const canAdvance =
    stepIndex === 0
      ? recordedFan
      : stepIndex === 1
        ? recordedWeather
        : stepIndex === 2
          ? true
          : recordedKick &&
            !kickTie &&
            (kickWinner !== viewerSide ||
              snapshot.kicking != null ||
              kickChoice != null);

  const advance = () => {
    if (!canAdvance) return;
    if (stepIndex === 2) {
      onCommit({
        step: "inducements",
        side: viewerSide,
        items: cart[viewerSide].map((item) => ({ ...item })),
      });
    }
    if (stepIndex === STEPS.length - 1) {
      if (kickChoice != null && kickWinner === viewerSide && snapshot.kicking == null) {
        onCommit({ step: "kicking", kicking: kickChoice });
      }
      onFinish();
      return;
    }
    setStepIndex((index) => Math.min(STEPS.length - 1, index + 1));
  };

  if (!open) return null;

  const step = STEPS[stepIndex];

  return (
    <div className="fixed inset-0 z-40 bg-ink/50">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Antes del partido"
        className="flex h-full w-full flex-col bg-panel"
      >
        <header className="flex items-start justify-between gap-4 border-b border-navy/15 px-5 py-4">
          <div>
            <p className="font-display text-xs font-bold uppercase tracking-[0.18em] text-red">
              Secuencia oficial BB2025
            </p>
            <h2 className="font-display text-2xl font-bold text-navy">
              Antes del partido
            </h2>
          </div>
          <button type="button" className={BTN} onClick={onDismiss}>
            Cerrar
          </button>
        </header>

        <ol
          aria-label="Secuencia pre-partido"
          className="flex divide-x divide-navy/15 border-b border-navy/15"
        >
          {STEPS.map((entry, index) => (
            <li
              key={entry.name}
              aria-current={index === stepIndex ? "step" : undefined}
              className={`flex-1 px-3 py-2 font-display text-xs font-bold uppercase tracking-wide ${
                index === stepIndex
                  ? "text-red"
                  : stepDone[index]
                    ? "text-navy"
                    : "text-ink/50"
              }`}
            >
              {stepDone[index] ? "✓ " : ""}
              {index + 1} · {entry.name}
            </li>
          ))}
        </ol>

        <section
          role="group"
          aria-label={`Paso ${stepIndex + 1} · ${step.name}`}
          className="flex-1 overflow-y-auto px-5 py-4"
        >
          <div className="border-l-2 border-red pl-3">
            <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-red">
              Paso {stepIndex + 1} de 4
            </p>
            <h3 className="font-display text-lg font-bold text-navy">
              {step.name}
            </h3>
            <p className="text-sm text-ink">
              {stepIndex === 0
                ? "La afición ocasional: aficionados dedicados + 1D3."
                : stepIndex === 1
                  ? "Cada entrenador lanza 1D6; la suma (2D6) resuelve el clima."
                  : stepIndex === 2
                    ? "Selecciona tus incentivos (precio y límite del reglamento)."
                    : "1D6 enfrentado; el ganador decide quién patea (empate: se repite)."}
            </p>
          </div>

          {stepIndex === 0 ? (
            <DieCard
              teamLabel={`Tu tirada · ${nameOf(viewerSide)}`}
              value={shownFan}
              dieLabel="Tirar 1D3"
              recorded={recordedFan}
              onRoll={() => {
                const value = dice.d3();
                setFanRecorded(value);
                onCommit({
                  step: "fanRoll",
                  side: viewerSide,
                  line: {
                    base: baseOf(viewerSide),
                    dice: value,
                    total: baseOf(viewerSide) + value,
                  },
                });
              }}
              totalLine={`${baseOf(viewerSide)} + ${shownFan ?? "?"} = ${
                shownFan != null ? baseOf(viewerSide) + shownFan : "?"
              }`}
              rivalLine={
                snapshot.fans[rivalSide] != null ? (
                  <p className="mt-2 text-sm text-ink">
                    Afición rival · {nameOf(rivalSide)}:{" "}
                    {snapshot.fans[rivalSide]!.total} · Confirmado
                  </p>
                ) : null
              }
            />
          ) : null}

          {stepIndex === 1 ? (
            <>
              <DieCard
                teamLabel={`Tu tirada · ${nameOf(viewerSide)}`}
                value={shownWeather}
                dieLabel="Tirar 1D6"
                recorded={recordedWeather}
                onRoll={() => {
                  const value = dice.d6();
                  setWeatherRecorded(value);
                  onCommit({ step: "weatherRoll", side: viewerSide, die: value });
                }}
                totalLine={
                  weatherSum != null
                    ? `2D6 = ${weatherSum} · ${weatherFromRoll(weatherSum).label}`
                    : "2D6 = ? · falta el dado rival"
                }
                rivalLine={
                  rivalWeatherDie != null ? (
                    <p className="mt-2 text-sm text-ink">
                      Tirada rival · {nameOf(rivalSide)}: {rivalWeatherDie} ·
                      Confirmado
                    </p>
                  ) : null
                }
              />
              {weatherSum != null ? (
                <div className="mt-3 border border-red bg-red px-4 py-3 text-white">
                  <p className="font-display text-xs font-bold uppercase tracking-[0.16em]">
                    Resolución oficial 2D6
                  </p>
                  <p className="font-display text-xl font-bold">
                    2D6 = {weatherSum} · {weatherFromRoll(weatherSum).label}
                  </p>
                </div>
              ) : null}
              <WeatherTable sum={weatherSum} />
            </>
          ) : null}

          {stepIndex === 2 ? (
            <>
              <div
                role="group"
                aria-label={`Incentivos ${nameOf(viewerSide)}`}
                className="mt-3 border border-navy/15 bg-white"
              >
                {listInducements().map((entry) => {
                  const count =
                    cart[viewerSide].find((item) => item.id === entry.id)
                      ?.count ?? 0;
                  return (
                    <div
                      key={entry.id}
                      className="flex items-center gap-3 border-b border-navy/10 px-4 py-2 last:border-b-0"
                    >
                      <span className="flex-1 text-sm text-ink">
                        {entry.displayName}
                        {count > 0 ? (
                          <span className="font-display font-bold text-red">
                            {" "}
                            ×{count}
                          </span>
                        ) : null}
                      </span>
                      <span className="font-display text-sm font-bold text-navy">
                        {formatMo(entry.price)} M.O.
                      </span>
                      <span className="text-xs text-ink/60">
                        máx. {entry.max}
                      </span>
                      <button
                        type="button"
                        aria-label={`Añadir ${entry.displayName}`}
                        className={BTN}
                        disabled={count >= entry.max}
                        onClick={() => bumpCart(entry.id, 1)}
                      >
                        +
                      </button>
                      <button
                        type="button"
                        aria-label={`Quitar ${entry.displayName}`}
                        className={BTN}
                        disabled={count <= 0}
                        onClick={() => bumpCart(entry.id, -1)}
                      >
                        −
                      </button>
                    </div>
                  );
                })}
              </div>
              <p className="mt-2 text-xs text-ink">
                Caja menor: diferencia de VAE + gasto rival en incentivos
                (máx. +50.000 M.O. de tesorería).
              </p>
              {snapshot.inducementsDone[rivalSide] ? (
                <p className="mt-2 text-sm text-ink">
                  Incentivos rival · {nameOf(rivalSide)}:{" "}
                  {snapshot.inducements[rivalSide].length === 0
                    ? "Ninguno"
                    : snapshot.inducements[rivalSide]
                        .map(
                          (item) =>
                            `${
                              listInducements().find(
                                (entry) => entry.id === item.id,
                              )?.displayName ?? item.id
                            } ×${item.count}`,
                        )
                        .join(", ")}{" "}
                  · Confirmado
                </p>
              ) : null}
            </>
          ) : null}

          {stepIndex === 3 ? (
            <DieCard
              teamLabel={`Tu tirada · ${nameOf(viewerSide)}`}
              value={shownKick}
              dieLabel="Tirar 1D6"
              recorded={recordedKick}
              onRoll={() => {
                const value = dice.d6();
                setKickRecorded(value);
                onCommit({ step: "kickRoll", side: viewerSide, die: value });
              }}
              totalLine={
                kickTie
                  ? `Empate: 🎲${snapshot.kickDice.home} — repetir tirada`
                  : kickWinner != null
                    ? `Gana ${nameOf(kickWinner)}`
                    : "1D6 enfrentado · pendiente"
              }
              rivalLine={
                snapshot.kickDice[rivalSide] != null ? (
                  <p className="mt-2 text-sm text-ink">
                    Tirada rival · {nameOf(rivalSide)}:{" "}
                    {snapshot.kickDice[rivalSide]} · Confirmado
                  </p>
                ) : null
              }
            />
          ) : null}

          {stepIndex === 3 && kickTie ? (
            <button
              type="button"
              className={`${BTN} mt-3`}
              onClick={() => {
                setKickRecorded(null);
                setKickChoice(null);
                onCommit({ step: "kickTie" });
              }}
            >
              Repetir tirada
            </button>
          ) : null}

          {stepIndex === 3 && kickWinner === viewerSide && snapshot.kicking == null ? (
            <div
              role="group"
              aria-label="Quién patea"
              className="mt-3 flex gap-2"
            >
              {(["home", "away"] as const).map((side) => (
                <button
                  key={side}
                  type="button"
                  aria-pressed={kickChoice === side}
                  className={BTN}
                  onClick={() => setKickChoice(side)}
                >
                  Patea {nameOf(side)}
                </button>
              ))}
            </div>
          ) : null}

          {stepIndex === 3 && snapshot.kicking != null ? (
            <p className="mt-3 text-sm font-semibold text-navy">
              Patea: {nameOf(snapshot.kicking)}
            </p>
          ) : null}
        </section>

        <p className="border-t border-navy/10 px-5 py-2 text-xs text-ink">
          Sustitutos: solo en liga — no aplica en esta demo
        </p>

        {/* S7: forward-only — once a step is behind you, there is no way back. */}
        <footer className="flex items-center justify-between gap-3 border-t border-navy/15 px-5 py-4">
          <p className="flex-1 text-center text-xs text-ink">
            Paso {stepIndex + 1} de {STEPS.length}
          </p>
          <button
            type="button"
            className={PRIMARY}
            disabled={!canAdvance}
            onClick={advance}
          >
            {step.next}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** «Lo que ha sucedido» — the derived report of every CONFIRMED fact (S2c). */
export function ActaPreMatchReport({
  homeName,
  awayName,
  snapshot,
}: {
  homeName: string;
  awayName: string;
  snapshot: ActaPreMatchSnapshot;
}) {
  const nameOf = (side: Side) => (side === "home" ? homeName : awayName);
  const lines: ReactNode[] = [];
  if (snapshot.weather != null) {
    lines.push(
      <p key="weather" className="text-sm text-navy">
        Clima: 2D6 = {snapshot.weather.roll} ·{" "}
        {weatherFromRoll(snapshot.weather.roll).label}
      </p>,
    );
  }
  for (const side of ["home", "away"] as const) {
    const fan = snapshot.fans[side];
    if (fan != null) {
      lines.push(
        <p key={`fan-${side}`} className="text-sm text-navy">
          Afición — {nameOf(side)}: {fan.base} + 🎲{fan.dice} = {fan.total}
        </p>,
      );
    }
  }
  for (const side of ["home", "away"] as const) {
    if (!snapshot.inducementsDone[side]) continue;
    const items = snapshot.inducements[side];
    const joined =
      items.length === 0
        ? "Ninguno"
        : items
            .map((item) => {
              const entry = listInducements().find((e) => e.id === item.id);
              return `${entry?.displayName ?? item.id} ×${item.count}`;
            })
            .join(", ");
    lines.push(
      <p key={`ind-${side}`} className="text-sm text-navy">
        Incentivos — {nameOf(side)}: {joined}
      </p>,
    );
  }
  const kickBoth =
    snapshot.kickDice.home != null && snapshot.kickDice.away != null;
  const kickTie =
    kickBoth && snapshot.kickDice.home === snapshot.kickDice.away;
  const kickWinner: Side | null =
    kickBoth && !kickTie
      ? snapshot.kickDice.home! > snapshot.kickDice.away!
        ? "home"
        : "away"
      : null;
  if (kickTie) {
    lines.push(
      <p key="kick" className="text-sm text-navy">
        Pateador: empate 🎲{snapshot.kickDice.home} — repetir tirada
      </p>,
    );
  } else if (kickWinner != null) {
    lines.push(
      <p key="kick" className="text-sm text-navy">
        Pateador: 🎲{snapshot.kickDice.home} vs 🎲{snapshot.kickDice.away} — gana{" "}
        {nameOf(kickWinner)}
      </p>,
    );
  }
  if (snapshot.kicking != null) {
    lines.push(
      <p key="kicking" className="text-sm text-navy">
        Quién patea: {nameOf(snapshot.kicking)}
      </p>,
    );
  }
  return (
    <div
      role="region"
      aria-label="Lo que ha sucedido"
      className="mt-4 border-t border-navy/15 pt-3"
    >
      <h3 className="font-semibold text-navy">Lo que ha sucedido</h3>
      {lines.length === 0 ? (
        <p className="text-sm text-navy">Aún no hay nada confirmado.</p>
      ) : (
        lines
      )}
    </div>
  );
}

/**
 * S7.5 — the FINAL grouped display («Tourplay»-style): once BOTH coaches
 * finished their sequence, every pre-match roll is bundled in ONE compact
 * block that groups the four phases with both teams side by side («mostraremos
 * por pantalla todas las tiradas englobadas como hace tourplay»).
 */
export function ActaPreMatchSummary({
  homeName,
  awayName,
  snapshot,
}: {
  homeName: string;
  awayName: string;
  snapshot: ActaPreMatchSnapshot;
}) {
  const nameOf = (side: Side) => (side === "home" ? homeName : awayName);
  const fanCell = (side: Side) => {
    const fan = snapshot.fans[side];
    return fan == null ? "—" : `${fan.base} + 🎲${fan.dice} = ${fan.total}`;
  };
  const cartLines = (side: Side) => {
    const items = snapshot.inducements[side];
    if (items.length === 0) return ["Ninguno"];
    return items.map((item) => {
      const entry = listInducements().find((e) => e.id === item.id);
      return entry == null
        ? `${item.id} ×${item.count}`
        : `${entry.displayName} ×${item.count} — ${formatMo(entry.price)} M.O.`;
    });
  };
  const kickBoth =
    snapshot.kickDice.home != null && snapshot.kickDice.away != null;
  const kickTie =
    kickBoth && snapshot.kickDice.home === snapshot.kickDice.away;
  const kickWinner: Side | null =
    kickBoth && !kickTie
      ? snapshot.kickDice.home! > snapshot.kickDice.away!
        ? "home"
        : "away"
      : null;
  return (
    <div
      role="region"
      aria-label="Lo que ha sucedido"
      className="mt-4 border-t border-navy/15 pt-3"
    >
      <h3 className="font-semibold text-navy">Lo que ha sucedido</h3>
      <table
        aria-label="Resumen pre-partido"
        className="mt-2 w-full border-collapse text-left text-xs text-ink"
      >
        <thead>
          <tr className="border-b border-navy/20 font-display uppercase tracking-wide text-navy">
            <th className="py-1 pr-2 font-bold">Fase</th>
            <th className="py-1 pr-2 font-bold">{homeName}</th>
            <th className="py-1 font-bold">{awayName}</th>
          </tr>
        </thead>
        <tbody>
          <tr className="border-b border-navy/10">
            <th
              scope="row"
              className="py-1 pr-2 font-display font-bold text-navy"
            >
              Afición
            </th>
            <td className="py-1 pr-2">{fanCell("home")}</td>
            <td className="py-1">{fanCell("away")}</td>
          </tr>
          <tr className="border-b border-navy/10">
            <th
              scope="row"
              className="py-1 pr-2 font-display font-bold text-navy"
            >
              Clima
            </th>
            <td className="py-1" colSpan={2}>
              {snapshot.weather == null
                ? "—"
                : `2D6 = ${snapshot.weather.roll} · ${
                    weatherFromRoll(snapshot.weather.roll).label
                  }`}
            </td>
          </tr>
          <tr className="border-b border-navy/10">
            <th
              scope="row"
              className="py-1 pr-2 font-display font-bold text-navy"
            >
              Incentivos
            </th>
            <td className="py-1 pr-2">
              {cartLines("home").map((line) => (
                <p key={line}>{line}</p>
              ))}
            </td>
            <td className="py-1">
              {cartLines("away").map((line) => (
                <p key={line}>{line}</p>
              ))}
            </td>
          </tr>
          <tr className="border-b border-navy/10">
            <td className="py-1 text-xs text-ink/70" colSpan={3}>
              Caja menor: diferencia de VAE + gasto rival en incentivos (máx.
              +50.000 M.O. de tesorería).
            </td>
          </tr>
          <tr>
            <th
              scope="row"
              className="py-1 pr-2 font-display font-bold text-navy"
            >
              Sorteo
            </th>
            <td className="py-1 pr-2">🎲{snapshot.kickDice.home ?? "—"}</td>
            <td className="py-1">🎲{snapshot.kickDice.away ?? "—"}</td>
          </tr>
        </tbody>
      </table>
      <p className="mt-2 text-sm font-semibold text-navy">
        Sorteo: 🎲{snapshot.kickDice.home ?? "?"} vs 🎲
        {snapshot.kickDice.away ?? "?"} —{" "}
        {kickTie
          ? "empate (repetir tirada)"
          : kickWinner != null
            ? `gana ${nameOf(kickWinner)}`
            : "pendiente"}
      </p>
      {snapshot.kicking != null ? (
        <p className="text-sm font-semibold text-navy">
          Patea: {nameOf(snapshot.kicking)}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The acta's opening section — THREE states derived from the capture itself
 * (S7.3–S7.5, no new state flags; `sideCompleteOf` is the only gate):
 * - `!mine` — the current report + «Completar/Editar» trigger (wizard modal).
 * - `mine && !theirs` (S7.4) — «Esperando al contrincante…»; my finished
 *   sequence is CLOSED (S7.3: no edit trigger).
 * - `mine && theirs` (S7.5) — the final grouped display; no edit trigger.
 */
export interface ActaPreMatchSectionProps extends ActaPreMatchCaptureProps {
  /** Controlled modal state; uncontrolled (closed) when omitted. */
  open?: boolean;
  /** Called whenever the modal wants to open/close (controlled mode). */
  onOpenChange?: (open: boolean) => void;
}

export function ActaPreMatchSection(props: ActaPreMatchSectionProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const controlled = props.open !== undefined;
  const open = props.open ?? internalOpen;
  const setOpen = (next: boolean) => {
    if (!controlled) setInternalOpen(next);
    props.onOpenChange?.(next);
  };
  const { snapshot, viewerSide } = props;
  const rivalSide: Side = viewerSide === "home" ? "away" : "home";
  const nameOf = (side: Side) =>
    side === "home" ? props.homeName : props.awayName;
  const mine = sideCompleteOf(snapshot, viewerSide);
  const theirs = sideCompleteOf(snapshot, rivalSide);
  const hasCapture =
    snapshot.fans[viewerSide] != null ||
    snapshot.weatherDice[viewerSide] != null ||
    snapshot.inducementsDone[viewerSide] ||
    snapshot.kickDice[viewerSide] != null ||
    snapshot.kicking != null;
  return (
    <section
      aria-label="Antes del partido"
      className="mt-4 border border-navy/20 bg-white p-4"
    >
      <h2 className="text-lg font-bold text-navy">Antes del partido</h2>
      {!mine ? (
        <>
          <p className="text-sm text-navy">
            Solo rellenas tu parte; el acta informa de lo que ha sucedido.
          </p>
          <button
            type="button"
            className="mt-2 rounded-sm bg-navy px-4 py-2 font-display text-xs font-bold uppercase tracking-wide text-white hover:bg-navy-hover"
            onClick={() => setOpen(true)}
          >
            {hasCapture
              ? "Editar secuencia pre-partido"
              : "Completar secuencia pre-partido"}
          </button>
          <ActaPreMatchReport
            homeName={props.homeName}
            awayName={props.awayName}
            snapshot={snapshot}
          />
        </>
      ) : !theirs ? (
        /* S7.4 — my sequence is finished and closed (S7.3): wait for the rival. */
        <div role="status" className="mt-3 border border-navy/20 px-4 py-6">
          <p className="font-display text-xl font-bold uppercase tracking-[0.16em] text-red">
            Esperando al contrincante…
          </p>
          <p className="mt-3 text-sm text-ink">Contrincante: {nameOf(rivalSide)}</p>
          <p className="mt-1 text-sm text-ink">
            Su secuencia pre-partido todavía no está completa.
          </p>
        </div>
      ) : (
        /* S7.5 — both finished: every roll bundled Tourplay-style. */
        <ActaPreMatchSummary
          homeName={props.homeName}
          awayName={props.awayName}
          snapshot={snapshot}
        />
      )}
      {/* The wizard modal renders nothing while closed. It stays mounted in
          every state so the coach can still press «Finalizar» after the last
          die completes their side (the trigger is already gone by then). It
          can only OPEN via the trigger above — so a finished sequence can
          never be edited (S7.3). */}
      <ActaPreMatchWizard
        {...props}
        open={open}
        onDismiss={() => setOpen(false)}
        onFinish={() => setOpen(false)}
      />
    </section>
  );
}
