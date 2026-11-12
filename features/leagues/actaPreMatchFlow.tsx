import {
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

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
 * Fase 1 · Pre-partido (S5): the rulebook pre-match sequence captured INSIDE
 * the acta sequence, so the acta (header + timeline) derives from the capture
 * (direction A). Rulebook order (digest §B «Secuencia Anterior al Partido»):
 * 1) Los Hinchas (dedicated fans + 1D3), 2) El Clima (1D6 per coach → 2D6
 * table), 3) Contratar Sustitutos (league-only — note here), 4) Incentivos
 * (the coaches SELECT them), 5) Determinar Equipo Pateador (opposed 1D6, ties
 * re-rolled, winner decides). Every roll step defaults to MANUAL entry with an
 * Auto option (S5: «Todo manual con opcion a automatico en cada step»).
 */

export interface PreMatchFans {
  home: FanFactorLine;
  away: FanFactorLine;
}

export interface PreMatchWeather {
  /** The 2D6 sum (one 1D6 per coach). */
  roll: number;
  /** The weather kind resolved from the roll (lib/rules/weather). */
  value: string;
}

export interface ActaPreMatchSnapshot {
  fans: PreMatchFans | null;
  weather: PreMatchWeather | null;
  inducements: PersistedInducements;
  inducementsDone: boolean;
  kicking: "home" | "away" | null;
}

export type PreMatchCommit =
  | { step: "fans"; fans: PreMatchFans }
  | { step: "weather"; weather: PreMatchWeather }
  | { step: "inducements"; inducements: PersistedInducements }
  | { step: "kicking"; kicking: "home" | "away" };

