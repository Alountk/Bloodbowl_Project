import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DieD16 } from "./DieD16";

/**
 * Layer-per-layer pins for the shared 3D D16 (T33, artboards
 * design/die-roll/02-dice3d-16.html + 03-d16-result-highlights.html): the
 * octagonal bipyramid exactly as the artboards leave it (d=55, face 46x78,
 * tilt 45, bottom faces at i*45 aligned) with the CORRECTED faces map
 * (x:∓45, y:-i*45, SKEW {-8, 12}).
 *
 * jsdom runs no CSS transitions: the roll reveal is triggered with a synthetic
 * `transitionend` (propertyName "transform"), and reduced-motion through a
 * matchMedia stub must reveal instantly without it (L112 bug pin).
 */

function must<T extends Element>(el: T | null): T {
  if (!el) throw new Error("expected element not found");
  return el;
}

function cubeOf(container: HTMLElement): HTMLElement {
  return must(container.querySelector<HTMLElement>(".poly"));
}

function liveOf(container: HTMLElement): HTMLElement {
  return must(container.querySelector<HTMLElement>('[aria-live="polite"]'));
}

function landRoll(cube: HTMLElement) {
  const ev = new Event("transitionend", { bubbles: true });
  Object.defineProperty(ev, "propertyName", { value: "transform" });
  fireEvent(cube, ev);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DieD16 — render y resaltado por defecto", () => {
  it("renderiza el dado con la etiqueta accesible por defecto", () => {
    render(<DieD16 value={null} />);
    expect(screen.getByRole("img", { name: "Dado 1D16" })).toBeTruthy();
  });

  it("label personaliza la etiqueta accesible", () => {
    render(<DieD16 value={null} label="Dado de lesión" />);
    expect(screen.getByRole("img", { name: "Dado de lesión" })).toBeTruthy();
  });

  it("en reposo sin valor anuncia «Pulsa para tirar»", () => {
    const { container } = render(<DieD16 value={null} />);
    expect(liveOf(container).textContent).toBe("Pulsa para tirar");
  });

  it("por defecto (highlight none) no aplica ninguna clase de los modos a-e", () => {
    const { container } = render(<DieD16 value={12} />);
    const wrapper = must(container.firstElementChild);
    expect(wrapper.className).not.toMatch(/mode-/);
    for (const face of container.querySelectorAll(".face")) {
      for (const cls of ["on", "halo", "pulse", "lit", "flash"]) {
        expect(face.classList.contains(cls)).toBe(false);
      }
    }
    expect(container.querySelector(".badge")).toBeNull();
  });
});

describe("DieD16 — modos de resaltado a-e", () => {
  it("A · halo rojo sobre el número y resto atenuado", () => {
    const { container } = render(<DieD16 value={12} highlight="a" />);
    expect(must(container.firstElementChild).classList.contains("mode-a")).toBe(true);
    const landing = must(container.querySelector<HTMLElement>(".b3"));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("halo")).toBe(true);
  });

  it("B · pulso de la capa de la cara ganadora", () => {
    const { container } = render(<DieD16 value={12} highlight="b" />);
    expect(must(container.firstElementChild).classList.contains("mode-b")).toBe(true);
    const landing = must(container.querySelector<HTMLElement>(".b3"));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("pulse")).toBe(true);
  });

  it("C · badge flotante «Resultado NN» visible", () => {
    const { container } = render(<DieD16 value={7} highlight="c" />);
    expect(must(container.firstElementChild).classList.contains("mode-c")).toBe(true);
    const badge = must(container.querySelector<HTMLElement>(".badge"));
    expect(badge.textContent).toContain("Resultado");
    expect(badge.textContent).toContain("7");
    expect(badge.classList.contains("on")).toBe(true);
  });

  it("D · spotlight: cara ganadora iluminada (lit) y resto atenuado", () => {
    const { container } = render(<DieD16 value={12} highlight="d" />);
    expect(must(container.firstElementChild).classList.contains("mode-d")).toBe(true);
    const landing = must(container.querySelector<HTMLElement>(".b3"));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("lit")).toBe(true);
  });

  it("E · flash de fondo en la cara ganadora", () => {
    const { container } = render(<DieD16 value={12} highlight="e" />);
    expect(must(container.firstElementChild).classList.contains("mode-e")).toBe(true);
    const landing = must(container.querySelector<HTMLElement>(".b3"));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("flash")).toBe(true);
  });

  it("el resaltado aparece solo al revelar el resultado (transitionend)", () => {
    const { container, rerender } = render(<DieD16 value={2} highlight="a" />);
    rerender(<DieD16 value={16} highlight="a" />);
    const landing = must(container.querySelector<HTMLElement>(".b7"));
    expect(landing.classList.contains("on")).toBe(false);
    landRoll(cubeOf(container));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("halo")).toBe(true);
  });
});

