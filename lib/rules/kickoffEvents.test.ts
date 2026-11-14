import { describe, expect, it } from "vitest";

import {
  KICKOFF_EVENTS,
  KICKOFF_FREE_RECEPTION_QUOTE,
  KICKOFF_INTRO_QUOTE,
  KICKOFF_LANDING_QUOTE,
  kickoffDuelResult,
  kickoffEventFor,
  type KickoffEvent,
} from "./kickoffEvents";

/**
 * BB2025 Season-3 «TABLA DE EVENTOS DE PATADA INICIAL» (digest md:355-368,
 * PDF page 53 / printed page 48): 11 faces verbatim in Spanish + the v1
 * resolution matrix (L29): opposed = 6, 7, 11, 12 · weather = 8 · manual =
 * 2, 3, 4, 5, 9, 10. The dice lookup is order-independent (2D6).
 */

/** The verbatim rulebook face names, sums 2-12 in order. */
const VERBATIM_NAMES = [
  "ÁRBITRO INTIMIDADO",
  "TIEMPO MUERTO",
  "DEFENSA SÓLIDA",
  "PATADA ALTA",
  "LOS HINCHAS ANIMAN",
  "ENTRENADOR BRILLANTE",
  "CLIMA CAMBIANTE",
  "ANTICIPACIÓN",
  "¡A LA CARGA!",
  "INDIGESTIÓN",
  "INVASIÓN DE CAMPO",
];

/** The verbatim rulebook effect texts, sums 2-12 in order. */
const VERBATIM_EFFECTS = [
  "Cada equipo recibe un Incentivo de Soborno gratuito. Este Incentivo debe usarse antes del final del partido o se pierde.",
  "Si la ficha de turno del equipo pateador está en el turno 6, 7 u 8 de esa parte, ambos equipos mueven su ficha de turno un espacio hacia atrás. Si no es así, ambos equipos mueven su ficha de turno un espacio hacia delante.",
  "El Entrenador del equipo pateador elige hasta 1D3+3 jugadores Desmarcados de su equipo. Dichos jugadores son retirados del campo y desplegados de nuevo siguiendo todas las restricciones normales de despliegue.",
  "Un jugador Desmarcado del equipo receptor puede ser colocado inmediatamente en la casilla en la que va a caer el balón.",
  "Cada Entrenador tira 1D6 y le suma el número de Animadoras de su Hoja de plantilla. La primera acción de Placaje realizada en el siguiente turno del Entrenador que haya sacado un total más alto en esta tirada recibe un apoyo ofensivo adicional. Si la tirada ha sido un empate, ambos Entrenadores reciben este beneficio durante su siguiente turno.",
  "Cada Entrenador tira 1D6 y le suma el número de Ayudantes del Entrenador de su Hoja de plantilla. El Entrenador que haya sacado un total más alto en esta tirada, o ambos Entrenadores en caso de empate, obtiene una Segunda oportunidad gratuita para la entrada que va a jugarse. Si esta Segunda oportunidad no se usa antes del final de esa entrada, se pierde.",
  'Haz inmediatamente una nueva tirada en la tabla de Clima. Si el nuevo resultado es "Clima perfecto", el balón se escora (3) antes de caer al suelo.',
  "El Entrenador del equipo receptor elige hasta 1D3+3 jugadores Desmarcados de su equipo. Dichos jugadores pueden moverse inmediatamente una casilla en cualquier dirección, incluso entrando en la mitad contraria del campo.",
  "El Entrenador del equipo pateador elige hasta 1D3+3 jugadores Desmarcados de su equipo. Dichos jugadores se pueden activar uno tras otro, como si fuera el turno de su equipo, y realizar una acción de Movimiento gratuita. Uno de ellos puede realizar en su lugar una acción de Penetración gratuita, otro puede realizar en su lugar una acción de Lanzar compañero gratuita, y otro puede realizar en su lugar una acción de Patear compañero gratuita. Si uno de los jugadores elegidos se Cae o es Derribado durante su activación, ya no se pueden activar más jugadores y la Carga termina.",
  "Ambos Entrenadores tiran 1D6. El Entrenador con el total más bajo, o ambos en caso de empate, determina al azar a uno de sus jugadores sobre el campo y tira 1D6. Con 2+, el aperitivo que ha tomado el jugador antes de la entrada no le ha sentado bien, por lo que, mientras dure esa entrada, dicho jugador reduce en 1 su MV y su AR. Con un 1, el aperitivo le ha provocado una evacuación forzosa: coloca al jugador en la zona de Reserva de su equipo, ¡para reflejar que se pasa el resto de la entrada encerrado en la letrina!",
  "Cada Entrenador tira 1D6 y le suma su Factor de Hinchas. El Entrenador que saque un total más bajo, o ambos Entrenadores en caso de empate, selecciona al azar 1D3 jugadores de su equipo que están sobre el campo. Dichos jugadores son colocados Tumbados boca arriba y quedan Aturdidos.",
];

