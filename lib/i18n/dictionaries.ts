export type Locale = "es" | "en";

export type Dict = Record<string, string>;

/** The default locale: Spanish. `useI18n()` falls back to this without a provider. */
export const DEFAULT_LOCALE: Locale = "es";

const es: Dict = {
  "nav.teams": "Equipos",
  "nav.leagues": "Ligas",
  "nav.profile": "Mi Perfil",
  "nav.openMenu": "Abrir menú de navegación",
  "nav.closeMenu": "Cerrar menú",
  "nav.locale": "Idioma",
  "topbar.searchLabel": "Buscar equipos",
  "topbar.searchPlaceholder": "Buscar equipos…",
  "topbar.logout": "Cerrar sesión",
  "teams.heading": "Equipos",
  "teams.createNew": "Crear equipo",
  "teams.empty": "No hay equipos todavía. Crea tu primer equipo.",
  "teams.noMatch": "Ningún equipo coincide con tu búsqueda.",
  "teams.delete": "Eliminar",
  "teams.deleteAction": "Eliminar {name}",
  "match.turnOf": "Turno de {team}",
};

const en: Dict = {
  "nav.teams": "Teams",
  "nav.leagues": "Leagues",
  "nav.profile": "My Profile",
  "nav.openMenu": "Open navigation menu",
  "nav.closeMenu": "Close menu",
  "nav.locale": "Language",
  "topbar.searchLabel": "Search teams",
  "topbar.searchPlaceholder": "Search teams…",
  "topbar.logout": "Log out",
  "teams.heading": "Teams",
  "teams.createNew": "Create team",
  "teams.empty": "No teams yet. Create your first team.",
  "teams.noMatch": "No teams match your search.",
  "teams.delete": "Delete",
  "teams.deleteAction": "Delete {name}",
  "match.turnOf": "{team}'s turn",
};

const dictionaries: Record<Locale, Dict> = { es, en };

function interpolate(template: string, params?: Record<string, string | number>): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) =>
    Object.prototype.hasOwnProperty.call(params, name) ? String(params[name]) : match,
  );
}

/**
 * Resolves a dot-notation key against a locale dictionary. `{name}` placeholders
 * are replaced with the matching `params` value. Missing keys return the key
 * itself and log a dev-only warning — they never throw.
 */
export function t(
  locale: Locale,
  key: string,
  params?: Record<string, string | number>,
): string {
  const dict = dictionaries[locale] ?? es;
  const template = dict[key];
  if (template === undefined) {
    if (process.env.NODE_ENV === "development") {
      console.warn(`[i18n] Missing translation key "${key}" for locale "${locale}"`);
    }
    return key;
  }
  return interpolate(template, params);
}