describe("DieD16 — geometría y mapa de caras", () => {
  it("el mapa de caras coloca 1-8 arriba y 9-16 abajo", () => {
    const { container } = render(<DieD16 value={null} />);
    for (let i = 0; i < 8; i++) {
      expect(must(container.querySelector(`.t${i} span`)).textContent).toBe(String(i + 1));
      expect(must(container.querySelector(`.b${i} span`)).textContent).toBe(String(i + 9));
    }
  });

  // Pose = x:∓45, y:-i*45 (mapa corregido) + SKEW jico {-8, 12} (sin spin).
  const POSES: Record<number, [string, string]> = {
    1: ["rotateX(-53deg)", "rotateY(12deg)"],
    5: ["rotateX(-53deg)", "rotateY(-168deg)"],
    8: ["rotateX(-53deg)", "rotateY(-303deg)"],
    9: ["rotateX(37deg)", "rotateY(12deg)"],
    12: ["rotateX(37deg)", "rotateY(-123deg)"],
    16: ["rotateX(37deg)", "rotateY(-303deg)"],
  };

  it("los extremos y las caras intermedias aterrizan en su pose", () => {
    for (const [value, [rx, ry]] of Object.entries(POSES)) {
      const { container, unmount } = render(<DieD16 value={Number(value)} />);
      const transform = cubeOf(container).style.transform;
      expect(transform).toContain("translate(-50%");
      expect(transform).toContain(rx);
      expect(transform).toContain(ry);
      unmount();
    }
  });

  it("cada tirada suma vueltas acumuladas (+1 vuelta X, +2 vueltas Y)", () => {
    const { container, rerender } = render(<DieD16 value={1} />);
    rerender(<DieD16 value={2} />);
    // cara 2 pose {x: -45, y: -45} + spin {360, 720} + SKEW {-8, 12}
    expect(cubeOf(container).style.transform).toContain("rotateX(307deg)");
    expect(cubeOf(container).style.transform).toContain("rotateY(687deg)");
  });
});

