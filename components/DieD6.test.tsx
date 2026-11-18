import { afterEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { DieD6 } from "./DieD6";

/**
 * Layer-per-layer pins for the shared 3D D6 (T33, artboard
 * design/die-roll/01-dice3d.html + highlight modes from 03-d16-result-highlights).
 *
 * jsdom runs no CSS transitions, so the reveal (transitionend-driven in a real
 * browser) is triggered with a synthetic `transitionend` carrying propertyName
 * "transform" — exactly the event the cube emits when the landing transform
 * settles. Reduced-motion is exercised through a matchMedia stub (the component
 * then reveals instantly, never waiting for transitionend — the artboard-03 bug
 * from L112).
 */

function must<T extends Element>(el: T | null): T {
  if (!el) throw new Error("expected element not found");
  return el;
}

function cubeOf(container: HTMLElement): HTMLElement {
  return must(container.querySelector<HTMLElement>(".cube"));
}

function liveOf(container: HTMLElement): HTMLElement {
  return must(container.querySelector<HTMLElement>('[aria-live="polite"]'));
}

/** The landing reveal: the cube's transform transition settled. */
function landRoll(cube: HTMLElement) {
  const ev = new Event("transitionend", { bubbles: true });
  Object.defineProperty(ev, "propertyName", { value: "transform" });
  fireEvent(cube, ev);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("DieD6 — render y resaltado por defecto", () => {
  it("renderiza el dado con la etiqueta accesible por defecto", () => {
    render(<DieD6 value={null} />);
    expect(screen.getByRole("img", { name: "Dado 1D6" })).toBeTruthy();
  });

  it("label personaliza la etiqueta accesible", () => {
    render(<DieD6 value={null} label="Dado de armadura" />);
    expect(screen.getByRole("img", { name: "Dado de armadura" })).toBeTruthy();
  });

  it("en reposo sin valor anuncia «Pulsa para tirar»", () => {
    const { container } = render(<DieD6 value={null} />);
    expect(liveOf(container).textContent).toBe("Pulsa para tirar");
  });

  it("por defecto (highlight none) no aplica ninguna clase de los modos a-e", () => {
    const { container } = render(<DieD6 value={4} />);
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

describe("DieD6 — modos de resaltado a-e", () => {
  it("A · halo rojo sobre el número (pipas) y resto atenuado", () => {
    const { container } = render(<DieD6 value={4} highlight="a" />);
    expect(must(container.firstElementChild).classList.contains("mode-a")).toBe(true);
    const landing = must(container.querySelector<HTMLElement>(".f4"));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("halo")).toBe(true);
  });

  it("B · pulso de la capa de la cara ganadora", () => {
    const { container } = render(<DieD6 value={4} highlight="b" />);
    expect(must(container.firstElementChild).classList.contains("mode-b")).toBe(true);
    const landing = must(container.querySelector<HTMLElement>(".f4"));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("pulse")).toBe(true);
  });

  it("C · badge flotante «Resultado NN» visible", () => {
    const { container } = render(<DieD6 value={5} highlight="c" />);
    expect(must(container.firstElementChild).classList.contains("mode-c")).toBe(true);
    const badge = must(container.querySelector<HTMLElement>(".badge"));
    expect(badge.textContent).toContain("Resultado");
    expect(badge.textContent).toContain("5");
    expect(badge.classList.contains("on")).toBe(true);
  });

  it("D · spotlight: cara ganadora iluminada (lit) y resto atenuado", () => {
    const { container } = render(<DieD6 value={4} highlight="d" />);
    expect(must(container.firstElementChild).classList.contains("mode-d")).toBe(true);
    const landing = must(container.querySelector<HTMLElement>(".f4"));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("lit")).toBe(true);
  });

  it("E · flash de fondo en la cara ganadora", () => {
    const { container } = render(<DieD6 value={4} highlight="e" />);
    expect(must(container.firstElementChild).classList.contains("mode-e")).toBe(true);
    const landing = must(container.querySelector<HTMLElement>(".f4"));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("flash")).toBe(true);
  });

  it("el resaltado aparece solo al revelar el resultado (transitionend)", () => {
    const { container, rerender } = render(<DieD6 value={2} highlight="e" />);
    rerender(<DieD6 value={5} highlight="e" />);
    const landing = must(container.querySelector<HTMLElement>(".f5"));
    expect(landing.classList.contains("on")).toBe(false);
    landRoll(cubeOf(container));
    expect(landing.classList.contains("on")).toBe(true);
    expect(landing.classList.contains("flash")).toBe(true);
  });
});

describe("DieD6 — pose por cara (el número correspondiente queda al frente)", () => {
  // Pose = pose de colocación inversa + SKEW jico {-16, 24} (sin spin).
  const POSES: Record<number, [string, string]> = {
    1: ["rotateX(-16deg)", "rotateY(24deg)"],
    2: ["rotateX(-16deg)", "rotateY(204deg)"],
    3: ["rotateX(-16deg)", "rotateY(-66deg)"],
    4: ["rotateX(-16deg)", "rotateY(114deg)"],
    5: ["rotateX(-106deg)", "rotateY(24deg)"],
    6: ["rotateX(74deg)", "rotateY(24deg)"],
  };

  it("cada valor aterriza en la pose de su cara", () => {
    for (const [value, [rx, ry]] of Object.entries(POSES)) {
      const { container, unmount } = render(<DieD6 value={Number(value)} />);
      const transform = cubeOf(container).style.transform;
      expect(transform).toContain(rx);
      expect(transform).toContain(ry);
      unmount();
    }
  });

  it("las caras llevan las pipas canónicas (cara N = N pipas)", () => {
    const { container } = render(<DieD6 value={null} />);
    for (let n = 1; n <= 6; n++) {
      const face = must(container.querySelector(`.f${n}`));
      expect(face.querySelectorAll(".p").length).toBe(n);
    }
  });

  it("cada tirada suma vueltas acumuladas (+1 vuelta X, +2 vueltas Y)", () => {
    const { container, rerender } = render(<DieD6 value={1} />);
    rerender(<DieD6 value={2} />);
    // cara 2 pose {0, 180} + spin {360, 720} + SKEW {-16, 24}
    expect(cubeOf(container).style.transform).toContain("rotateX(344deg)");
    expect(cubeOf(container).style.transform).toContain("rotateY(924deg)");
    rerender(<DieD6 value={3} />);
    // cara 3 pose {0, -90} + spin {720, 1440} + SKEW
    expect(cubeOf(container).style.transform).toContain("rotateX(704deg)");
    expect(cubeOf(container).style.transform).toContain("rotateY(1374deg)");
  });
});

describe("DieD6 — tamaño, interacción y accesibilidad", () => {
  it("size escala la escena (base 120px)", () => {
    const { container, rerender } = render(<DieD6 value={1} />);
    const scene = must(container.querySelector<HTMLElement>(".scene"));
    expect(scene.style.transform).toContain("scale(1)");
    rerender(<DieD6 value={1} size={240} />);
    expect(scene.style.transform).toContain("scale(2)");
  });

  it("el botón «Tirar» dispara onRoll", () => {
    const onRoll = vi.fn();
    render(<DieD6 value={null} onRoll={onRoll} />);
    fireEvent.click(screen.getByRole("button", { name: "Tirar" }));
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  // T34: los call sites fijan nombres exactos («Tirar 1D6») — pin de accesibilidad preservado.
  it("rollLabel pone el texto EXACTO del botón de tirar", () => {
    const onRoll = vi.fn();
    render(<DieD6 value={null} onRoll={onRoll} rollLabel="Tirar 1D6" />);
    fireEvent.click(screen.getByRole("button", { name: "Tirar 1D6" }));
    expect(onRoll).toHaveBeenCalledTimes(1);
  });

  it("el botón queda deshabilitado mientras rolling", () => {
    render(<DieD6 value={1} rolling onRoll={() => {}} />);
    const btn = must(screen.getByRole("button", { name: "Tirar" }) as HTMLButtonElement | null);
    expect(btn.disabled).toBe(true);
  });

  it("anuncia «Tirando…» en vuelo y el resultado al revelar", () => {
    const { container, rerender } = render(<DieD6 value={3} />);
    expect(liveOf(container).textContent).toBe("Resultado: 3");
    rerender(<DieD6 value={6} />);
    expect(liveOf(container).textContent).toBe("Tirando…");
    landRoll(cubeOf(container));
    expect(liveOf(container).textContent).toBe("Resultado: 6");
  });

  it("resultText personaliza el texto anunciado", () => {
    const { container } = render(
      <DieD6 value={3} resultText={(n) => `Ha salido un ${n}`} />,
    );
    expect(liveOf(container).textContent).toBe("Ha salido un 3");
  });

  it("con prefers-reduced-motion revela al instante sin esperar transitionend", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({ matches: true } as MediaQueryList);
    const { container, rerender } = render(<DieD6 value={3} />);
    rerender(<DieD6 value={5} />);
    expect(liveOf(container).textContent).toBe("Resultado: 5");
  });

  it("rolling muestra «Tirando…» y oculta el resaltado hasta terminar", () => {
    const { container, rerender } = render(<DieD6 value={4} highlight="c" rolling />);
    expect(liveOf(container).textContent).toBe("Tirando…");
    const badge = must(container.querySelector<HTMLElement>(".badge"));
    expect(badge.classList.contains("on")).toBe(false);
    rerender(<DieD6 value={4} highlight="c" />);
    expect(liveOf(container).textContent).toBe("Resultado: 4");
    expect(badge.classList.contains("on")).toBe(true);
  });

  it("el wobble de vuelo se aplica como clase que alterna en cada tirada", () => {
    const { container, rerender } = render(<DieD6 value={1} />);
    expect(cubeOf(container).className).not.toMatch(/tumbling/);
    // Each roll flips tumbling-a/tumbling-b: switching animation names
    // restarts the mid-flight wobble keyframe.
    rerender(<DieD6 value={2} />);
    expect(cubeOf(container).classList.contains("tumbling-a")).toBe(true);
    rerender(<DieD6 value={3} />);
    expect(cubeOf(container).classList.contains("tumbling-b")).toBe(true);
  });
});

describe("DieD6 — animateOnMount (T36, L126)", () => {
  // WHY (T36, user L126 verbatim): «que saliera el dado y hiciera la
  // animacion mostrando el resultado» — a die that MOUNTS already holding a
  // value (the prayer reveal step after «Aceptar») must PLAY the roll, not
  // appear with the result. A CSS transition cannot run on first paint, so
  // the mount flight is an ENTRY ANIMATION (`.die-roll-in`, rendered from the
  // component with its `--die-from` before-pose) and it settles via
  // animationend — transitionend stays the settle signal for value changes.

  it("animateOnMount con valor al montar LANZA LA TIRADA: wobble + pose con spin y el resultado al asentar", () => {
    const { container } = render(<DieD6 value={5} animateOnMount />);
    const cube = cubeOf(container);
    // Roll in flight: the wobble class + the landing pose WITH the
    // cumulative spin (cara 5 {-90,0} + {360,720} + SKEW {-16,24}).
    expect(cube.classList.contains("tumbling-a")).toBe(true);
    expect(cube.style.transform).toContain("rotateX(254deg)");
    expect(cube.style.transform).toContain("rotateY(744deg)");
    // The entry animation contract: marker class + its before-pose var + the
    // keyframes stylesheet — this is what actually MOVES in a real browser.
    expect(cube.classList.contains("die-roll-in")).toBe(true);
    expect(cube.getAttribute("style")).toContain("--die-from");
    expect(cube.getAttribute("style")).toContain("rotateX(-106deg)");
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
    const { container } = render(<DieD6 value={5} animateOnMount={false} />);
    const cube = cubeOf(container);
    expect(cube.className).not.toMatch(/tumbling|die-roll-in/);
    expect(cube.style.transform).toContain("rotateX(-106deg)");
    expect(liveOf(container).textContent).toBe("Resultado: 5");
  });

  it("animateOnMount con prefers-reduced-motion revela al instante (sin esperar el asentado)", () => {
    vi.spyOn(window, "matchMedia").mockReturnValue({
      matches: true,
    } as MediaQueryList);
    const { container } = render(<DieD6 value={5} animateOnMount />);
    expect(liveOf(container).textContent).toBe("Resultado: 5");
  });

  it("TRIANGULATE · tras el montaje rige el cambio de valor normal (spin acumulado, reveal al asentar)", () => {
    const { container, rerender } = render(<DieD6 value={5} animateOnMount />);
    rerender(<DieD6 value={2} animateOnMount />);
    const cube = cubeOf(container);
    // Roll 2: spin acumulado {720, 1440}; el vuelo de montaje ya pasó.
    expect(cube.classList.contains("die-roll-in")).toBe(false);
    expect(cube.classList.contains("tumbling-b")).toBe(true);
    expect(cube.style.transform).toContain("rotateX(704deg)");
    expect(cube.style.transform).toContain("rotateY(1644deg)");
    expect(liveOf(container).textContent).toBe("Tirando…");
    landRoll(cube);
    expect(liveOf(container).textContent).toBe("Resultado: 2");
  });

  it("la caja de la escena SIGUE al size (sin caja fija desperdiciada — el contenedor del usuario)", () => {
    // WHY (user stake: «mira no vaya a ser por el contenedor»): the scene
    // box tracks the die footprint (size px at the d6's 120-base) instead of
    // reserving a fixed box around a visually scaled die.
    const { container, rerender } = render(<DieD6 value={1} size={60} />);
    const scene = must(container.querySelector<HTMLElement>(".scene"));
    expect(scene.style.width).toBe("60px");
    expect(scene.style.height).toBe("60px");
    expect(scene.style.transform).toContain("scale(0.5)");
    rerender(<DieD6 value={1} size={240} />);
    expect(scene.style.width).toBe("240px");
    expect(scene.style.height).toBe("240px");
    expect(scene.style.transform).toContain("scale(2)");
  });
});