export interface ActaPreMatchFlowProps {
  homeName: string;
  awayName: string;
  /** Dedicated-fans attribute per side (the +N in the attendance roll). */
  homeBase: number;
  awayBase: number;
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

export function ActaPreMatchFlow({
  homeName,
  awayName,
  homeBase,
  awayBase,
  snapshot,
  onCommit,
  dice = { d3: rollD3, d6: rollD6 },
}: ActaPreMatchFlowProps) {
  const [fanMode, setFanMode] = useState<RollMode>("manual");
  const [weatherMode, setWeatherMode] = useState<RollMode>("manual");
  const [kickMode, setKickMode] = useState<RollMode>("manual");
  const [fanDice, setFanDice] = useState<{ home: number | null; away: number | null }>(
    { home: null, away: null },
  );
  const [weatherDice, setWeatherDice] = useState<{
    home: number | null;
    away: number | null;
  }>({ home: null, away: null });
  const [kickDice, setKickDice] = useState<{ home: number | null; away: number | null }>(
    { home: null, away: null },
  );
  const [kickChoice, setKickChoice] = useState<Side | null>(null);
  const [cart, setCart] = useState<PersistedInducements>(() => ({
    home: snapshot.inducements.home.map((item) => ({ ...item })),
    away: snapshot.inducements.away.map((item) => ({ ...item })),
  }));

  const nameOf = (side: Side) => (side === "home" ? homeName : awayName);
  const baseOf = (side: Side) => (side === "home" ? homeBase : awayBase);

  const clampInto =
    (setter: Dispatch<
      SetStateAction<{ home: number | null; away: number | null }>
    >, max: number) =>
    (side: Side, raw: string) => {
      const parsed = Number.parseInt(raw, 10);
      const value = Number.isFinite(parsed)
        ? Math.min(max, Math.max(1, parsed))
        : null;
      setter((prev) => ({ ...prev, [side]: value }));
    };

  const setFanDie = clampInto(setFanDice, 3);
  const setWeatherDie = clampInto(setWeatherDice, 6);
  const setKickDie = clampInto(setKickDice, 6);

  const bumpCart = (side: Side, id: string, delta: number) => {
    const max = listInducements().find((entry) => entry.id === id)?.max ?? 1;
    setCart((prev) => {
      const items: InducementCartItem[] = prev[side].map((item) => ({ ...item }));
      const index = items.findIndex((item) => item.id === id);
      const current = index >= 0 ? items[index].count : 0;
      const next = Math.max(0, Math.min(max, current + delta));
      if (index >= 0) {
        if (next === 0) items.splice(index, 1);
        else items[index].count = next;
      } else if (next > 0) {
        items.push({ id, count: next });
      }
      return { ...prev, [side]: items };
    });
  };

  const fanReady = fanDice.home != null && fanDice.away != null;
  const weatherReady = weatherDice.home != null && weatherDice.away != null;
  const kickBoth = kickDice.home != null && kickDice.away != null;
  const kickTie = kickBoth && kickDice.home === kickDice.away;
  const kickWinner: Side | null =
    kickBoth && !kickTie ? (kickDice.home! > kickDice.away! ? "home" : "away") : null;
  const weatherSum = weatherReady ? weatherDice.home! + weatherDice.away! : null;

  return (
    <section
      aria-label="Fase 1 · Pre-partido"
      className="mt-4 border border-navy/20 bg-white p-4"
    >
      <h2 className="text-lg font-bold text-navy">Fase 1 · Pre-partido</h2>

      <StepGroup
        label="Paso 1 · Los Hinchas"
        title="1 · Los Hinchas"
        done={snapshot.fans != null}
      >
        <p className="text-sm text-navy">
          Afición ocasional: aficionados dedicados + 1D3.
        </p>
        <ModeToggle mode={fanMode} onChange={setFanMode} />
        {(["home", "away"] as const).map((side) => (
          <div key={side} className="mt-1 flex items-center gap-3">
            <DieField
              label={`D3 afición ${nameOf(side)}`}
              rollLabel={`Tirar afición ${nameOf(side)}`}
              mode={fanMode}
              value={fanDice[side]}
              max={3}
              onManual={(raw) => setFanDie(side, raw)}
              onRoll={() =>
                setFanDice((prev) => ({ ...prev, [side]: dice.d3() }))
              }
            />
            <p className="text-sm text-navy">
              {baseOf(side)} + {fanDice[side] ?? "?"} ={" "}
              {fanDice[side] != null ? baseOf(side) + fanDice[side]! : "?"}
            </p>
          </div>
        ))}
        <button
          type="button"
          className={`${BUTTON} mt-2`}
          disabled={!fanReady}
          onClick={() =>
            onCommit({
              step: "fans",
              fans: {
                home: {
                  base: homeBase,
                  dice: fanDice.home!,
                  total: homeBase + fanDice.home!,
                },
                away: {
                  base: awayBase,
                  dice: fanDice.away!,
                  total: awayBase + fanDice.away!,
                },
              },
            })
          }
        >
          Confirmar hinchas
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
        {(["home", "away"] as const).map((side) => (
          <DieField
            key={side}
            label={`D6 clima ${nameOf(side)}`}
            rollLabel={`Tirar clima ${nameOf(side)}`}
            mode={weatherMode}
            value={weatherDice[side]}
            max={6}
            onManual={(raw) => setWeatherDie(side, raw)}
            onRoll={() =>
              setWeatherDice((prev) => ({ ...prev, [side]: dice.d6() }))
            }
          />
        ))}
        {weatherSum != null ? (
          <p className="text-sm font-semibold text-navy">
            2D6 = {weatherSum} · {weatherFromRoll(weatherSum).label}
          </p>
        ) : null}
        <button
          type="button"
          className={`${BUTTON} mt-2`}
          disabled={!weatherReady}
          onClick={() =>
            onCommit({
              step: "weather",
              weather: {
                roll: weatherSum!,
                value: weatherFromRoll(weatherSum!).kind,
              },
            })
          }
        >
          Confirmar clima
        </button>
      </StepGroup>

      <StepGroup
        label="Paso 3 · Incentivos"
        title="3 · Incentivos"
        done={snapshot.inducementsDone}
      >
        <p className="text-sm text-navy">
          Los entrenadores seleccionan los incentivos (caja menor / VAE).
        </p>
        {(["home", "away"] as const).map((side) => (
          <div
            key={side}
            role="group"
            aria-label={`Incentivos ${nameOf(side)}`}
            className="mt-2"
          >
            <p className="text-sm font-semibold text-navy">{nameOf(side)}</p>
            {listInducements().map((entry) => {
              const count =
                cart[side].find((item) => item.id === entry.id)?.count ?? 0;
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
                    onClick={() => bumpCart(side, entry.id, 1)}
                  >
                    +
                  </button>
                  <button
                    type="button"
                    aria-label={`Quitar ${entry.displayName}`}
                    className={BUTTON}
                    disabled={count <= 0}
                    onClick={() => bumpCart(side, entry.id, -1)}
                  >
                    −
                  </button>
                </div>
              );
            })}
          </div>
        ))}
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
              inducements: {
                home: cart.home.map((item) => ({ ...item })),
                away: cart.away.map((item) => ({ ...item })),
              },
            })
          }
        >
          Confirmar incentivos
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
        {(["home", "away"] as const).map((side) => (
          <DieField
            key={side}
            label={`D6 pateador ${nameOf(side)}`}
            rollLabel={`Tirar pateador ${nameOf(side)}`}
            mode={kickMode}
            value={kickDice[side]}
            max={6}
            onManual={(raw) => setKickDie(side, raw)}
            onRoll={() =>
              setKickDice((prev) => ({ ...prev, [side]: dice.d6() }))
            }
          />
        ))}
        {kickTie ? (
          <div className="mt-1 flex items-center gap-2">
            <p className="text-sm font-semibold text-navy">
              Empate: repetir tirada
            </p>
            <button
              type="button"
              className={BUTTON}
              onClick={() => {
                setKickDice({ home: null, away: null });
                setKickChoice(null);
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
        {kickBoth && !kickTie ? (
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
          disabled={kickChoice == null || kickTie || !kickBoth}
          onClick={() => onCommit({ step: "kicking", kicking: kickChoice! })}
        >
          Confirmar pateador
        </button>
      </StepGroup>

      <p className="mt-3 text-sm text-navy">
        Sustitutos: solo en liga — no aplica en esta demo
      </p>
    </section>
  );
}
