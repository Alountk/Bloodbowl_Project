import { useState } from "react";
import { RollStepper } from "./rollStepper";

/**
 * Shared 1D16(+1D6) severity picker (b2/D3). Each option reads "{roll} → {band}"
 * and carries its severity band fill (≤8 gris → 15-16 rojo, MV-7 five-band
 * ramp); the navy ring marks the selected value on top of the band fill. The
 * 1D6 attribute group only appears when the derived band is `permanent` (13-14).
 */

function InteractiveRollStepper({ roll16 = "", roll6 = "" }: { roll16?: number | ""; roll6?: number | "" }) {
  const [r16, setR16] = useState<number | "">(roll16);
  const [r6, setR6] = useState<number | "">(roll6);
  return (
    <div className="rounded-lg bg-white p-4 shadow-sm">
      <RollStepper roll16={r16} roll6={r6} onRoll16={setR16} onRoll6={setR6} />
    </div>
  );
}

export default {
  title: "Live match/RollStepper 1D16",
  component: RollStepper,
  parameters: {
    docs: {
      description: {
        component:
          "Selector de tirada 1D16 (y 1D6 cuando la banda es Permanente). La banda de severidad " +
          "se deriva client-side con la misma `resolveInjury` que el servidor; el anillo marino " +
          "marca la selección SIN ocultar el color de banda. '13 → Permanente' añade el sufijo '(tira 1D6)'.",
      },
    },
  },
};

export const SinSeleccion = {
  name: "Sin selección",
  render: () => <InteractiveRollStepper />,
  parameters: {
    docs: {
      description: {
        story: "Estado inicial: 16 opciones con su banda de color, nada seleccionado, sin 1D6.",
      },
    },
  },
};

export const PermanenteConD6 = {
  name: "13 → Permanente (con 1D6)",
  render: () => <InteractiveRollStepper roll16={13} roll6={4} />,
  parameters: {
    docs: {
      description: {
        story:
          "13 (Permanente) seleccionado: aparece el grupo 1D6 para el atributo (−{attr}); " +
          "el grupo 1D6 usa el rojo corporativo para su selección.",
      },
    },
  },
};

export const Grave = {
  name: "9 → Grave",
  render: () => <InteractiveRollStepper roll16={9} />,
  parameters: {
    docs: {
      description: {
        story: "Una banda intermedia (9 → Grave, ámbar) seleccionada: sin 1D6 requerido.",
      },
    },
  },
};
