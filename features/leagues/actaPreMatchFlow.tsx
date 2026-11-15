import { useState, type ReactNode } from "react";

import { rollD3, rollD6 } from "@/lib/random";
import {
  listInducements,
  type InducementCartItem,
  type PersistedInducements,
} from "@/lib/rules/inducements";
import { weatherFromRoll } from "@/lib/rules/weather";

import type { FanFactorLine } from "./actaPreMatch";
import { formatMo } from "./actaSheetHeader";

/**
 * Antes del partido (S5 + S2c): the rulebook pre-match sequence captured
 * INSIDE the acta's opening, scoped PER SIDE — each coach fills only their
 * own rolls and inducements («cada usuario deberia ver el suyo… las Águilas
 * de Khemri no deberian ver las cosas de Colmillos del Caos y viceversa») —
 * while the «Lo que ha sucedido» report informs every CONFIRMED fact of both
 * sides («segun nuestras tiradas se informaran en esa parte de lo que ha
 * sucedido»). Rulebook order (digest §B): 1) Los Hinchas (dedicated fans +
 * 1D3), 2) El Clima (1D6 per coach → 2D6 table), 3) Contratar Sustitutos
 * (league-only — note here), 4) Incentivos (the coaches SELECT them),
 * 5) Determinar Equipo Pateador (opposed 1D6, ties re-rolled, winner
 * decides). Every roll defaults to MANUAL entry with an Auto option (S5:
 * «Todo manual con opcion a automatico en cada step»). The acta (header +
 * timeline) derives from these commits — direction A.
 */

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
  | {
      step: "inducements";
      side: "home" | "away";
      items: InducementCartItem[];
    }
  | { step: "kickRoll"; side: "home" | "away"; die: number }
  | { step: "kickTie" }
  | { step: "kicking"; kicking: "home" | "away" };

export interface ActaPreMatchFlowProps {
  homeName: string;
  awayName: string;
  /** Dedicated-fans attribute per side (the +N in the attendance roll). */
  homeBase: number;
  awayBase: number;
  /** Which coach is viewing: the capture shows ONLY this side. */
  viewerSide: "home" | "away";
  snapshot: ActaPreMatchSnapshot;
  onCommit: (commit: PreMatchCommit) => void;
  /** Injectable dice (Auto mode); defaults to the real dice in lib/random. */
  dice?: { d3: () => number; d6: () => number };
}

type Side = "home" | "away";
type RollMode = "manual" | "auto";

const BUTTON =
  "rounded-md border border-navy px-3 py-1.5 text-sm font-semibold text-navy hover:bg-background disabled:opacity-40";

function ModeToggle({
  mode,
  onChange,
}: {
  mode: RollMode;
  onChange: (mode: RollMode) => void;
}) {
  return (
    <div role="group" aria-label="Modo de tirada" className="flex gap-2">
      <button
        type="button"
        aria-pressed={mode === "manual"}
        className={BUTTON}
        onClick={() => onChange("manual")}
      >
        Manual
      </button>
      <button
        type="button"
        aria-pressed={mode === "auto"}
        className={BUTTON}
        onClick={() => onChange("auto")}
      >
        Auto
      </button>
    </div>
  );
}

function DieField({
  label,
  rollLabel,
  mode,
  value,
  max,
  onManual,
  onRoll,
}: {
  label: string;
  rollLabel: string;
  mode: RollMode;
  value: number | null;
  max: number;
  onManual: (raw: string) => void;
  onRoll: () => void;
}) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm text-navy">{label}</span>
      {mode === "manual" ? (
        <input
          type="number"
          min={1}
          max={max}
          aria-label={label}
          value={value ?? ""}
          onChange={(event) => onManual(event.target.value)}
          className="w-16 rounded-md border border-navy/40 px-2 py-1 text-sm"
        />
      ) : (
        <button type="button" className={BUTTON} onClick={onRoll}>
          {rollLabel}
        </button>
      )}
    </div>
  );
}

function StepGroup({
  label,
  title,
  done,
  children,
}: {
  label: string;
  title: string;
  done: boolean;
  children: ReactNode;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className="mt-3 border-t border-navy/15 pt-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-semibold text-navy">{title}</h3>
        <span className="text-xs font-semibold uppercase tracking-wide text-navy">
          {done ? "Hecho" : "Pendiente"}
        </span>
      </div>
      {children}
    </div>
  );
}

function clampDie(raw: string, max: number): number | null {
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) ? Math.min(max, Math.max(1, parsed)) : null;
}

