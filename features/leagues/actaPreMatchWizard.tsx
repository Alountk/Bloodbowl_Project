import { Fragment, useState, type ReactNode } from "react";

import { rollD3, rollD6, rollD16 } from "@/lib/random";
import {
  displayNameOf,
  fundsForSide,
  getInducement,
  getStarPlayer,
  INDUCEMENT_CATEGORIES,
  isEligible,
  listInducements,
  resolvePrayerRoll,
  STAR_MAX_PER_MATCH,
  standardCartCost,
  type InducementCartItem,
  type InducementEntry,
  type PersistedInducements,
  type RuleId,
  type SideFunds,
} from "@/lib/rules/inducements";
import { STAR_PLAYERS, type StarPlayer } from "@/lib/rules/starPlayers";
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
  /** T28 («Plegarias a Nuffle», L92): the per-side kept 1D16 prayer rolls
   *  (one per «Plegaria a Nuffle» bought). Optional — a pre-T28 snapshot
   *  carries none and renders exactly as before. */
  prayerRolls?: { home: number[]; away: number[] };
  /** Winner's decision: who kicks. */
  kicking: "home" | "away" | null;
}

export type PreMatchCommit =
  | { step: "fanRoll"; side: "home" | "away"; line: FanFactorLine }
  | { step: "weatherRoll"; side: "home" | "away"; die: number }
  | { step: "inducements"; side: "home" | "away"; items: InducementCartItem[] }
  | { step: "prayersRoll"; side: "home" | "away"; roll: number }
  | { step: "kickRoll"; side: "home" | "away"; die: number }
  | { step: "kickTie" }
  | { step: "kicking"; kicking: "home" | "away" };

/** One side's money facts for the §D inducement budget (S8 · U9). */
export interface PreMatchFinanceSide {
  /** Team value (VAE) in M.O. */
  value: number;
  /** Treasury in M.O. */
  treasury: number;
  /** Roster race id — IND-5 eligibility resolves against it. */
  raceId: string;
}

export interface PreMatchFinance {
  home: PreMatchFinanceSide;
  away: PreMatchFinanceSide;
}

