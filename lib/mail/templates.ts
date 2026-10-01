import type { MailMessage } from "./transport";

/**
 * Email copy lives HERE, not in `lib/i18n/dictionaries.ts`. The UI dictionary
 * is the typed key set consumed by React chrome; an email body is a plain
 * string rendered outside React, so coupling it to the UI key type (and its
 * fallback rules) would only add coupling without buying type safety.
 */

export interface DateProposedMailParams {
  to: string;
  locale: string;
  leagueName: string;
  proposerName: string;
  /** The recipient's opponent in the fixture (the proposer's team). */
  opponentTeam: string;
  date: Date;
  url: string;
}

/** The product's authenticated default is Spanish: only "en" is English. */
function isEnglish(locale: string): boolean {
  return locale === "en";
}

function localeTag(locale: string): string {
  return isEnglish(locale) ? "en-US" : "es-ES";
}

/**
 * Full localized date+time. Pinned to UTC: the stored proposal `date` is a UTC
 * instant and the recipient's timezone is unknown server-side, so a fixed zone
 * keeps the rendered string deterministic instead of depending on the host TZ.
 */
function formatDate(date: Date, locale: string): string {
  return new Intl.DateTimeFormat(localeTag(locale), {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "UTC",
  }).format(date);
}

/** Team and coach names are user-controlled; escape before HTML interpolation. */
function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * The date-proposal notification, rendered for the recipient's locale. Kept
 * plain: a couple of paragraphs and one link, no external CSS or images, so it
 * renders consistently across mail clients.
 */
export function dateProposedMail(params: DateProposedMailParams): MailMessage {
  const when = formatDate(params.date, params.locale);
  const english = isEnglish(params.locale);
  const proposer =
    params.proposerName.trim() || (english ? "A coach" : "Un entrenador");

  if (english) {
    const subject = `New date proposed — ${params.leagueName}`;
    const text = [
      `${proposer} proposed a new date for the match against ${params.opponentTeam}.`,
      "",
      `Date: ${when}`,
      `League: ${params.leagueName}`,
      "",
      `Review the proposal: ${params.url}`,
    ].join("\n");
    const html = [
      `<p>${escapeHtml(proposer)} proposed a new date for the match against ${escapeHtml(params.opponentTeam)}.</p>`,
      `<p><strong>Date:</strong> ${escapeHtml(when)}<br /><strong>League:</strong> ${escapeHtml(params.leagueName)}</p>`,
      `<p><a href="${escapeHtml(params.url)}">Review the proposal</a></p>`,
    ].join("\n");
    return { to: params.to, subject, html, text };
  }

  const subject = `Nueva fecha propuesta — ${params.leagueName}`;
  const text = [
    `${proposer} ha propuesto una nueva fecha para el partido contra ${params.opponentTeam}.`,
    "",
    `Fecha: ${when}`,
    `Liga: ${params.leagueName}`,
    "",
    `Revisa la propuesta: ${params.url}`,
  ].join("\n");
  const html = [
    `<p>${escapeHtml(proposer)} ha propuesto una nueva fecha para el partido contra ${escapeHtml(params.opponentTeam)}.</p>`,
    `<p><strong>Fecha:</strong> ${escapeHtml(when)}<br /><strong>Liga:</strong> ${escapeHtml(params.leagueName)}</p>`,
    `<p><a href="${escapeHtml(params.url)}">Revisa la propuesta</a></p>`,
  ].join("\n");

  return { to: params.to, subject, html, text };
}

export interface VerificationMailParams {
  to: string;
  locale: string;
  /** The 6-digit code the user types on the signup screen. */
  code: string;
  /** Absolute activation link, built by the caller from `APP_URL`. */
  url: string;
}

/**
 * The email-verification mail (#197). Carries BOTH activation paths — the
 * typed code AND the direct link — because either one confirms the address:
 * the link exists specifically "por si cierra el alta sin querer". The copy
 * states that rule in both languages so the choice never reads as an either/or
 * step. Plain like `dateProposedMail`: paragraphs and links, no external CSS
 * or images. The quoted TTLs ("15 minutes" / "24 hours") mirror CODE_TTL_MS /
 * LINK_TOKEN_TTL_MS; `templates.test.ts` pins copy and constants together.
 */
export function verificationMail(params: VerificationMailParams): MailMessage {
  const english = isEnglish(params.locale);

  if (english) {
    const subject = "Confirm your email address";
    const text = [
      "Almost there! Confirm your email address to activate your account.",
      "",
      `Confirmation code: ${params.code}`,
      "Enter it on the signup screen to finish creating your account. The code expires in 15 minutes.",
      "",
      "Prefer a click? Open this link to activate right away (it is there in case you close the signup page by accident):",
      params.url,
      "The link expires in 24 hours.",
      "",
      "Either the code or the link activates the account — use whichever is easier.",
    ].join("\n");
    const html = [
      "<p>Almost there! Confirm your email address to activate your account.</p>",
      `<p><strong>Confirmation code:</strong> ${escapeHtml(params.code)}</p>`,
      "<p>Enter it on the signup screen to finish creating your account. The code expires in 15 minutes.</p>",
      `<p>Prefer a click? <a href="${escapeHtml(params.url)}">Open this link to activate right away</a> (it is there in case you close the signup page by accident).</p>`,
      "<p>The link expires in 24 hours. <strong>Either the code or the link activates the account</strong> — use whichever is easier.</p>",
    ].join("\n");
    return { to: params.to, subject, html, text };
  }

  const subject = "Confirma tu dirección de correo";
  const text = [
    "¡Ya casi está! Confirma tu dirección de correo para activar tu cuenta.",
    "",
    `Código de confirmación: ${params.code}`,
    "Introdúcelo en la pantalla de alta para terminar de crear tu cuenta. El código caduca en 15 minutos.",
    "",
    "¿Prefieres un clic? Abre este enlace para activar la cuenta ahora mismo (está por si cierras el alta sin querer):",
    params.url,
    "El enlace caduca en 24 horas.",
    "",
    "Tanto el código como el enlace activan la cuenta: usa el que te resulte más cómodo.",
  ].join("\n");
  const html = [
    "<p>¡Ya casi está! Confirma tu dirección de correo para activar tu cuenta.</p>",
    `<p><strong>Código de confirmación:</strong> ${escapeHtml(params.code)}</p>`,
    "<p>Introdúcelo en la pantalla de alta para terminar de crear tu cuenta. El código caduca en 15 minutos.</p>",
    `<p>¿Prefieres un clic? <a href="${escapeHtml(params.url)}">Abre este enlace para activar la cuenta ahora mismo</a> (está por si cierras el alta sin querer).</p>`,
    "<p>El enlace caduca en 24 horas. <strong>Tanto el código como el enlace activan la cuenta</strong>: usa el que te resulte más cómodo.</p>",
  ].join("\n");

  return { to: params.to, subject, html, text };
}