describe("DieD16 — tamaño, interacción y accesibilidad", () => {
  it("size escala la escena (base 120px de pie de dado)", () => {
    const { container, rerender } = render(<DieD16 value={1} />);
    const scene = must(container.querySelector<HTMLElement>(".scene"));
    expect(scene.style.transform).toContain("scale(1)");
    rerender(<DieD16 value={1} size={240} />);
    expect(scene.style.transform).toContain("scale(2)");
  });

  it("el botón «Tirar» dispara onRoll", () => {
    const onRoll = vi.fn();
    render(<DieD16 value={null} onRoll={onRoll} />);
    fireEvent.click(screen.getByRole("button", { name: "Tirar" }));
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  // T34: los call sites fijan nombres exactos («Tirar 1D16») — pin de accesibilidad preservado.
  it("rollLabel pone el texto EXACTO del botón de tirar", () => {
    const onRoll = vi.fn();
    render(<DieD16 value={null} onRoll={onRoll} rollLabel="Tirar 1D16" />);
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D16" }));
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it("el botón queda deshabilitado mientras rolling", () => {
    render(<DieD16 value={1} rolling onRoll={() => {}} />);
    const btn = must(screen.getByRole("button", { name: "Tirar" }) as HTMLButtonElement | null);
    expect(btn.disabled).toBe(true);
  });

  it("anuncia «Tirando…» en vuelo y el resultado al revelar", () => {
    const { container, rerender } = render(<DieD16 value={3} />);
    expect(liveOf(container).textContent).toBe("Resultado: 3");
    rerender(<DieD16 value={10} />);
    expect(liveOf(container).textContent).toBe("Tirando…");
    landRoll(cubeOf(container));
    expect(liveOf(container).textContent).toBe("Resultado: 10");
  });

  it("resultText personaliza el texto anunciado", () => {
    const { container } = render(
      <DieD16 value={13} resultText={(n) => `Lesión: ${n}`} />,
    );
    expect(liveOf(container).textContent).toBe("Lesión: 13");
  });

  it("con prefers-reduced-motion revela al instante sin esperar transitionend", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const { container, rerender } = render(<DieD16 value={3} />);
    rerender(<DieD16 value={14} />);
    expect(liveOf(container).textContent).toBe("Resultado: 14");
  });

  it("rolling muestra «Tirando…» y oculta el resaltado hasta terminar", () => {
    const { container, rerender } = render(<DieD16 value={9} highlight="c" rolling />);
    expect(liveOf(container).textContent).toBe("Tirando…");
    const badge = must(container.querySelector<HTMLElement>(".badge"));
    expect(badge.classList.contains("on")).toBe(false);
    rerender(<DieD16 value={9} highlight="c" />);
    expect(liveOf(container).textContent).toBe("Resultado: 9");
    expect(badge.classList.contains("on")).toBe(true);
  });

  it("el wobble de vuelo se aplica como clase que alterna en cada tirada", () => {
    const { container, rerender } = render(<DieD16 value={1} />);
    expect(cubeOf(container).className).not.toMatch(/tumbling/);
    // Each roll flips tumbling-a/tumbling-b: switching animation names
    // restarts the mid-flight wobble keyframe.
    rerender(<DieD16 value={2} />);
    expect(cubeOf(container).classList.contains("tumbling-a")).toBe(true);
    rerender(<DieD16 value={3} />);
    expect(cubeOf(container).classList.contains("tumbling-b")).toBe(true);
  });
});

describe("DieD16 — animateOnMount (T36, L126)", () => {
  // WHY (T36, user L126 verbatim): «que saliera el dado y hiciera la
  // animacion mostrando el resultado» — a die that MOUNTS already holding a
  // value (the prayer reveal step after «Aceptar») must PLAY the roll, not
  // appear with the result. A CSS transition cannot run on first paint, so
  // the mount flight is an ENTRY ANIMATION (`.die-roll-in`, rendered from the
  // component with its `--die-from` before-pose) and it settles via
  // animationend — transitionend stays the settle signal for value changes.

  it("animateOnMount con valor al montar LANZA LA TIRADA: wobble + pose con spin y el resultado al asentar", () => {
    const { container } = render(<DieD16 value={5} animateOnMount />);
    const cube = cubeOf(container);
    // Roll in flight: the wobble class + the landing pose WITH the
    // cumulative spin (cara 5 {-45,-180} + {360,720} + SKEW {-8,12}).
    expect(cube.classList.contains("tumbling-a")).toBe(true);
    expect(cube.style.transform).toContain("rotateX(307deg)");
    expect(cube.style.transform).toContain("rotateY(552deg)");
    // The entry animation contract: marker class + its before-pose var + the
    // keyframes stylesheet — this is what actually MOVES in a real browser.
    expect(cube.classList.contains("die-roll-in")).toBe(true);
    expect(cube.getAttribute("style")).toContain("--die-from");
    expect(cube.getAttribute("style")).toContain("rotateX(-53deg)");
    expect(container.querySelector("style")?.textContent).toContain(
      "die-roll-in",
    );
    expect(liveOf(container).textContent).toBe("Tirando…");
    // Settled (jsdom: synthetic transitionend — the same reveal gate the
    // component keeps for value changes).
    landRoll(cube);
    expect(liveOf(container).textContent).toBe("Resultado: 5");
  });

  it("sin animateOnMount NO hay tirada al montar: el dado monta ya revelado (pin)", () => {
    const { container } = render(<DieD16 value={5} animateOnMount={false} />);
    const cube = cubeOf(container);
    expect(cube.className).not.toMatch(/tumbling|die-roll-in/);
    expect(cube.style.transform).toContain("rotateX(-53deg)");
    expect(liveOf(container).textContent).toBe("Resultado: 5");
  });

  it("animateOnMount con prefers-reduced-motion revela al instante (sin esperar el asentado)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const { container } = render(<DieD16 value={5} animateOnMount />);
    expect(liveOf(container).textContent).toBe("Resultado: 5");
  });

  it("TRIANGULATE · tras el montaje rige el cambio de valor normal (spin acumulado, reveal al asentar)", () => {
    const { container, rerender } = render(<DieD16 value={5} animateOnMount />);
    rerender(<DieD16 value={12} animateOnMount />);
    const cube = cubeOf(container);
    // Roll 2: spin acumulado {720, 1440}; el vuelo de montaje ya pasó.
    expect(cube.classList.contains("die-roll-in")).toBe(false);
    expect(cube.classList.contains("tumbling-b")).toBe(true);
    expect(cube.style.transform).toContain("rotateX(757deg)");
    expect(cube.style.transform).toContain("rotateY(1317deg)");
    expect(liveOf(container).textContent).toBe("Tirando…");
    landRoll(cube);
    expect(liveOf(container).textContent).toBe("Resultado: 12");
  });

  it("la caja de la escena SIGUE al size (sin caja fija desperdiciada — el contenedor del usuario)", () => {
    // WHY (user stake: «mira no vaya a ser por el contenedor»): the scene
    // box tracks the die footprint (size × 200/120 — the d16 artboard's
    // flight margin around the 120px die) instead of reserving a fixed
    // 200px box around a visually scaled die.
    const { container, rerender } = render(<DieD16 value={1} size={60} />);
    const scene = must(container.querySelector<HTMLElement>(".scene"));
    expect(scene.style.width).toBe("100px");
    expect(scene.style.height).toBe("100px");
    expect(scene.style.transform).toContain("scale(0.5)");
    rerender(<DieD16 value={1} size={240} />);
    expect(scene.style.width).toBe("400px");
    expect(scene.style.height).toBe("400px");
    expect(scene.style.transform).toContain("scale(2)");
  });
});
