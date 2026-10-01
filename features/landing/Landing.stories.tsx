import type { ReactNode } from "react";
import { SessionProvider } from "next-auth/react";
import { I18nProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { Landing } from "./Landing";

/**
 * Public landing story set (issue #314): the anonymous home page inside the
 * provider stack the root layout mounts (Session → I18n → Theme) with a NULL
 * session, so AppNav renders its public variant ("Sign in"). Three views:
 * English (default), Spanish, and a locked 375×812 viewport to review the
 * mobile-first hero.
 *
 * The viewport lock uses story-level `globals.viewport` — the Storybook 10
 * replacement for the removed `parameters.viewport.defaultViewport` (the form
 * still used by AppNav.stories, which now logs a deprecation and no-ops).
 */

function LandingProviders({ locale, children }: { locale: "en" | "es"; children: ReactNode }) {
  return (
    <SessionProvider session={null}>
      <I18nProvider initialLocale={locale}>
        <ThemeProvider initialTheme="vintage">{children}</ThemeProvider>
      </I18nProvider>
    </SessionProvider>
  );
}

export default {
  title: "Chrome/Landing",
  component: Landing,
  parameters: {
    docs: {
      description: {
        component:
          "Landing pública (visitante anónimo): hero navy plano con el titular en " +
          "Fraunces (font-display), CTA principal a ancho completo en móvil y " +
          "«Tour the app» como enlace tranquilo subrayado. Features y pasos son " +
          "listas separadas por filetes de 1px — sin tarjetas con borde. " +
          "Home chrome en inglés.",
      },
    },
  },
};

export const Default = {
  name: "English (default)",
  render: () => (
    <LandingProviders locale="en">
      <Landing />
    </LandingProviders>
  ),
  parameters: {
    docs: {
      description: {
        story: "Locale por defecto del visitante anónimo (EN): nav público + hero + features + How it works.",
      },
    },
  },
};

export const Spanish = {
  name: "Spanish",
  render: () => (
    <LandingProviders locale="es">
      <Landing />
    </LandingProviders>
  ),
  parameters: {
    docs: {
      description: {
        story: "Misma página con locale ES (cookie bb-locale=es): hero, secciones y toggle Ocultar/Mostrar en español.",
      },
    },
  },
};

export const Mobile = {
  name: "Mobile (375×812)",
  render: () => (
    <LandingProviders locale="en">
      <Landing />
    </LandingProviders>
  ),
  globals: {
    viewport: { value: "375px-812px", isRotated: false },
  },
  parameters: {
    docs: {
      description: {
        story:
          "Vista móvil 375×812: el hero apila titular, subtítulo, CTA a ancho " +
          "completo y el enlace del tour; features a una columna y pasos " +
          "apilados con filetes.",
      },
    },
  },
};
