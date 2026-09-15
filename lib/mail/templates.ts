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
