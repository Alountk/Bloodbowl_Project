import { DieD6, type HighlightMode } from "./DieD6";

/**
 * DieD6 story set (T33): the shared jico-translucent 3D D6 from the approved
 * artboard `design/die-roll/01-dice3d.html`, with the five result-highlight
 * modes of `03-d16-result-highlights.html` exposed through the `highlight`
 * selector. Co-located in `components/` (`.storybook/main.ts` globs component
 * stories next to their source).
 *
 * Stories are ARGS-based so the Controls panel drives the highlight selector,
 * the size and the rolled value; `onRoll` is a no-op here — the RNG stays with
 * the caller (lib/random).
 */

const noop = () => {};

export default {
  title: "Dice/DieD6",
  component: DieD6,
  parameters: {
    docs: {
      description: {
        component:
          "Dado 1D6 compartido (estilo jico translúcido azul): cubo 3D con pipas canónicas, " +
          "aterrizaje escorado y spin acumulativo por tirada. `highlight` por defecto `none` " +
          "(sin ningún efecto); los modos a-e son los 5 resaltados de resultado aprobados.",
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
      control: { type: "number", min: 1, max: 6 },
      description: "Cara resultante (controlada; el RNG vive en el caller).",
    },
    rolling: { control: "boolean", description: "Presentación en vuelo («Tirando…»)." },
    label: { control: "text", description: "Etiqueta accesible en español." },
  },
};

export const Reposo = {
  name: "Reposo (sin tirada)",
  render: (args: { highlight?: HighlightMode; size?: number; label?: string }) => (
    <div className="flex min-h-48 items-center justify-center bg-[#f8fafc]">
      <DieD6 value={null} onRoll={noop} {...args} />
    </div>
  ),
  args: { highlight: "none", size: 120, label: "Dado 1D6" },
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
    <div className="flex min-h-48 items-center justify-center bg-[#f8fafc]">
      <DieD6 value={4} onRoll={noop} {...args} />
    </div>
  ),
  args: { highlight: "none", size: 120, value: 4 },
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

export const ModoA = {
  name: "A · Rojo con halo",
  render: (args: { size?: number }) => (
    <div className="flex min-h-48 items-center justify-center bg-[#f8fafc]">
      <DieD6 value={5} highlight="a" onRoll={noop} {...args} />
    </div>
  ),
  args: { size: 120 },
  parameters: {
    docs: { description: { story: "Pipas rojas con halo y el resto de caras atenuado." } },
  },
};

export const ModoB = {
  name: "B · Pulso de capa",
  render: (args: { size?: number }) => (
    <div className="flex min-h-48 items-center justify-center bg-[#f8fafc]">
      <DieD6 value={2} highlight="b" onRoll={noop} {...args} />
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
    <div className="flex min-h-48 items-center justify-center bg-[#f8fafc]">
      <DieD6 value={6} highlight="c" onRoll={noop} {...args} />
    </div>
  ),
  args: { size: 120 },
  parameters: {
    docs: {
      description: { story: "Badge «Resultado NN» con pop junto al dado (el más visible de lejos)." },
    },
  },
};

export const ModoD = {
  name: "D · Spotlight",
  render: (args: { size?: number }) => (
    <div className="flex min-h-48 items-center justify-center bg-[#f8fafc]">
      <DieD6 value={3} highlight="d" onRoll={noop} {...args} />
    </div>
  ),
  args: { size: 120 },
  parameters: {
    docs: {
      description: { story: "Cara ganadora iluminada; el resto de la escena al 35%." },
    },
  },
};

export const ModoE = {
  name: "E · Flash de fondo",
  render: (args: { size?: number }) => (
    <div className="flex min-h-48 items-center justify-center bg-[#f8fafc]">
      <DieD6 value={4} highlight="e" onRoll={noop} {...args} />
    </div>
  ),
  args: { size: 120 },
  parameters: {
    docs: {
      description: { story: "Destello rojo de fondo en la cara ganadora (4 parpadeos)." },
    },
  },
};

export const Grande = {
  name: "Tamaño 240",
  render: () => (
    <div className="flex min-h-96 items-center justify-center bg-[#f8fafc]">
      <DieD6 value={6} size={240} highlight="none" onRoll={noop} />
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "La prop `size` escala la escena (mismo dado, pie de 240px).",
      },
    },
  },
};
