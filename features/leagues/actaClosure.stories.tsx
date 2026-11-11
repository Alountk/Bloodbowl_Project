import {
  ActaClosure,
  canCloseActa,
  type ActaClosureViewer,
} from "./actaClosure";
import {
  league,
  liveState,
  matchDetail,
  narrativeEvents,
  resultSnapshot,
  viewer,
} from "./actaFlow.fixtures";

/**
 * The ONE closure surface (MAW-1/MAW-10): the story mirrors the real guard —
 * `canCloseActa` decides whether the panel renders, exactly as the V2 flow
 * does. `fixtureId` is omitted so the localStorage draft stays OFF (the
 * submit POST is never exercised: `onSubmitted` is a no-op mock).
 */

function Closure({
  detail,
  viewer: v,
}: {
  detail: ReturnType<typeof matchDetail>;
  viewer: ActaClosureViewer;
}) {
  const allowed = canCloseActa(detail, league, v);
  return (
    <div className="flex justify-center bg-background p-2">
      <div className="w-full max-w-2xl">
        {allowed ? (
          <ActaClosure
            detail={detail}
            league={league}
            viewer={v}
            onClose={() => undefined}
            onSubmitted={async () => undefined}
          />
        ) : (
          <p className="rounded border border-dashed border-[#cbd5e1] bg-white p-4 text-sm text-slate-500">
            Cierre no disponible para este espectador/estado (canCloseActa = false).
          </p>
        )}
      </div>
    </div>
  );
}

const finishedLive = () =>
  matchDetail({
    live: {
      ...liveState({
        status: "finished",
        finishedAt: (liveState().startedAt ?? 0) + 92 * 60_000,
        elapsed: 92 * 60_000,
        turnNumber: 8,
      }),
      events: narrativeEvents,
    },
  });

export default {
  title: "Partido/New Styles/Cierre",
  component: ActaClosure,
  parameters: {
    docs: {
      description: {
        component:
          "Superficie única de cierre del acta: resumen derivado + las preguntas pendientes " +
          "(tiradas, MVP, AF + animadoras 1D6). La guarda `canCloseActa` replica las reglas de " +
          "actor/ciclo de vida del servidor: solo participante/admin, fixture programada, " +
          "partido en vivo FINALIZADO y sin resultado ya reportado. Sin `fixtureId` el borrador " +
          "persistente queda apagado. Mock ES, sin red.",
      },
    },
  },
};

export const CierreDisponible = {
  name: "Cierre disponible — participante",
  render: () => <Closure detail={finishedLive()} viewer={viewer} />,
};

export const ResultadoYaReportado = {
  name: "No disponible — resultado ya reportado",
  render: () => (
    <Closure detail={matchDetail({ result: resultSnapshot() })} viewer={viewer} />
  ),
};

export const NoParticipante = {
  name: "No disponible — espectador no participante",
  render: () => <Closure detail={finishedLive()} viewer={{ id: "u3", role: "member" }} />,
};
