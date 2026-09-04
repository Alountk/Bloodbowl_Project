import { UserAvatar } from "./UserAvatar";

/**
 * UserAvatar story set: a 32px round `<img>` rendered only when an adapter-issued
 * avatar value is present, and NOTHING when it is null (callers keep their name
 * fallback). The inline SVG data URI keeps the "with avatar" story offline — no
 * external network.
 */

const SVG_AVATAR =
  "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='32' height='32' viewBox='0 0 32 32'%3E%3Crect width='32' height='32' fill='%2312225a'/%3E%3Ccircle cx='16' cy='12' r='6' fill='%23f8fafc'/%3E%3Cpath d='M6 28c0-5 4-8 10-8s10 3 10 8' fill='%23f8fafc'/%3E%3C/svg%3E";

export default {
  title: "Identity/UserAvatar",
  component: UserAvatar,
  parameters: {
    docs: {
      description: {
        component:
          "Avatar compartido (perfil y filas de propietarios del partido). Renderiza una `<img>` " +
          "redonda de 32px solo cuando hay un valor de avatar; con `null` no renderiza nada para que " +
          "los callers conserven su fallback de nombre.",
      },
    },
  },
};

export const ConAvatar = {
  name: "Con avatar",
  render: () => (
    <div className="flex items-center gap-2 bg-[#f8fafc] p-4">
      <UserAvatar src={SVG_AVATAR} />
      <span className="text-sm font-semibold text-[#12225a]">Entrenadora Susana</span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story: "Con un `src` SVG inline (sin red): la imagen redonda de 32px aparece junto al nombre.",
      },
    },
  },
};

export const SinAvatar = {
  name: "Sin avatar (null)",
  render: () => (
    <div className="flex items-center gap-2 bg-[#f8fafc] p-4">
      {/* The 32px slot where the avatar would render: with src={null} UserAvatar
          returns null, so the dashed slot stays empty and the name is the only
          identifier — matching the MatchCard owner fallback. */}
      <span
        aria-hidden="true"
        className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-dashed border-[#cbd5e1]"
      >
        <UserAvatar src={null} />
      </span>
      <span className="text-sm font-semibold text-[#12225a]">Entrenador Iván</span>
    </div>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Con `src={null}` no renderiza nada: el hueco punteado de 32px queda vacío y el nombre actúa " +
          "como único identificador (fallback del caller).",
      },
    },
  },
};
