import { DieD16, type HighlightMode } from "./DieD16";

/**
 * DieD16 story set (T33): the shared jico-translucent 16-face die (octagonal
 * bipyramid) from the approved artboards `design/die-roll/02-dice3d-16.html`
 * (geometry) and `03-d16-result-highlights.html` (highlight modes), exposed
 * through the `highlight` selector. Co-located in `components/` (`.storybook/
 * main.ts` globs component stories next to their source).
 *
 * Stories are ARGS-based so the Controls panel drives the highlight selector,
 * the size and the rolled value; `onRoll` is a no-op here — the RNG stays with
 * the caller (lib/random).
 */

const noop = () => {};

export default {
  title: "Dice/DieD16",
  component: DieD16,
  parameters: {
    docs: {
      description: {
        component:
          "Dado 1D16 compartido (estilo jico translúcido azul): octaedro octogonal de 16 caras " +
          "exactas, aterrizaje escorado y spin acumulativo por tirada. `highlight` por defecto " +
          "`none` (sin ningún efecto); los modos a-e son los 5 resaltados de resultado aprobados.",
      },
    },
  },
  argTypes: {
    highlight: {
      control: "select",
      options: ["none", "a", "b", "c", "d", "e"],
      description: "Modo de resaltado del resultado (por defecto: ninguno).",
    },
    size: {
      control: { type: "range", min: 72, max: 240, step: 4 },
      description: "Tamaño del dado en px (la escala parte de 120).",
    },
    value: {
      control: { type: "number", min: 1, max: 16 },
      description: "Cara resultante (controlada; el RNG vive en el caller).",
    },
    rolling: { control: "boolean", description: "Presentación en vuelo («Tirando…»)." },
    label: { control: "text", description: "Etiqueta accesible en español." },
  },
};

export const Reposo = {
  name: "Reposo (sin tirada)",
  render: (args: { highlight?: HighlightMode; size?: number; label?: string }) => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD16 value={null} onRoll={noop} {...args} />
    </div>
  ),
  args: { highlight: "none", size: 120, label: "Dado 1D16" },
  parameters: {
    docs: {
      description: {
        story: "Estado inicial: dado a la espera, «Pulsa para tirar», sin resaltado.",
      },
    },
  },
};

export const Resultado = {
  name: "Resultado (sin efecto)",
  render: (args: { highlight?: HighlightMode; size?: number; value?: number | null }) => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD16 value={5} onRoll={noop} {...args} />
    </div>
  ),
  args: { highlight: "none", size: 120, value: 5 },
  parameters: {
    docs: {
      description: {
        story:
          "Aterrizaje por defecto (highlight none): la cara sale SIN ningún efecto, " +
          "escorada como el dado de jico.",
      },
    },
  },
};

export const PoloSur = {
  name: "Cara inferior (polo sur)",
  render: () => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD16 value={10} highlight="none" size={120} onRoll={noop} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Cara 10 (pirámide inferior): el número va de-mirrorado con margin-top 30, " +
          "la posición de polo sur aprobada (L115/L117) — no tocar.",
      },
    },
  },
};

export const ModoA = {
  name: "A · Rojo con halo",
  render: (args: { size?: number }) => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD16 value={12} highlight="a" onRoll={noop} {...args} />
    </div>
  ),
  args: { size: 120 },
  parameters: {
    docs: {
      description: {
        story: "Número rojo con halo y el resto de caras atenuado (sin escala: L116).",
      },
    },
  },
};

export const ModoB = {
  name: "B · Pulso de capa",
  render: (args: { size?: number }) => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD16 value={3} highlight="b" onRoll={noop} {...args} />
    </div>
  ),
  args: { size: 120 },
  parameters: {
    docs: { description: { story: "La capa de la cara ganadora parpadea 3 veces en blanco." } },
  },
};

export const ModoC = {
  name: "C · Badge flotante",
  render: (args: { size?: number }) => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD16 value={16} highlight="c" onRoll={noop} {...args} />
    </div>
  ),
  args: { size: 120 },
  parameters: {
    docs: {
      description: {
        story: "Badge «Resultado NN» con pop junto al dado (el más visible de lejos).",
      },
    },
  },
};

export const ModoD = {
  name: "D · Spotlight",
  render: (args: { size?: number }) => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD16 value={7} highlight="d" onRoll={noop} {...args} />
    </div>
  ),
  args: { size: 120 },
  parameters: {
    docs: { description: { story: "Cara ganadora iluminada; el resto de la escena al 35%." } },
  },
};

export const ModoE = {
  name: "E · Flash de fondo",
  render: (args: { size?: number }) => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD16 value={12} highlight="e" onRoll={noop} {...args} />
    </div>
  ),
  args: { size: 120 },
  parameters: {
    docs: { description: { story: "Destello rojo de fondo en la cara ganadora (4 parpadeos)." } },
  },
};

export const Grande = {
  name: "Tamaño 240",
  render: () => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD16 value={13} size={240} highlight="none" onRoll={noop} />
    </div>
  ),
  parameters: {
    docs: {
      description: { story: "La prop `size` escala la escena (mismo dado, pie de 240px)." },
    },
  },
};
