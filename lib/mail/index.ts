import { logError } from "@/lib/logger";
import {
  createConsoleTransport,
  createResendTransport,
  type MailMessage,
  type MailTransport,
} from "./transport";

export type { MailMessage, MailTransport } from "./transport";

/**
 * Where the message actually went. The three outcomes are NOT interchangeable:
 *
 * - `delivered` — a real provider accepted it; a mailbox will receive it.
 * - `printed` — no provider is configured, so the console transport only wrote
 *   the message to stdout. In `AUTH_MODE=auth` the code NEVER reaches the
 *   user, so callers must log this as a failure, never as `sent`
 *   (`lib/mail/notify.ts` owns that decision).
 * - `failed` — a provider WAS configured but the send threw.
 */
export type MailOutcome = "delivered" | "printed" | "failed";

/**
 * Picks the transport from the environment. Resend needs BOTH a key and a
 * verified `from` address; with either missing we fall back to the console
 * transport so local/dev/test runs never attempt a network call.
 */
export function resolveTransport(): MailTransport {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.MAIL_FROM;
  if (apiKey && from) {
    return createResendTransport(apiKey, from);
  }
  return createConsoleTransport();
}

/**
 * Best-effort send. Resolves with WHERE it went — `delivered` only for a real
 * provider, `printed` for the console fallback — and `failed` on ANY error; a
 * mail problem must never propagate into the request that triggered it, so
 * this never rejects. Failures are logged with the serialized error.
 */
export async function sendMail(message: MailMessage): Promise<MailOutcome> {
  const transport = resolveTransport();
  try {
    await transport.send(message);
    // "console" is the only non-delivering transport; everything else (today:
    // Resend) talked to a real provider and the message will arrive.
    return transport.name === "console" ? "printed" : "delivered";
  } catch (error) {
    logError("mail.failed", error, { to: message.to, subject: message.subject });
    return "failed";
  }
}
