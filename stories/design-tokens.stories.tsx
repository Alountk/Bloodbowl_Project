import type { ReactNode } from "react";

/**
 * Rulebook-light design tokens. The ONLY colors/shadows/radii the live-match UI
 * is allowed to use (designLock tests enforce the geometry atomically). New
 * swatches must NOT introduce variants outside this set.
 */

type Token = { hex: string; name: string; note: string; text?: string };

function Chip({ token, className = "" }: { token: Token; className?: string }) {
  return (
    <div className={`rounded border border-[#e2e8f0] bg-white p-2 ${className}`}>
      <div
        className="h-10 rounded"
        style={{ backgroundColor: token.hex, ...(token.text ? { color: token.text } : {}) }}
      />
      <p className="mt-1.5 text-[11px] font-bold text-[#0f172a]">{token.name}</p>
      <p className="font-mono text-[10px] text-[#64748b]">{token.hex}</p>
      <p className="text-[10px] leading-snug text-[#64748b]">{token.note}</p>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="mb-6">
      <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-[#12225a]">{title}</h2>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">{children}</div>
    </section>
  );
}

const hex = (hex: string) => hex;

export default {
  title: "Rulebook Light/Tokens",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Reglas de diseño “rulebook light”: paleta, bandas de severidad, badges de cotejo, " +
          "tipografía, radios/sombras y espaciado. Los componentes del partido en vivo consumen " +
          "estos valores vía utilidades arbitrarias de Tailwind (no hay variables CSS centralizadas).",
      },
    },
  },
};