export function ActaPreMatchFlow({
  homeName,
  awayName,
  homeBase,
  awayBase,
  viewerSide,
  snapshot,
  onCommit,
  dice = { d3: rollD3, d6: rollD6 },
}: ActaPreMatchFlowProps) {
  const [fanMode, setFanMode] = useState<RollMode>("manual");
  const [weatherMode, setWeatherMode] = useState<RollMode>("manual");
  const [kickMode, setKickMode] = useState<RollMode>("manual");
  const [fanDie, setFanDie] = useState<number | null>(null);
  const [weatherDie, setWeatherDie] = useState<number | null>(null);
  const [kickDie, setKickDie] = useState<number | null>(null);
  const [kickChoice, setKickChoice] = useState<Side | null>(null);
  const [cart, setCart] = useState<PersistedInducements>(() => ({
    home: snapshot.inducements.home.map((item) => ({ ...item })),
    away: snapshot.inducements.away.map((item) => ({ ...item })),
  }));

  const nameOf = (side: Side) => (side === "home" ? homeName : awayName);
  const baseOf = (side: Side) => (side === "home" ? homeBase : awayBase);
  const rivalSide: Side = viewerSide === "home" ? "away" : "home";

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

  const myFanDie = fanDie;
  const myWeatherDie = weatherDie ?? snapshot.weatherDice[viewerSide];
  const rivalWeatherDie = snapshot.weatherDice[rivalSide];
  const weatherSum =
    myWeatherDie != null && rivalWeatherDie != null
      ? myWeatherDie + rivalWeatherDie
      : null;
  const myKickDie = kickDie ?? snapshot.kickDice[viewerSide];
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

  const reportLines: ReactNode[] = [];
  if (snapshot.weather != null) {
    reportLines.push(
      <p key="weather" className="text-sm text-navy">
        Clima: 2D6 = {snapshot.weather.roll} ·{" "}
        {weatherFromRoll(snapshot.weather.roll).label}
      </p>,
    );
  }
  for (const side of ["home", "away"] as const) {
    const fan = snapshot.fans[side];
    if (fan != null) {
      reportLines.push(
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
    reportLines.push(
      <p key={`ind-${side}`} className="text-sm text-navy">
        Incentivos — {nameOf(side)}: {joined}
      </p>,
    );
  }
  if (kickTie) {
    reportLines.push(
      <p key="kick" className="text-sm text-navy">
        Pateador: empate 🎲{snapshot.kickDice.home} — repetir tirada
      </p>,
    );
  } else if (kickWinner != null) {
    reportLines.push(
      <p key="kick" className="text-sm text-navy">
        Pateador: 🎲{snapshot.kickDice.home} vs 🎲{snapshot.kickDice.away} —
        gana {nameOf(kickWinner)}
      </p>,
    );
  }
  if (snapshot.kicking != null) {
    reportLines.push(
      <p key="kicking" className="text-sm text-navy">
        Quién patea: {nameOf(snapshot.kicking)}
      </p>,
    );
  }

  return (
    <section
      aria-label="Antes del partido"
      className="mt-4 border border-navy/20 bg-white p-4"
    >
      <h2 className="text-lg font-bold text-navy">Antes del partido</h2>
      <p className="text-sm text-navy">
        Solo rellenas tu parte; el acta informa de lo que ha sucedido.
      </p>

      <StepGroup
        label="Paso 1 · Los Hinchas"
        title="1 · Los Hinchas"
        done={snapshot.fans[viewerSide] != null}
      >
        <p className="text-sm text-navy">
          Afición ocasional: aficionados dedicados + 1D3.
        </p>
        <ModeToggle mode={fanMode} onChange={setFanMode} />
        <div className="mt-1 flex items-center gap-3">
          <DieField
            label={`D3 afición (${nameOf(viewerSide)})`}
            rollLabel="Tirar afición"
            mode={fanMode}
            value={myFanDie}
            max={3}
            onManual={(raw) => setFanDie(clampDie(raw, 3))}
            onRoll={() => setFanDie(dice.d3())}
          />
          <p className="text-sm text-navy">
            {baseOf(viewerSide)} + {myFanDie ?? "?"} ={" "}
            {myFanDie != null ? baseOf(viewerSide) + myFanDie : "?"}
          </p>
        </div>
        <button
          type="button"
          className={`${BUTTON} mt-2`}
          disabled={myFanDie == null}
          onClick={() =>
            myFanDie != null &&
            onCommit({
              step: "fanRoll",
              side: viewerSide,
              line: {
                base: baseOf(viewerSide),
                dice: myFanDie,
                total: baseOf(viewerSide) + myFanDie,
              },
            })
          }
        >
          Confirmar mi tirada de hinchas
        </button>
      </StepGroup>

      <StepGroup
        label="Paso 2 · El Clima"
        title="2 · El Clima"
        done={snapshot.weather != null}
      >
        <p className="text-sm text-navy">
          Cada entrenador tira 1D6; la suma (2D6) marca el clima.
        </p>
        <ModeToggle mode={weatherMode} onChange={setWeatherMode} />
        <DieField
          label={`D6 clima (${nameOf(viewerSide)})`}
          rollLabel="Tirar clima"
          mode={weatherMode}
          value={weatherDie}
          max={6}
          onManual={(raw) => setWeatherDie(clampDie(raw, 6))}
          onRoll={() => setWeatherDie(dice.d6())}
        />
        {weatherSum != null ? (
          <p className="text-sm font-semibold text-navy">
            2D6 = {weatherSum} · {weatherFromRoll(weatherSum).label}
          </p>
        ) : null}
        <button
          type="button"
          className={`${BUTTON} mt-2`}
          disabled={weatherDie == null}
          onClick={() =>
            weatherDie != null &&
            onCommit({
              step: "weatherRoll",
              side: viewerSide,
              die: weatherDie,
            })
          }
        >
          Confirmar mi dado de clima
        </button>
      </StepGroup>

      <StepGroup
        label="Paso 3 · Incentivos"
        title="3 · Incentivos"
        done={snapshot.inducementsDone[viewerSide]}
      >
        <p className="text-sm text-navy">
          Selecciona tus incentivos (caja menor / VAE).
        </p>
        <div
          role="group"
          aria-label={`Incentivos ${nameOf(viewerSide)}`}
          className="mt-2"
        >
          {listInducements().map((entry) => {
            const count =
              cart[viewerSide].find((item) => item.id === entry.id)?.count ?? 0;
            return (
              <div key={entry.id} className="flex items-center gap-2">
                <span className="text-sm text-navy">
                  {entry.displayName}
                  {count > 0 ? ` ×${count}` : ""} — {formatMo(entry.price)}{" "}
                  M.O. (máx. {entry.max})
                </span>
                <button
                  type="button"
                  aria-label={`Añadir ${entry.displayName}`}
                  className={BUTTON}
                  disabled={count >= entry.max}
                  onClick={() => bumpCart(entry.id, 1)}
                >
                  +
                </button>
                <button
                  type="button"
                  aria-label={`Quitar ${entry.displayName}`}
                  className={BUTTON}
                  disabled={count <= 0}
                  onClick={() => bumpCart(entry.id, -1)}
                >
                  −
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-2 text-sm text-navy">
          Caja menor: diferencia de VAE + gasto rival en incentivos (máx.
          +50.000 M.O. de tesorería)
        </p>
        <button
          type="button"
          className={`${BUTTON} mt-2`}
          onClick={() =>
            onCommit({
              step: "inducements",
              side: viewerSide,
              items: cart[viewerSide].map((item) => ({ ...item })),
            })
          }
        >
          Confirmar mis incentivos
        </button>
      </StepGroup>

      <StepGroup
        label="Paso 4 · Equipo pateador"
        title="4 · Equipo pateador"
        done={snapshot.kicking != null}
      >
        <p className="text-sm text-navy">
          1D6 enfrentado; el ganador decide quién patea (empate: se repite).
        </p>
        <ModeToggle mode={kickMode} onChange={setKickMode} />
        <DieField
          label={`D6 pateador (${nameOf(viewerSide)})`}
          rollLabel="Tirar pateador"
          mode={kickMode}
          value={myKickDie}
          max={6}
          onManual={(raw) => setKickDie(clampDie(raw, 6))}
          onRoll={() => setKickDie(dice.d6())}
        />
        <button
          type="button"
          className={`${BUTTON} mt-2`}
          disabled={kickDie == null}
          onClick={() =>
            kickDie != null &&
            onCommit({ step: "kickRoll", side: viewerSide, die: kickDie })
          }
        >
          Confirmar mi tirada de pateador
        </button>
        {kickTie ? (
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm font-semibold text-navy">
              Empate: repetir tirada
            </p>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                setKickDie(null);
                setKickChoice(null);
                onCommit({ step: "kickTie" });
              }}
            >
              Repetir tirada
            </button>
          </div>
        ) : null}
        {kickWinner != null ? (
          <p className="mt-1 text-sm font-semibold text-navy">
            Gana {nameOf(kickWinner)}
          </p>
        ) : null}
        {kickWinner === viewerSide && snapshot.kicking == null ? (
          <div role="group" aria-label="Quién patea" className="mt-1 flex gap-2">
            {(["home", "away"] as const).map((side) => (
              <button
                key={side}
                type="button"
                aria-pressed={kickChoice === side}
                className={BUTTON}
                onClick={() => setKickChoice(side)}
              >
                Patea {nameOf(side)}
              </button>
            ))}
          </div>
        ) : null}
        <button
          type="button"
          className={`${BUTTON} mt-2`}
          disabled={kickChoice == null || kickWinner !== viewerSide}
          onClick={() =>
            kickChoice != null &&
            onCommit({ step: "kicking", kicking: kickChoice })
          }
        >
          Confirmar pateador
        </button>
      </StepGroup>

      <p className="mt-3 text-sm text-navy">
        Sustitutos: solo en liga — no aplica en esta demo
      </p>

      <div
        role="region"
        aria-label="Lo que ha sucedido"
        className="mt-4 border-t border-navy/15 pt-3"
      >
        <h3 className="font-semibold text-navy">Lo que ha sucedido</h3>
        {reportLines.length === 0 ? (
          <p className="text-sm text-navy">Aún no hay nada confirmado.</p>
        ) : (
          reportLines
        )}
      </div>
    </section>
  );
}
