/**
 * BB2025 Season-3 «TABLA DE EVENTOS DE PATADA INICIAL» (S3 · T4).
 *
 * Transcribed VERBATIM in Spanish from the rulebook digest
 * (docs/research/blood-bowl-2025-match.md:355-368, PDF page 53 / printed page
 * 48): the kicking coach rolls 2D6 right after the kick scatters and consults
 * this table — 11 faces, sums 2-12. Names and effects keep the rulebook
 * wording exactly; the intro and the two closing quotes are exported for the
 * UI footnote («TODO LO QUE SUBE, BAJA» — the ball lands AFTER the event —
 * and «RECEPCIÓN LIBRE» — out-of-bounds landing).
 *
 * `resolution` is the v1 demo matrix (task log L29): `opposed` follow-ups are
 * fully rolled in the demo (6, 7, 11, 12), event 8 reuses the existing
 * weather machinery, and the player-selection effects (4, 5, 9, 10 and the
 * player picks of 11/12) render as «aplicación manual» rows — the demo has no
 * pitch, same bucket as deployment/scatter.
 */

export interface KickoffEvent {
  /** The 2D6 sum this face answers to (2-12). */
  sum: number;
  /** Stable kebab-case id (payloads/state reference events by id). */
  id: string;
  /** The verbatim rulebook face name (Spanish). */
  name: string;
  /** The verbatim rulebook effect text (Spanish). */
  effect: string;
  /** How the demo resolves the follow-up (v1 matrix, L29). */
  resolution: "opposed" | "weather" | "manual";
}

export const KICKOFF_EVENTS: readonly KickoffEvent[] = [
  {
    sum: 2,
    id: "arbitro-intimidado",
    name: "ÁRBITRO INTIMIDADO",
    effect:
      "Cada equipo recibe un Incentivo de Soborno gratuito. Este Incentivo debe usarse antes del final del partido o se pierde.",
    resolution: "manual",
  },
  {
    sum: 3,
    id: "tiempo-muerto",
    name: "TIEMPO MUERTO",
    effect:
      "Si la ficha de turno del equipo pateador está en el turno 6, 7 u 8 de esa parte, ambos equipos mueven su ficha de turno un espacio hacia atrás. Si no es así, ambos equipos mueven su ficha de turno un espacio hacia delante.",
    resolution: "manual",
  },
  {
    sum: 4,
    id: "defensa-solida",
    name: "DEFENSA SÓLIDA",
    effect:
      "El Entrenador del equipo pateador elige hasta 1D3+3 jugadores Desmarcados de su equipo. Dichos jugadores son retirados del campo y desplegados de nuevo siguiendo todas las restricciones normales de despliegue.",
    resolution: "manual",
  },
  {
    sum: 5,
    id: "patada-alta",
    name: "PATADA ALTA",
    effect:
      "Un jugador Desmarcado del equipo receptor puede ser colocado inmediatamente en la casilla en la que va a caer el balón.",
    resolution: "manual",
  },
  {
    sum: 6,
    id: "hinchas-animan",
    name: "LOS HINCHAS ANIMAN",
    effect:
      "Cada Entrenador tira 1D6 y le suma el número de Animadoras de su Hoja de plantilla. La primera acción de Placaje realizada en el siguiente turno del Entrenador que haya sacado un total más alto en esta tirada recibe un apoyo ofensivo adicional. Si la tirada ha sido un empate, ambos Entrenadores reciben este beneficio durante su siguiente turno.",
    resolution: "opposed",
  },
  {
    sum: 7,
    id: "entrenador-brillante",
    name: "ENTRENADOR BRILLANTE",
    effect:
      "Cada Entrenador tira 1D6 y le suma el número de Ayudantes del Entrenador de su Hoja de plantilla. El Entrenador que haya sacado un total más alto en esta tirada, o ambos Entrenadores en caso de empate, obtiene una Segunda oportunidad gratuita para la entrada que va a jugarse. Si esta Segunda oportunidad no se usa antes del final de esa entrada, se pierde.",
    resolution: "opposed",
  },
  {
    sum: 8,
    id: "clima-cambiante",
    name: "CLIMA CAMBIANTE",
    effect:
      'Haz inmediatamente una nueva tirada en la tabla de Clima. Si el nuevo resultado es "Clima perfecto", el balón se escora (3) antes de caer al suelo.',
    resolution: "weather",
  },
  {
    sum: 9,
    id: "anticipacion",
    name: "ANTICIPACIÓN",
    effect:
      "El Entrenador del equipo receptor elige hasta 1D3+3 jugadores Desmarcados de su equipo. Dichos jugadores pueden moverse inmediatamente una casilla en cualquier dirección, incluso entrando en la mitad contraria del campo.",
    resolution: "manual",
  },
  {
    sum: 10,
    id: "a-la-carga",
    name: "¡A LA CARGA!",
    effect:
      "El Entrenador del equipo pateador elige hasta 1D3+3 jugadores Desmarcados de su equipo. Dichos jugadores se pueden activar uno tras otro, como si fuera el turno de su equipo, y realizar una acción de Movimiento gratuita. Uno de ellos puede realizar en su lugar una acción de Penetración gratuita, otro puede realizar en su lugar una acción de Lanzar compañero gratuita, y otro puede realizar en su lugar una acción de Patear compañero gratuita. Si uno de los jugadores elegidos se Cae o es Derribado durante su activación, ya no se pueden activar más jugadores y la Carga termina.",
    resolution: "manual",
  },
  {
    sum: 11,
    id: "indigestion",
    name: "INDIGESTIÓN",
    effect:
      "Ambos Entrenadores tiran 1D6. El Entrenador con el total más bajo, o ambos en caso de empate, determina al azar a uno de sus jugadores sobre el campo y tira 1D6. Con 2+, el aperitivo que ha tomado el jugador antes de la entrada no le ha sentado bien, por lo que, mientras dure esa entrada, dicho jugador reduce en 1 su MV y su AR. Con un 1, el aperitivo le ha provocado una evacuación forzosa: coloca al jugador en la zona de Reserva de su equipo, ¡para reflejar que se pasa el resto de la entrada encerrado en la letrina!",
    resolution: "opposed",
  },
  {
    sum: 12,
    id: "invasion-de-campo",
    name: "INVASIÓN DE CAMPO",
    effect:
      "Cada Entrenador tira 1D6 y le suma su Factor de Hinchas. El Entrenador que saque un total más bajo, o ambos Entrenadores en caso de empate, selecciona al azar 1D3 jugadores de su equipo que están sobre el campo. Dichos jugadores son colocados Tumbados boca arriba y quedan Aturdidos.",
    resolution: "opposed",
  },
];

