import type { ReactNode } from "react";
import type { Session } from "next-auth";
import { SessionProvider } from "next-auth/react";
import { AppNav } from "./AppNav";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";

/**
 * AppNav story set (RAU-179): the unified landing/app-shell navigation —
 * navy bar (logo + Teams/Leagues/Matches + right slot), public variant with
 * "Sign in", authenticated variant with the avatar+name user menu, and dev
 * links for developer sessions. Mobile uses a hamburger that opens the side
 * drawer.
 *
 * The component reads `useSession` (next-auth), `useI18n` and the theme
 * provider, so every story mounts the same provider stack the root layout
 * uses, injecting a FAKE session through `SessionProvider`'s `session` prop
 * (no real auth). Storybook never submits the AuthModal / PATCH flows — the
 * stories document the rendered chrome.
 */

const EXPIRES = "2099-01-01T00:00:00.000Z";

function coachSession(role: "user" | "developer" = "user"): Session {
  return {
    user: {
      id: "u-coach",
      name: "Coach Alountk",
      email: "coach@example.com",
      role,
    },
    expires: EXPIRES,
  };
}

/** Provider stack mirroring app/layout.tsx (Session → I18n → Theme). */
function NavProviders({ session, children }: { session?: Session | null; children: ReactNode }) {
  return (
    <SessionProvider session={session}>
      <I18nProvider initialLocale="en">
        <ThemeProvider initialTheme="vintage">{children}</ThemeProvider>
      </I18nProvider>
    </SessionProvider>
  );
}

const noop = () => {};

/** Public variant: anonymous visitor on the landing (Sign in button). */
function PublicNav() {
  return <AppNav showSignIn onLogout={noop} />;
}

/** Authenticated app-shell variant: avatar + name pill with user menu. */
function LoggedNav({ role = "user" }: { role?: "user" | "developer" }) {
  return (
    <AppNav
      authenticated
      onLogout={noop}
      // The shell wires session presence; the role drives dev links.
    />
  );
}

export default {
  title: "Chrome/AppNav",
  component: AppNav,
  parameters: {
    docs: {
      description: {
        component:
          "Navegación unificada (landing pública + app shell): barra navy con logo y " +
          "links (Teams / Leagues / Matches), slot derecho con 'Sign in' (pública) o " +
          "avatar + nombre con menú Perfil / Cerrar sesión (logueada). Los links de " +
          "dev (Rulesets / Users) aparecen solo para sesiones developer. Mobile usa una " +
          "hamburguesa que abre el drawer lateral. Home chrome en inglés.",
      },
    },
  },
};

export const Publica = {
  name: "Pública (anónimo)",
  render: () => (
    <NavProviders session={null}>
      <PublicNav />
    </NavProviders>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Variante de la landing para visitante anónimo: enlaces Teams/Leagues/Matches " +
          "y el botón 'Sign in' (abre el AuthModal en la app real; aquí no se abre).",
      },
    },
  },
};

export const Autenticado = {
  name: "Autenticado (user)",
  render: () => (
    <NavProviders session={coachSession("user")}>
      <LoggedNav role="user" />
    </NavProviders>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "App shell con sesión de rol `user`: pill de avatar + nombre 'Coach Alountk' " +
          "con el dropdown Perfil / Cerrar sesión. Sin links de dev.",
      },
    },
  },
};

export const Developer = {
  name: "Developer (rol developer)",
  render: () => (
    <NavProviders session={coachSession("developer")}>
      <LoggedNav role="developer" />
    </NavProviders>
  ),
  parameters: {
    docs: {
      description: {
        story:
          "Sesión de rol `developer`: `can(role, 'rulesets.dev')` y `can(role, 'users.manage')` " +
          "añaden los links Tipos de reglas y Usuarios al nav.",
      },
    },
  },
};

export const DrawerMobile = {
  name: "Drawer mobile (375px)",
  render: () => (
    <NavProviders session={coachSession("developer")}>
      <LoggedNav role="developer" />
    </NavProviders>
  ),
  parameters: {
    viewport: { defaultViewport: "mobile1" },
    docs: {
      description: {
        story:
          "Viewport móvil (375px): la barra colapsa a hamburguesa ☰; al abrirla aparece " +
          "el drawer lateral con links, Perfil / Cerrar sesión, el ThemeSwitcher y el " +
          "LocaleSwitcher (la apertura del drawer es interacción del componente en la app real).",
      },
    },
  },
};
