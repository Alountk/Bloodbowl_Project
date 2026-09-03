import type { ReactNode } from "react";

/**
 * Curated timeline of the live-match UX (feeds / dock / header / roll), so the
 * "versioned design system" shows WHERE each current piece came from. Earlier
 * iterations have no reusable markup committed (the design studies lived in
 * `previews/`, gitignored) → they are documented here instead of re-rendered.
 */

function Phase({ tag, title, body }: { tag: string; title: string; body: ReactNode }) {
  return (
    <div className="relative border-l-2 border-[#cbd5e1] pb-5 pl-4">
      <span className="absolute -left-[9px] top-0 h-4 w-4 rounded-full border-4 border-[#12225a] bg-white" />
      <p className="font-mono text-[10px] font-bold uppercase tracking-wider text-[#d11938]">{tag}</p>
      <h3 className="text-sm font-black text-[#12225a]">{title}</h3>
      <div className="text-xs leading-relaxed text-[#334155]">{body}</div>
    </div>
  );
}

export default {
  title: "Rulebook Light/Evolución del live",
  parameters: {
    layout: "fullscreen",
    docs: {
      description: {
        component:
          "Dónde vive cada pieza del partido en vivo y cómo evolucionó. Los estudios previos eran " +
          "HTML locales (`previews/`, gitignored) sin markup reutilizable, así que esta historia " +
          "documenta la línea temporal en vez de renderizar código muerto.",
      },
    },
  },
};

export const Timeline = {
  name: "Línea temporal (v1 → v3)",
  render: () => (
    <div className="bg-[#f8fafc] p-6">
      <div className="max-w-xl">
        <Phase
          tag="Dock · v1"
          title="FAB flotante"
          body={
            <>
              Un botón de acción flotante (FAB) desplegaba el menú. Costaba descubrir qué se podía
              anotar y exigía “quién primero” (modelo who-before-what).
            </>
          }
        />
        <Phase
          tag="Dock · v2"
          title="Tira contextual (Diseño B)"
          body={
            <>
              Una tira superior/player-first listaba jugadores; <b>liveActionDock (Diseño A)</b> la
              sustituyó por una barra inferior fija, acción-first, que solo muestra lo legal según el
              rol (activo vs no activo vs espectador).
            </>
          }
        />
        <Phase
          tag="Dock · v3 (actual)"
          title="ActionDock + hoja guiada"
          body={
            <>
              Barra fija inferior con TD/Pase (dos toques) y Baja/Falta guiadas por pasos que reusan
              el RollStepper 1D16. Ver <code>Live match/ActionDock</code>.
            </>
          }
        />
        <Phase
          tag="Feed · v7"
          title="Grilla “rulebook”"
          body={
            <>
              Tarjetas sobre columnas al 68% con gradientes, esquinas y fondo de reglamento.
            </>
          }
        />
        <Phase
          tag="Feed · v3 (actual)"
          title="Cards compactas mobile-first"
          body={
            <>
              Toda resolución usa la misma tarjeta blanca full-width sobre #f8fafc: token/dorsal →
              quién → etiqueta → sub-líneas, con tag de turno y minuto inline y acento lateral por
              bando. El geometry vive en <code>liveEventCards.module.css</code> (las áreas CSS de
              Tailwind arbitrario generaban CSS inválido). Ver <code>Live match/Event cards (v3)</code>.
            </>
          }
        />
        <Phase
          tag="Header · Concepto A"
          title="Score-first con emblemas grandes"
          body={<>Bloque de cabecera alto (≈240px) con emblemas 54px + MiniStats que empujaba el feed.</>}
        />
        <Phase
          tag="Header · Concepto B (actual)"
          title="Turn-first compacto + acrónimo/tooltip"
          body={
            <>
              Pista de turno protagonista; nombre completo solo en tooltip desktop vía
              <code> HeaderEmblem</code> (glifo-acrónimo + tooltip por columna). Ver{" "}
              <code>Identity/HeaderEmblem</code>.
            </>
          }
        />
        <Phase
          tag="Tirada"
          title="1D16 → bandas de severidad (MV-7)"
          body={
            <>
              El selector pasó de valores “crudos” a chips etiquetados {"{roll} → {band}"} con el color
              de la banda como fill y anillo navy en la selección; el 1D6 solo aparece en Permanente.
              Ver <code>Live match/RollStepper 1D16</code>.
            </>
          }
        />
      </div>
    </div>
  ),
};