describe("KICKOFF_EVENTS — the 11 verbatim faces (digest md:355-368)", () => {
  it("holds exactly 11 events covering every 2D6 sum 2-12 once, with unique ids", () => {
    expect(KICKOFF_EVENTS).toHaveLength(11);
    expect(KICKOFF_EVENTS.map((e) => e.sum)).toEqual([
      2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12,
    ]);
    const ids = new Set(KICKOFF_EVENTS.map((e) => e.id));
    expect(ids.size).toBe(11);
  });

  it("transcribes every face name verbatim in Spanish", () => {
    expect(KICKOFF_EVENTS.map((e) => e.name)).toEqual(VERBATIM_NAMES);
  });

  it("transcribes every effect verbatim in Spanish", () => {
    expect(KICKOFF_EVENTS.map((e) => e.effect)).toEqual(VERBATIM_EFFECTS);
  });

  it("applies the v1 resolution matrix (L29): opposed 6/7/11/12 · weather 8 · manual rest", () => {
    const bySum = (sum: number) => KICKOFF_EVENTS.find((e) => e.sum === sum);
    for (const sum of [6, 7, 11, 12]) {
      expect(bySum(sum)?.resolution).toBe("opposed");
    }
    expect(bySum(8)?.resolution).toBe("weather");
    for (const sum of [2, 3, 4, 5, 9, 10]) {
      expect(bySum(sum)?.resolution).toBe("manual");
    }
  });
});

describe("kickoffEventFor — the 2D6 lookup", () => {
  it("resolves the dice pair to its event, order-independent", () => {
    expect(kickoffEventFor(1, 1).sum).toBe(2);
    expect(kickoffEventFor(1, 1).name).toBe("ÁRBITRO INTIMIDADO");
    expect(kickoffEventFor(3, 5)).toEqual(kickoffEventFor(5, 3));
    expect(kickoffEventFor(2, 6).name).toBe("CLIMA CAMBIANTE");
    expect(kickoffEventFor(6, 6).name).toBe("INVASIÓN DE CAMPO");
    expect(kickoffEventFor(4, 3).id).toBe(KICKOFF_EVENTS[5]?.id);
  });
});

describe("kickoffDuelResult — the opposed follow-up tie rules (per event text)", () => {
  const eventOf = (sum: number): KickoffEvent => {
    const found = KICKOFF_EVENTS.find((e) => e.sum === sum);
    if (found == null) throw new Error(`no event for ${sum}`);
    return found;
  };

  it("6/7: the HIGHEST total wins; a tie benefits BOTH coaches", () => {
    expect(kickoffDuelResult(eventOf(6), { home: 5, away: 3 })).toEqual({
      affected: ["home"],
      tie: false,
    });
    expect(kickoffDuelResult(eventOf(7), { home: 2, away: 6 })).toEqual({
      affected: ["away"],
      tie: false,
    });
    expect(kickoffDuelResult(eventOf(6), { home: 4, away: 4 })).toEqual({
      affected: ["home", "away"],
      tie: true,
    });
  });

  it("11/12: the LOWEST total is hit; a tie hits BOTH coaches", () => {
    expect(kickoffDuelResult(eventOf(11), { home: 2, away: 5 })).toEqual({
      affected: ["home"],
      tie: false,
    });
    expect(kickoffDuelResult(eventOf(12), { home: 6, away: 1 })).toEqual({
      affected: ["away"],
      tie: false,
    });
    expect(kickoffDuelResult(eventOf(12), { home: 3, away: 3 })).toEqual({
      affected: ["home", "away"],
      tie: true,
    });
  });

  it("manual/weather events have no duel to resolve", () => {
    expect(kickoffDuelResult(eventOf(4), { home: 6, away: 1 })).toEqual({
      affected: [],
      tie: false,
    });
    expect(kickoffDuelResult(eventOf(8), { home: 6, away: 1 })).toEqual({
      affected: [],
      tie: false,
    });
  });
});

describe("the rulebook quotes (the UI footnote source)", () => {
  it("keeps the intro quote verbatim (2D6 on the kickoff table)", () => {
    expect(KICKOFF_INTRO_QUOTE).toContain(
      "Inmediatamente después de que el chute se desvíe",
    );
    expect(KICKOFF_INTRO_QUOTE).toContain(
      "el Entrenador del equipo pateador tira 2D6",
    );
    expect(KICKOFF_INTRO_QUOTE).toContain(
      "para ver qué clase de jaleo tiene lugar.",
    );
  });

  it("keeps «TODO LO QUE SUBE, BAJA» verbatim (the ball lands after the event)", () => {
    expect(KICKOFF_LANDING_QUOTE).toContain("TODO LO QUE SUBE, BAJA");
    expect(KICKOFF_LANDING_QUOTE).toContain(
      "el balón cae en la casilla en la que está situado",
    );
    expect(KICKOFF_LANDING_QUOTE).toContain(
      "Si falla el chequeo, el balón rebota inmediatamente desde esa casilla.",
    );
  });

  it("keeps «RECEPCIÓN LIBRE» verbatim (out-of-bounds landing)", () => {
    expect(KICKOFF_FREE_RECEPTION_QUOTE).toContain("RECEPCIÓN LIBRE");
    expect(KICKOFF_FREE_RECEPTION_QUOTE).toContain(
      "el balón debe caer en la mitad del campo del equipo receptor",
    );
    expect(KICKOFF_FREE_RECEPTION_QUOTE).toContain(
      "puede colocarlo en cualquier casilla desocupada de su mitad del campo.",
    );
  });
});