export interface ActaPreMatchCaptureProps {
  homeName: string;
  awayName: string;
  /** Dedicated-fans attribute per side (the +N in the attendance roll). */
  homeBase: number;
  awayBase: number;
  /** Which coach is viewing: the capture shows ONLY this side. */
  viewerSide: "home" | "away";
  /** VAE + treasury + race per side (S8 §D money panel + IND-5 gates). */
  finance: PreMatchFinance;
  snapshot: ActaPreMatchSnapshot;
  onCommit: (commit: PreMatchCommit) => void;
  /** Injectable dice (auto roll); defaults to the real dice in lib/random.
   *  T29 (L95): the «Plegarias a Nuffle» reveal step is the ONE MANUAL roll of
   *  this part (the coach throws the real 1D16) — no die button rides here.
   *  T30 (L98): `d16` feeds ONLY the optional «Tirar automático» button that
   *  FILLS the manual input before «Aceptar» (manual stays the main path). */
  dice?: { d3: () => number; d6: () => number; d16?: () => number };
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
 * is no manual field (S7.2) — EXCEPT the T29 «Plegarias a Nuffle» reveal step
 * (L95): the prayer roll is the ONE manual entry of the sequence (the coach
 * throws the real dice, types the 1-16 result and «Aceptar» locks it; T30/L98
 * adds an optional «Tirar automático» that FILLS the input before «Aceptar» —
 * manual remains the main path);
 * after the LAST step the modal closes and
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

/** The four rulebook steps — plus the T28 reveal step, inserted right after
 *  Incentivos ONLY when the coach bought «Plegarias a Nuffle» (>0). */
const STEPS = [
  { name: "Los Hinchas", next: "Avanzar al Clima" },
  { name: "El Clima", next: "Avanzar a Incentivos" },
  { name: "Incentivos", next: "Avanzar al Equipo pateador" },
  { name: "Equipo pateador", next: "Finalizar" },
] as const;

const PRAYERS_STEP = {
  name: "Plegarias a Nuffle",
  next: "Avanzar al Equipo pateador",
} as const;

/** Step descriptions (byte-identical pinned copy; the reveal step is the
 *  only new line). */
const STEP_DESCRIPTIONS: Record<string, string> = {
  "Los Hinchas": "La afición ocasional: aficionados dedicados + 1D3.",
  "El Clima": "Cada entrenador lanza 1D6; la suma (2D6) resuelve el clima.",
  Incentivos: "Compra lo que necesites con el dinero disponible",
  [PRAYERS_STEP.name]:
    "Tira 1D16 a mano por cada Plegaria, anota el resultado y pulsa «Aceptar» para fijarlo; un resultado repetido se vuelve a tirar.",
  "Equipo pateador":
    "1D6 enfrentado; el ganador del sorteo decide quién recibe (empate: se repite).",
};

/* ─── T28/T30 · «Plegarias a Nuffle» reveal copy ─────────────────────────
 *
 * The reveal shows the blessing's VERBATIM name + effect (both live in the
 * model rows of `PRAYERS_OF_NUFFLE`, transcribed from the scanned rulebook
 * page 151 — T30, L98: FULL detail visible for every blessing). The engine
 * rows (10-13, the `id`-bearing ones) get the «+ SPP» chip; every other row
 * carries the honest note «Efecto en mesa (este motor no lo aplica)». A roll
 * outside 1-16 (junk data only — the input clamps) reveals NO name: an
 * honest manual fallback, never invented.
 */

/** One roll's short label — the blessing's verbatim name, or an honest note
 *  for junk values (never invented). */
function prayerLabel(roll: number): string {
  return resolvePrayerRoll(roll)?.label ?? `🎲${roll} sin modelar`;
}

/** T29 · the persisted rolls seed the MANUAL slots in order (hydration keeps
 *  accepted rolls LOCKED); the slots beyond stay empty = editable. */
function seededPrayerSlots(persisted?: {
  home: number[];
  away: number[];
}): { home: (number | null)[]; away: (number | null)[] } {
  return {
    home: [...(persisted?.home ?? [])],
    away: [...(persisted?.away ?? [])],
  };
}

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

/** T29/T30 · the MANUAL prayer card (L95/L98): the coach throws the real
 * 1D16 and enters its result in the 1-16 numeric control — the optional
 * «Tirar automático» button (T30, L98) sits BEFORE «Aceptar» and only FILLS
 * the input with a real 1D16 (injected rng); the coach can still edit it and
 * manual remains the main path. «Aceptar» commits and LOCKS the roll — the
 * input disappears into the revealed blessing («Bendición concedida» with
 * the VERBATIM name + full effect + the «+ SPP» chip on the engine rows, or
 * the honest «Efecto en mesa» note) and there is no path back to editing it.
 * The rulebook repeat rule is enforced at «Aceptar» time: a result already
 * ACCEPTED by this team warns «Resultado repetido…» and nothing commits;
 * equal values on unaccepted inputs are just edits. */
function PrayerManualCard({
  label,
  value,
  taken,
  d16,
  onAccept,
}: {
  label: string;
  value: number | null;
  taken: number[];
  /** Real 1D16 (lib/random, test-injectable) for «Tirar automático». */
  d16: () => number;
  onAccept: (roll: number) => void;
}) {
  const [draft, setDraft] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const accepted = value != null;
  const blessing = value != null ? resolvePrayerRoll(value) : null;
  const accept = () => {
    const roll = Number(draft);
    if (draft.trim() === "" || !Number.isInteger(roll) || roll < 1 || roll > 16) {
      setNotice("Introduce un número entero del 1 al 16.");
      return;
    }
    if (taken.includes(roll)) {
      setNotice("Resultado repetido: vuelve a tirar el 1D16 en mesa.");
      return;
    }
    setNotice(null);
    onAccept(roll);
  };
  return (
    <div
      role="group"
      aria-label={label}
      className="mt-3 border border-navy/15 bg-white px-4 py-3"
    >
      <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-navy">
        {label}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        {accepted ? (
          <span
            aria-hidden="true"
            data-testid="die-glyph"
            className="flex h-10 w-10 items-center justify-center border border-navy/30 bg-white font-display text-lg font-bold text-navy"
          >
            {value}
          </span>
        ) : (
          <>
            <input
              type="number"
              inputMode="numeric"
              min={1}
              max={16}
              step={1}
              aria-label={`Resultado del 1D16 · ${label}`}
              className="w-20 rounded-sm border border-navy/30 px-2 py-1.5 text-sm text-navy"
              value={draft}
              onChange={(event) => {
                setDraft(event.target.value);
                setNotice(null);
              }}
            />
            <button
              type="button"
              className={BTN}
              onClick={() => {
                // T30 (L98): auto option BEFORE «Aceptar» — fills the manual
                // input with a real 1D16; nothing locks until «Aceptar».
                setDraft(String(d16()));
                setNotice(null);
              }}
            >
              Tirar automático
            </button>
            <button type="button" className={BTN} onClick={accept}>
              Aceptar
            </button>
          </>
        )}
        <span
          role="status"
          className={`font-display text-xs font-bold uppercase tracking-wide ${
            accepted ? "text-red" : "text-ink/60"
          }`}
        >
          {accepted ? "Registrado" : "Pendiente"}
        </span>
      </div>
      {notice != null ? (
        <p role="alert" className="mt-2 text-sm text-red">
          {notice}
        </p>
      ) : null}
      {accepted ? (
        <div key={`reveal-${value}`} className="mt-2 border-l-2 border-red pl-3">
          {blessing != null ? (
            <>
              <div className="flex flex-wrap items-center gap-2">
                <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-red">
                  Bendición concedida
                </p>
                {blessing.id != null ? (
                  <span className="border border-red px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-red">
                    + SPP
                  </span>
                ) : null}
              </div>
              <p className="mt-1 font-display text-lg font-bold text-navy">
                {blessing.label}
              </p>
              <p className="text-sm text-ink">{blessing.effect}</p>
              {blessing.id == null ? (
                <p className="mt-1 text-xs text-ink/70">
                  Efecto en mesa (este motor no lo aplica)
                </p>
              ) : null}
            </>
          ) : (
            <p className="text-sm text-ink">
              🎲 {value} — Bendición no modelada; resolución manual en mesa.
            </p>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** S8 · IND-1/IND-5 ES special-rule labels, transcribed from the digest's
 * catalog parentheticals (docs/research/blood-bowl-2025-match.md:526-537,
 * «solo para equipos con la regla especial …») — never invented here. */
const RULE_LABELS: Partial<Record<RuleId, string>> = {
  "bribery-and-corruption": "Sobornos y corrupción",
  "low-cost-linemen": "Líneas prescindibles",
  "favoured-of-nurgle": "Elegidos de Nurgle",
  "masters-of-undeath": "Señores de los No Muertos",
};

/** The «No elegible» reason line: «requiere {regla oficial}» when the digest
 * names the gate, else a plain team-scoped fallback (no invented names). */
function eligibilityReason(entry: InducementEntry): string {
  const label = entry.eligibility ? RULE_LABELS[entry.eligibility] : undefined;
  return label != null
    ? `No elegible: requiere ${label}`
    : "No elegible para este equipo";
}

/** Design A′ section bar: `NN · TITLE` navy header + right chip. */
function SectionHeader({
  num,
  title,
  chip,
}: {
  num: string;
  title: string;
  chip: string;
}) {
  return (
    <div className="flex items-center justify-between gap-2 bg-navy px-3 py-2 text-white">
      <p className="font-display text-xs font-bold uppercase tracking-wide">
        {num} · {title}
      </p>
      <span className="bg-white/15 px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide">
        {chip}
      </span>
    </div>
  );
}

/** S8 · the §D money panel (design A′): disponible/gastado/restante + the
 * petty-cash desglose for the lower-VAE side («Presupuesto de Caja Menor»). */
function MoneyPanel({
  funds,
  spent,
  rivalPending,
}: {
  funds: SideFunds;
  spent: number;
  /** The rival has NOT confirmed their inducement spend yet. */
  rivalPending: boolean;
}) {
  return (
    <div
      role="group"
      aria-label="Dinero disponible"
      className="border border-navy/15 bg-white px-4 py-3"
    >
      <p className="font-display text-xs font-bold uppercase tracking-[0.16em] text-navy">
        DISPONIBLE TOTAL
      </p>
      <p className="font-display text-2xl font-bold text-navy">
        {formatMo(funds.potencial)} M.O.
      </p>
      <p className="text-xs text-ink/70">
        {funds.kind === "menor"
          ? "Presupuesto de Caja Menor"
          : funds.kind === "mayor"
            ? "De tu Tesorería"
            : "VE igual — sin caja menor"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <p className="border border-red/40 px-3 py-1.5 font-display text-sm font-bold text-red">
          Gastado {formatMo(spent)} M.O.
        </p>
        <p className="border border-success/40 px-3 py-1.5 font-display text-sm font-bold text-success-strong">
          Restante {formatMo(funds.restante)} M.O.
        </p>
      </div>
      {funds.kind === "menor" ? (
        <div className="mt-2 border-t border-navy/10 pt-2 text-xs text-ink">
          <p>ΔVE (Diferencial): +{formatMo(funds.delta)}</p>
          <p>
            + Gasto rival en Tesorería: +{formatMo(funds.rivalSpend)}
            {rivalPending ? " · pendiente" : ""}
          </p>
          <p>
            = Efectivo en Caja Menor: {formatMo(funds.delta + funds.rivalSpend)}
          </p>
          <p>
            + Aportación de tu Tesorería: +{formatMo(funds.treasuryUsed)} (máx.
            50.000)
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** S8 · a Season-3 Star Player card (L25: stats + skills visible BEFORE the
 * hire) — «Fichar»/«Quitar» over the shared 0-2 per-match cap. */
function StarPlayerCard({
  star,
  inCart,
  disabled,
  onAdd,
  onRemove,
}: {
  star: StarPlayer;
  inCart: boolean;
  disabled: boolean;
  onAdd: () => void;
  onRemove: () => void;
}) {
  return (
    <div
      role="group"
      aria-label={star.displayName}
      className="border border-navy/15 bg-white px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <p className="font-display text-sm font-bold text-navy">
          {star.displayName}
          {inCart ? (
            <span className="font-display font-bold text-red"> ×1</span>
          ) : null}
        </p>
        <span className="font-display text-sm font-bold text-navy">
          {formatMo(star.costGp)} M.O.
        </span>
      </div>
      <p className="mt-0.5 text-xs text-ink/70">{star.position}</p>
      <table
        aria-label={`Estadísticas de ${star.displayName}`}
        className="mt-2 w-full border-collapse text-left text-xs text-ink"
      >
        <thead>
          <tr className="border-b border-navy/20 font-display uppercase tracking-wide text-navy">
            <th scope="col" className="py-1 pr-2 font-bold">MA</th>
            <th scope="col" className="py-1 pr-2 font-bold">ST</th>
            <th scope="col" className="py-1 pr-2 font-bold">AG</th>
            <th scope="col" className="py-1 pr-2 font-bold">PA</th>
            <th scope="col" className="py-1 font-bold">AV</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td className="py-1 pr-2">{star.stats.ma}</td>
            <td className="py-1 pr-2">{star.stats.st}</td>
            <td className="py-1 pr-2">{star.stats.ag}</td>
            <td className="py-1 pr-2">{star.stats.pa}</td>
            <td className="py-1">{star.stats.av}</td>
          </tr>
        </tbody>
      </table>
      <div className="mt-2 flex flex-wrap gap-1">
        {star.skills.map((skill) => (
          <span
            key={skill}
            className="rounded-sm border border-navy/30 px-2 py-0.5 text-xs text-navy"
          >
            {skill}
          </span>
        ))}
      </div>
      <div className="mt-2 border-l-2 border-red pl-2">
        <p className="font-display text-xs font-bold uppercase tracking-wide text-red">
          {star.special.name}
        </p>
        <p className="text-xs italic text-ink">{star.special.text}</p>
      </div>
      <p className="mt-2 text-xs text-ink">
        Juega por: {star.playsFor.join(" · ")}
      </p>
      <button
        type="button"
        aria-label={`Fichar ${star.displayName}`}
        className={`${PRIMARY} mt-2 w-full`}
        disabled={disabled}
        onClick={onAdd}
      >
        Fichar {star.displayName}
      </button>
      {inCart ? (
        <button
          type="button"
          aria-label={`Quitar ${star.displayName}`}
          className={`${BTN} mt-2 w-full`}
          onClick={onRemove}
        >
          Quitar {star.displayName}
        </button>
      ) : null}
    </div>
  );
}

export function ActaPreMatchWizard({
  homeName,
  awayName,
  homeBase,
  awayBase,
  viewerSide,
  finance,
  snapshot,
  onCommit,
  dice = { d3: rollD3, d6: rollD6 },
  open,
  onDismiss,
  onFinish,
}: ActaPreMatchWizardProps) {
  const rivalSide: Side = viewerSide === "home" ? "away" : "home";
  // Step 4 (the toss) is done for MY side once my die is in and no shared
  // tie re-roll is pending — who receives is decided AFTER the wizard (S7.9).
  const myKickDie = snapshot.kickDice[viewerSide];
  const tiePending =
    myKickDie != null &&
    snapshot.kickDice[rivalSide] != null &&
    myKickDie === snapshot.kickDice[rivalSide];
  const [cart, setCart] = useState<PersistedInducements>(() => ({
    home: snapshot.inducements.home.map((item) => ({ ...item })),
    away: snapshot.inducements.away.map((item) => ({ ...item })),
  }));
  // T28: the reveal step exists ONLY when this coach bought prayers (>0).
  const prayerCount =
    cart[viewerSide].find((item) => item.id === "prayers-to-nuffle")?.count ??
    0;
  const steps =
    prayerCount > 0
      ? [
          STEPS[0],
          STEPS[1],
          { ...STEPS[2], next: `Avanzar a ${PRAYERS_STEP.name}` },
          PRAYERS_STEP,
          STEPS[3],
        ]
      : [...STEPS];
  // T29 (L95): the MANUAL 1D16 results — ONE slot per prayer bought, kept per
  // side. A non-null slot is ACCEPTED (locked — persisted through the
  // «prayersRoll» commit); an empty slot still holds its editable input. The
  // slots seed from the persisted rolls on mount/open (hydration renders
  // accepted rolls LOCKED there too); the count is defensive (foreign saves
  // may carry more rolls than the current cart).
  const [prayerResults, setPrayerResults] = useState<{
    home: (number | null)[];
    away: (number | null)[];
  }>(() => seededPrayerSlots(snapshot.prayerRolls));
  const acceptedRolls = prayerResults[viewerSide].filter(
    (roll): roll is number => roll != null,
  );
  const prayerSlots = Math.max(prayerCount, acceptedRolls.length);
  const prayersDone = acceptedRolls.length >= prayerSlots;
  const stepDone = [
    snapshot.fans[viewerSide] != null,
    snapshot.weather != null,
    snapshot.inducementsDone[viewerSide],
    ...(prayerCount > 0 ? [prayersDone] : []),
    myKickDie != null && !tiePending,
  ];
  const pendingIndex = stepDone.findIndex((done) => !done);
  const firstPending = pendingIndex === -1 ? steps.length - 1 : pendingIndex;

  const [lastOpen, setLastOpen] = useState(open);
  const [stepIndex, setStepIndex] = useState(firstPending);
  const [fanRecorded, setFanRecorded] = useState<number | null>(null);
  const [weatherRecorded, setWeatherRecorded] = useState<number | null>(null);
  const [kickRecorded, setKickRecorded] = useState<number | null>(null);

  const nameOf = (side: Side) => (side === "home" ? homeName : awayName);
  const baseOf = (side: Side) => (side === "home" ? homeBase : awayBase);

  // Reopen at the first step still pending for my side (render-phase state
  // adjustment: runs once per open transition, never mid-flow).
  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) {
      setStepIndex(firstPending);
      setFanRecorded(null);
      setWeatherRecorded(null);
      setKickRecorded(null);
      setPrayerResults(seededPrayerSlots(snapshot.prayerRolls));
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

  // S8 · §D money (U9): the rival's treasury spend counts ONLY once their
  // cart is confirmed; mine is the live wizard cart. fundsForSide receives
  // plain {value, treasury} — raceId stays UI-side (IND-5 gates).
  const sideRaceId = finance[viewerSide].raceId;
  const rivalSpend = snapshot.inducementsDone[rivalSide]
    ? standardCartCost(snapshot.inducements[rivalSide])
    : 0;
  const spent = standardCartCost(cart[viewerSide]);
  const funds = fundsForSide({
    own: {
      value: finance[viewerSide].value,
      treasury: finance[viewerSide].treasury,
    },
    rival: {
      value: finance[rivalSide].value,
      treasury: finance[rivalSide].treasury,
    },
    rivalSpend,
    ownSpend: spent,
  });
  /** Committed cart cost per side (the mayor-VE chip's «Gastado»). */
  const committedOf = (side: Side): number =>
    side === viewerSide
      ? standardCartCost(cart[side])
      : snapshot.inducementsDone[side]
        ? standardCartCost(snapshot.inducements[side])
        : 0;
  const mayorSide: Side | null =
    finance.home.value === finance.away.value
      ? null
      : finance.home.value > finance.away.value
        ? "home"
        : "away";
  const totalStars = cart[viewerSide].reduce(
    (total, item) => (getStarPlayer(item.id) ? total + item.count : total),
    0,
  );

  const bumpCart = (id: string, delta: number) => {
    const star = getStarPlayer(id);
    const max = star
      ? 1
      : listInducements().find((entry) => entry.id === id)?.max ?? 1;
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
      if (delta > 0) {
        // S8/U9 · §D: the pot is HARD — never commit beyond potencial.
        if (standardCartCost(items) > funds.potencial) return prev;
        // IND-1: «0-2 Jugadores Estrella» per match (max 1 each, above).
        if (star) {
          const totalStars = items.reduce(
            (total, item) =>
              getStarPlayer(item.id) ? total + item.count : total,
            0,
          );
          if (totalStars > STAR_MAX_PER_MATCH) return prev;
        }
      }
      return { ...prev, [viewerSide]: items };
    });
  };

  // S7 rules: a roll is entered ONCE (the die locks), and the forward button
  // only unlocks when this step's marks are in — the kick step needs my die
  // and a resolved toss; who receives is decided AFTER the wizard (S7.9).
  // T28/T29: the reveal step needs every bought prayer's accepted roll.
  const recordedFan = fanRecorded != null || snapshot.fans[viewerSide] != null;
  const recordedWeather =
    weatherRecorded != null || snapshot.weatherDice[viewerSide] != null;
  const recordedKick =
    kickRecorded != null || snapshot.kickDice[viewerSide] != null;
  const step = steps[stepIndex];
  const canAdvance =
    step.name === "Los Hinchas"
      ? recordedFan
      : step.name === "El Clima"
        ? recordedWeather
        : step.name === "Incentivos"
          ? true
          : step.name === PRAYERS_STEP.name
            ? prayersDone
            : recordedKick && !kickTie;

  const advance = () => {
    if (!canAdvance) return;
    if (step.name === "Incentivos") {
      onCommit({
        step: "inducements",
        side: viewerSide,
        items: cart[viewerSide].map((item) => ({ ...item })),
      });
    }
    if (stepIndex === steps.length - 1) {
      onFinish();
      return;
    }
    setStepIndex((index) => Math.min(steps.length - 1, index + 1));
  };

  if (!open) return null;

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
          {steps.map((entry, index) => (
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
              Paso {stepIndex + 1} de {steps.length}
            </p>
            <h3 className="font-display text-lg font-bold text-navy">
              {step.name}
            </h3>
            <p className="text-sm text-ink">{STEP_DESCRIPTIONS[step.name]}</p>
          </div>

          {step.name === "Los Hinchas" ? (
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

          {step.name === "El Clima" ? (
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

          {step.name === "Incentivos" ? (
            <>
              <div
                role="group"
                aria-label={`Incentivos ${nameOf(viewerSide)}`}
                className="mt-3"
              >
                {/* S8 · §D money panel (design A′): disponible/gastado/
                    restante + petty-cash desglose — replaces the old one-liner. */}
                <MoneyPanel
                  funds={funds}
                  spent={spent}
                  rivalPending={!snapshot.inducementsDone[rivalSide]}
                />
                {funds.kind === "menor" ? (
                  <p className="mt-2 text-xs text-ink">
                    Lo que no gaste se pierde. Si el VE es igual, ninguno gasta
                    de su Tesorería.
                  </p>
                ) : funds.kind === "empate" ? (
                  <p className="mt-2 text-xs text-ink">
                    Si el VE es igual, ninguno gasta de su Tesorería.
                  </p>
                ) : null}
                {/* Team chips: LOCAL/VISITANTE + TU EQUIPO + VE comparison. */}
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                  {(["home", "away"] as const).map((side) => (
                    <div
                      key={side}
                      className="border border-navy/15 bg-white px-3 py-2"
                    >
                      <p className="flex flex-wrap items-center gap-1">
                        <span className="bg-navy px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white">
                          {side === "home" ? "LOCAL" : "VISITANTE"}
                        </span>
                        {side === viewerSide ? (
                          <span className="bg-red px-1.5 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white">
                            TU EQUIPO
                          </span>
                        ) : null}
                        <span className="font-display text-sm font-bold text-navy">
                          {nameOf(side)}
                        </span>
                      </p>
                      <p className="mt-1 text-xs text-ink">
                        VE {formatMo(finance[side].value)}
                        {mayorSide === side
                          ? " (mayor VE)"
                          : mayorSide != null
                            ? " (menor VE)"
                            : ""}
                      </p>
                      {mayorSide === side ? (
                        <p className="mt-1 text-xs text-ink/70">
                          Tesorería {formatMo(finance[side].treasury)} M.O. ·
                          Gastado {formatMo(committedOf(side))} M.O. ·
                          Disponible{" "}
                          {formatMo(
                            Math.max(
                              0,
                              finance[side].treasury - committedOf(side),
                            ),
                          )}{" "}
                          M.O.
                        </p>
                      ) : null}
                    </div>
                  ))}
                </div>
                {cart[viewerSide].length > 0 ? (
                  <p className="mt-3 text-sm text-ink">
                    {`Carrito actual (${cart[viewerSide].reduce(
                      (total, item) => total + item.count,
                      0,
                    )} artículos): ${cart[viewerSide]
                      .map((item) => `${displayNameOf(item.id)} ×${item.count}`)
                      .join(" · ")} = ${formatMo(
                      standardCartCost(cart[viewerSide]),
                    )} M.O.`}
                  </p>
                ) : null}
                {/* Design A′: 01-04 by section, then 05 · Star Players and
                    06 · Plantilla (mercenaries ONLY — L25 taxonomy). */}
                {INDUCEMENT_CATEGORIES.map((category) =>
                  category.id === "plantilla" ? (
                    <Fragment key={category.id}>
                      <div
                        role="group"
                        aria-label="05 · Star Players"
                        className="mt-4"
                      >
                        <SectionHeader
                          num="05"
                          title="STAR PLAYERS"
                          chip="MÁX. 2"
                        />
                        <p className="px-3 py-1 text-xs text-ink/70">
                          Jugadores Estrella · 0-2 por partido
                        </p>
                        {STAR_PLAYERS.map((star) => {
                          const inCart = cart[viewerSide].some(
                            (item) => item.id === star.id && item.count > 0,
                          );
                          return (
                            <StarPlayerCard
                              key={star.id}
                              star={star}
                              inCart={inCart}
                              disabled={
                                inCart ||
                                totalStars >= STAR_MAX_PER_MATCH ||
                                star.costGp > funds.restante
                              }
                              onAdd={() => bumpCart(star.id, 1)}
                              onRemove={() => bumpCart(star.id, -1)}
                            />
                          );
                        })}
                        <p className="px-3 py-2 text-xs text-ink/70">
                          Datos oficiales Blood Bowl Season 3 · máx. 2 por
                          partido
                        </p>
                      </div>
                      {/* The reserved dynamic-cost entry: NOT purchasable. */}
                      <div
                        role="group"
                        aria-label={`${category.num} · ${category.title}`}
                        className="mt-4"
                      >
                        <SectionHeader
                          num={category.num}
                          title={category.title}
                          chip={category.optionsLabel ?? "0-3 permitidos"}
                        />
                        <div className="flex flex-wrap items-center gap-3 border border-navy/15 bg-white px-4 py-2 opacity-50">
                          <span className="flex-1 text-sm text-ink">
                            Mercenarios de Alquiler
                          </span>
                          <span className="text-xs text-ink/60">
                            0-3 permitidos
                          </span>
                          <span className="bg-red px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white">
                            EN DESARROLLO
                          </span>
                          <span className="w-full text-xs text-ink/70">
                            Precio dinámico · no disponible todavía
                          </span>
                        </div>
                      </div>
                    </Fragment>
                  ) : (
                    <div
                      key={category.id}
                      role="group"
                      aria-label={`${category.num} · ${category.title}`}
                      className="mt-4"
                    >
                      <SectionHeader
                        num={category.num}
                        title={category.title}
                        chip={
                          category.optionsLabel ??
                          `${
                            listInducements().filter(
                              (entry) => entry.category === category.id,
                            ).length
                          } OPCIONES`
                        }
                      />
                      <div className="border border-navy/15 bg-white">
                        {listInducements()
                          .filter((entry) => entry.category === category.id)
                          .map((entry) => {
                            const count =
                              cart[viewerSide].find(
                                (item) => item.id === entry.id,
                              )?.count ?? 0;
                            const eligible = isEligible(entry, sideRaceId);
                            return (
                              <div
                                key={entry.id}
                                className={`flex flex-wrap items-center gap-3 border-b border-navy/10 px-4 py-2 last:border-b-0${
                                  eligible ? "" : " opacity-50"
                                }`}
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
                                {!eligible ? (
                                  <span className="bg-red px-2 py-0.5 font-display text-[10px] font-bold uppercase tracking-wide text-white">
                                    No elegible
                                  </span>
                                ) : null}
                                <button
                                  type="button"
                                  aria-label={`Añadir ${entry.displayName}`}
                                  className={BTN}
                                  disabled={
                                    count >= entry.max ||
                                    entry.price > funds.restante ||
                                    !eligible
                                  }
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
                                {!eligible ? (
                                  <span className="w-full text-xs text-red">
                                    {eligibilityReason(entry)}
                                  </span>
                                ) : null}
                              </div>
                            );
                          })}
                      </div>
                    </div>
                  ),
                )}
              </div>
              {snapshot.inducementsDone[rivalSide] ? (
                <p className="mt-2 text-sm text-ink">
                  Incentivos rival · {nameOf(rivalSide)}:{" "}
                  {snapshot.inducements[rivalSide].length === 0
                    ? "Ninguno"
                    : snapshot.inducements[rivalSide]
                        .map(
                          (item) =>
                            `${displayNameOf(item.id)} ×${item.count}`,
                        )
                        .join(", ")}{" "}
                  · Confirmado
                </p>
              ) : null}
            </>
          ) : null}

          {step.name === PRAYERS_STEP.name ? (
            <div
              role="group"
              aria-label={`Plegarias a Nuffle ${nameOf(viewerSide)}`}
              className="mt-3"
            >
              {Array.from({ length: prayerSlots }, (_, index) => (
                <PrayerManualCard
                  key={index}
                  label={`Plegaria ${index + 1} de ${prayerSlots} · ${nameOf(
                    viewerSide,
                  )}`}
                  value={prayerResults[viewerSide][index] ?? null}
                  taken={acceptedRolls}
                  d16={dice.d16 ?? rollD16}
                  onAccept={(roll) => {
                    // T29: «Aceptar» commits and LOCKS the slot — the card
                    // already screened validation + duplicates and the
                    // reducer re-checks them as defense in depth.
                    setPrayerResults((prev) => {
                      const rolls = [...prev[viewerSide]];
                      rolls[index] = roll;
                      return { ...prev, [viewerSide]: rolls };
                    });
                    onCommit({
                      step: "prayersRoll",
                      side: viewerSide,
                      roll,
                    });
                  }}
                />
              ))}
            </div>
          ) : null}

          {step.name === "Equipo pateador" ? (
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

          {step.name === "Equipo pateador" && kickTie ? (
            <button
              type="button"
              className={`${BTN} mt-3`}
              onClick={() => {
                setKickRecorded(null);
                onCommit({ step: "kickTie" });
              }}
            >
              Repetir tirada
            </button>
          ) : null}

          {step.name === "Equipo pateador" && snapshot.kicking != null ? (
            <p className="mt-3 text-sm font-semibold text-navy">
              Sorteo resuelto — quién recibe se decide fuera del wizard
            </p>
          ) : null}
        </section>

        <p className="border-t border-navy/10 px-5 py-2 text-xs text-ink">
          Sustitutos: solo en liga — no aplica en esta demo
        </p>

        {/* S7: forward-only — once a step is behind you, there is no way back. */}
        <footer className="flex items-center justify-between gap-3 border-t border-navy/15 px-5 py-4">
          <p className="flex-1 text-center text-xs text-ink">
            {step.name === "Incentivos"
              ? `Paso ${stepIndex + 1} de ${
                  steps.length
                } · Gastado ${formatMo(spent)} M.O. · Disponible ${formatMo(
                  funds.restante,
                )} M.O.`
              : `Paso ${stepIndex + 1} de ${steps.length}`}
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
            .map((item) => `${displayNameOf(item.id)} ×${item.count}`)
            .join(", ");
    lines.push(
      <p key={`ind-${side}`} className="text-sm text-navy">
        Incentivos — {nameOf(side)}: {joined}
      </p>,
    );
  }
  // T28: the granted blessings (only when a side rolled — never a phantom
  // line without prayers).
  for (const side of ["home", "away"] as const) {
    const rolls = snapshot.prayerRolls?.[side] ?? [];
    if (rolls.length === 0) continue;
    lines.push(
      <p key={`prayers-${side}`} className="text-sm text-navy">
        Plegarias — {nameOf(side)}: {rolls.map(prayerLabel).join(", ")}
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
        Sorteo: empate 🎲{snapshot.kickDice.home} — repetir tirada
      </p>,
    );
  } else if (kickWinner != null) {
    lines.push(
      <p key="kick" className="text-sm text-navy">
        Sorteo: 🎲{snapshot.kickDice.home} vs 🎲{snapshot.kickDice.away} — gana{" "}
        {nameOf(kickWinner)}
      </p>,
    );
  }
  if (snapshot.kicking != null) {
    lines.push(
      <p key="kicking" className="text-sm text-navy">
        Recibe: {nameOf(snapshot.kicking === "home" ? "away" : "home")}
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
      // Star lines render by name with their fixed price (S8/U9).
      const price =
        getStarPlayer(item.id)?.costGp ?? getInducement(item.id)?.price;
      return price == null
        ? `${displayNameOf(item.id)} ×${item.count}`
        : `${displayNameOf(item.id)} ×${item.count} — ${formatMo(price)} M.O.`;
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
  // T28: the «Plegarias» phase row renders ONLY when some side rolled —
  // without prayers the grouped display stays byte-identical.
  const prayerCells = (side: Side) => {
    const rolls = snapshot.prayerRolls?.[side] ?? [];
    return rolls.length === 0 ? ["—"] : rolls.map(prayerLabel);
  };
  const anyPrayers = (["home", "away"] as const).some(
    (side) => (snapshot.prayerRolls?.[side] ?? []).length > 0,
  );
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
          {anyPrayers ? (
            <tr className="border-b border-navy/10">
              <th
                scope="row"
                className="py-1 pr-2 font-display font-bold text-navy"
              >
                Plegarias
              </th>
              <td className="py-1 pr-2">
                {prayerCells("home").map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </td>
              <td className="py-1">
                {prayerCells("away").map((line) => (
                  <p key={line}>{line}</p>
                ))}
              </td>
            </tr>
          ) : null}
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
          Recibe: {nameOf(snapshot.kicking === "home" ? "away" : "home")}
        </p>
      ) : null}
    </div>
  );
}

/**
 * S7.9 — the POST-sequence receiver decision: only the toss WINNER gets it,
 * rendered as RADIO inputs styled like the wizard's buttons (real inputs,
 * button look — «input checkbox con diseño como si fuera un botón», in
 * radio flavor because the choice is single). «Aceptar» records who KICKS:
 * the rival of the selected receiver.
 */
export function ActaReceiverPicker({
  homeName,
  awayName,
  onCommit,
}: {
  homeName: string;
  awayName: string;
  onCommit: ActaPreMatchCaptureProps["onCommit"];
}) {
  const [receiver, setReceiver] = useState<Side | null>(null);
  const nameOf = (side: Side) => (side === "home" ? homeName : awayName);
  return (
    <div
      role="group"
      aria-label="¿Quién recibe el balón?"
      className="mt-3 border border-red/40 px-4 py-4"
    >
      <p className="font-display text-sm font-bold uppercase tracking-[0.16em] text-red">
        ¿Quién recibe el balón?
      </p>
      <p className="mt-1 text-xs text-ink">
        Ganaste el sorteo: elige el equipo que recibe el balón.
      </p>
      <div className="mt-3 flex flex-wrap gap-2">
        {(["home", "away"] as const).map((side) => (
          <label
            key={side}
            className={`cursor-pointer rounded-sm border px-3 py-1.5 font-display text-xs font-bold uppercase tracking-wide has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-red ${
              receiver === side
                ? "border-navy bg-navy text-white hover:bg-navy"
                : "border-navy/30 text-navy hover:bg-fill-hover"
            }`}
          >
            <input
              type="radio"
              name="bb-receiver"
              className="sr-only"
              checked={receiver === side}
              onChange={() => setReceiver(side)}
            />
            Recibe {nameOf(side)}
          </label>
        ))}
      </div>
      <button
        type="button"
        className={`${PRIMARY} mt-3`}
        disabled={receiver == null}
        onClick={() => {
          if (receiver == null) return;
          onCommit({
            step: "kicking",
            kicking: receiver === "home" ? "away" : "home",
          });
        }}
      >
        Aceptar
      </button>
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
 *   Plus S7.9: while the toss winner has not picked who receives, the winner
 *   gets the receiver picker and the loser a waiting line (the pick gates
 *   the MATCH via `preMatchComplete`).
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
        <>
          {/* S7.9 — after the sequence, the toss WINNER picks who receives. */}
          {kickWinner != null && snapshot.kicking == null ? (
            kickWinner === viewerSide ? (
              <ActaReceiverPicker
                homeName={props.homeName}
                awayName={props.awayName}
                onCommit={props.onCommit}
              />
            ) : (
              <p
                role="status"
                className="mt-3 border border-navy/20 px-4 py-3 text-sm text-navy"
              >
                Esperando a que {nameOf(kickWinner)} decida quién recibe el
                balón.
              </p>
            )
          ) : null}
          <ActaPreMatchSummary
            homeName={props.homeName}
            awayName={props.awayName}
            snapshot={snapshot}
          />
        </>
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