/**
 * Resolve a 2D6 pair to its table face (order-independent). The demo dice
 * wrapper (`lib/random` `rollD6`) always yields 1-6, so the sum always lands
 * on a face; an out-of-table sum is a programming error and throws.
 */
export function kickoffEventFor(d1: number, d2: number): KickoffEvent {
  const sum = d1 + d2;
  const event = KICKOFF_EVENTS.find((entry) => entry.sum === sum);
  if (event == null) {
    throw new RangeError(`kickoffEventFor: no event for 2D6 sum ${sum}`);
  }
  return event;
}

/** Which side the opposed follow-up lands on ("home" | "away"). */
export type KickoffDuelSide = "home" | "away";

export interface KickoffDuelOutcome {
  /** The side(s) the event applies to (winners on 6/7, hit on 11/12). */
  affected: KickoffDuelSide[];
  /** True when both dice tied (per the event text: BOTH coaches). */
  tie: boolean;
}

/**
 * The opposed follow-up outcome (6/7/11/12) per each event's own text:
 * 6 and 7 favour the HIGHEST total («o ambos Entrenadores en caso de
 * empate»), 11 and 12 hit the LOWEST total («o ambos en caso de empate»).
 * Manual/weather faces have no duel to resolve (empty affected). The 1D6 +
 * Animadoras / Ayudantes / Factor de Hinchas adds are team-sheet data the
 * demo does not model — callers resolve the RAW dice totals.
 */
export function kickoffDuelResult(
  event: KickoffEvent,
  totals: { home: number; away: number },
): KickoffDuelOutcome {
  if (event.resolution !== "opposed") return { affected: [], tie: false };
  if (totals.home === totals.away) {
    return { affected: ["home", "away"], tie: true };
  }
  const high: KickoffDuelSide = totals.home > totals.away ? "home" : "away";
  const low: KickoffDuelSide = high === "home" ? "away" : "home";
  // 6/7 reward the highest; 11/12 punish the lowest.
  return { affected: [event.sum === 6 || event.sum === 7 ? high : low], tie: false };
}

/**
 * «EVENTO DE PATADA INICIAL» intro (PDF page 53 / printed page 48) — the
 * verbatim quote the gate screens the 2D6 roll with.
 */
export const KICKOFF_INTRO_QUOTE =
  "Inmediatamente después de que el chute se desvíe, el Entrenador del equipo pateador tira 2D6 y consulta la tabla de Eventos de patada inicial de abajo, para ver qué clase de jaleo tiene lugar.";

/**
 * «TODO LO QUE SUBE, BAJA» (PDF page 54 / printed page 49) — the ball lands
 * AFTER the kickoff event resolves (digest md:372).
 */
export const KICKOFF_LANDING_QUOTE =
  "TODO LO QUE SUBE, BAJA: En cuanto se haya resuelto el Evento de patada inicial, el balón cae en la casilla en la que está situado. Si no hay un jugador en esa casilla, el balón rebota desde la misma inmediatamente. Si hay un jugador en esa casilla, puede intentar atrapar el balón haciendo un chequeo de Agilidad. Si supera el chequeo, se convierte en el portador del balón. Si falla el chequeo, el balón rebota inmediatamente desde esa casilla.";

/**
 * «RECEPCIÓN LIBRE» (PDF page 54 / printed page 49, digest md:374) — the
 * out-of-bounds landing rule the kickoff footnote points at.
 */
export const KICKOFF_FREE_RECEPTION_QUOTE =
  'RECEPCIÓN LIBRE: Para que la patada sea legal, el balón debe caer en la mitad del campo del equipo receptor. Si el balón termina fuera del campo o cruza la línea de placajes iniciales hasta la mitad del campo del equipo pateador debido a un desvío, un rebote o cualquier otro motivo, se produce una "recepción libre". En caso de recepción libre, tras resolver el Evento de patada inicial el Entrenador del equipo receptor elige a uno de sus jugadores En pie sobre el campo y le otorga la posesión del balón. Si no hay ningún jugador En pie al que otorgarle el balón, puede colocarlo en cualquier casilla desocupada de su mitad del campo.';