export const Swatches = {
  name: "Paleta y tokens",
  render: () => (
    <div className="bg-[#f8fafc] p-4">
      <Section title="Marca">
        <Chip token={{ hex: hex("#12225a"), name: "Navy primary", note: "fondo header, botones, ring de selección" }} />
        <Chip token={{ hex: hex("#0f1d48"), name: "Navy hover", note: "hover de botones navy" }} />
        <Chip token={{ hex: hex("#1f3a7a"), name: "Navy tint", note: "tinte de emblema derivado" }} />
        <Chip token={{ hex: hex("#d11938"), name: "Red primary", note: "visitante, acciones de riesgo, fin de turno" }} />
        <Chip token={{ hex: hex("#b0142f"), name: "Red hover", note: "hover de acciones rojas" }} />
        <Chip token={{ hex: hex("#a61b34"), name: "Red tint", note: "tinte de emblema derivado" }} />
      </Section>
      <Section title="Superficies, texto y bordes">
        <Chip token={{ hex: hex("#f8fafc"), name: "Background", note: "shell del feed / canvas" }} />
        <Chip token={{ hex: hex("#ffffff"), name: "Panel", note: "tarjetas blancas full-width" }} />
        <Chip token={{ hex: hex("#0f172a"), name: "Ink", note: "nombres de jugador en negrita" }} />
        <Chip token={{ hex: hex("#334155"), name: "Slate strong", note: "texto secundario legible" }} />
        <Chip token={{ hex: hex("#64748b"), name: "Slate", note: "minuto, etiquetas muted, captions" }} />
        <Chip token={{ hex: hex("#e2e8f0"), name: "Border", note: "bordes de botones/chips/cards" }} />
        <Chip token={{ hex: hex("#cbd5e1"), name: "Border subtle", note: "bordes suaves, focus ring" }} />
        <Chip token={{ hex: hex("#f1f5f9"), name: "Fill hover", note: "fill de hover / chips neutros" }} />
        <Chip token={{ hex: hex("rgba(18,34,90,0.18)"), name: "Accent local", note: "acento lateral 3px de la tarjeta home" }} />
        <Chip token={{ hex: hex("rgba(209,25,56,0.18)"), name: "Accent visitante", note: "acento lateral 3px de la tarjeta away" }} />
      </Section>
      <Section title="Bandas de severidad 1D16 (MV-7)">
        <Chip token={{ hex: hex("#f1f5f9"), name: "≤8 Magullado", note: "fill #f1f5f9 · border #cbd5e1 · text #334155" }} />
        <Chip token={{ hex: hex("#fef9c3"), name: "9-10 Apaleado", note: "fill #fef9c3 · border #fde047 · text #854d0e" }} />
        <Chip token={{ hex: hex("#fef3c7"), name: "11-12 Grave", note: "fill #fef3c7 · border #fcd34d · text #92400e" }} />
        <Chip token={{ hex: hex("#ffedd5"), name: "13-14 Permanente", note: "fill #ffedd5 · border #fdba74 · text #9a3412" }} />
        <Chip token={{ hex: hex("#fee2e2"), name: "15-16 Muerto", note: "fill #fee2e2 · border #fca5a5 · text #991b1b" }} />
      </Section>
      <Section title="Badges de cotejo y chips de acción">
        <Chip token={{ hex: hex("#e6f6ea"), name: "Ack ok / auto", note: "fill ok · border #c6e9d0 · text #1a7f37" }} />
        <Chip token={{ hex: hex("#fef2f2"), name: "Ack revisar", note: "fill nok · border #f3c6cd · text #c0392b" }} />
        <Chip token={{ hex: hex("#e6d9a8"), name: "Chip TD", note: "borde dorado · text #8a6d1a" }} />
        <Chip token={{ hex: hex("#f3c1c8"), name: "Chip Baja", note: "borde rojo pálido · text #d11938" }} />
        <Chip token={{ hex: hex("#ffd9e0"), name: "Texto sobre rojo", note: "‘Turno {team}’ del chip rojo de fin de turno" }} />
      </Section>
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-[#12225a]">Tipografía</h2>
        <div className="overflow-hidden rounded border border-[#e2e8f0] bg-white">
          {(
            [
              ["text-[26px] font-black", "26 · XD (emblema xl)", "KDO"],
              ["text-xl font-black", "20 · XL (emblema md)", "Águilas de Khemri"],
              ["text-lg font-black", "18 · panel de marca", "1 - 1"],
              ["text-sm font-bold", "14 · titular / chips de dock", "Pase completo"],
              ["text-xs font-bold", "12 · botones de chip", "Turno Águilas de Khemri"],
              ["text-[11px] font-black uppercase tracking-[0.05em]", "11 · caps de acción", "DAR EL TURNO"],
              ["text-[10px] font-bold uppercase tracking-wide", "10 · captions / headers de hoja", "CAUSA DE LA LESIÓN"],
            ] as const
          ).map(([cls, name, sample]) => (
            <div key={name} className="flex items-baseline justify-between gap-4 border-b border-[#f1f5f9] px-3 py-2 last:border-0">
              <span className={`text-[#12225a] ${cls}`}>{sample}</span>
              <span className="text-[10px] font-semibold text-[#64748b]">{name}</span>
            </div>
          ))}
        </div>
      </section>
      <section className="mb-6">
        <h2 className="mb-2 text-xs font-black uppercase tracking-wider text-[#12225a]">Radios y sombras</h2>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div className="flex items-center gap-3 rounded border border-[#e2e8f0] bg-white p-3">
            <span className="rounded-full border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">rounded-full</span>
            <span className="rounded border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">rounded</span>
            <span className="rounded-lg border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">rounded-lg</span>
            <span className="rounded-t-xl border border-[#e2e8f0] bg-[#f8fafc] px-3 py-2">rounded-t-xl</span>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded border border-[#e2e8f0] bg-white p-3 shadow-[0_-2px_10px_rgba(18,34,90,0.08)]">
              <p className="text-[10px] font-bold text-[#0f172a]">Dock bar</p>
              <p className="font-mono text-[10px] text-[#64748b]">0 -2px 10px rgba(18,34,90,.08)</p>
            </div>
            <div className="rounded border border-[#e2e8f0] bg-white p-3 shadow-[0_-6px_18px_rgba(18,34,90,0.12)]">
              <p className="text-[10px] font-bold text-[#0f172a]">Hoja (sheet)</p>
              <p className="font-mono text-[10px] text-[#64748b]">0 -6px 18px rgba(18,34,90,.12)</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Swatches por grupo. Sin variables CSS centrales: los valores viven en utilidades arbitrarias de Tailwind y se referencian aquí.",
      },
    },
  },
};
