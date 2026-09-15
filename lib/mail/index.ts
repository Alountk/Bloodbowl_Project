import { logError } from "@/lib/logger";
import {
  createConsoleTransport,
  createResendTransport,
  type MailMessage,
  type MailTransport,
} from "./transport";

export type { MailMessage, MailTransport } from "./transport";

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
 * Best-effort send. Resolves `true` on success and `false` on ANY failure —
 * a mail problem must never propagate into the request that triggered it, so
 * this never rejects. Failures are logged with the serialized error.
 */
export async function sendMail(message: MailMessage): Promise<boolean> {
  try {
    await resolveTransport().send(message);
    return true;
  } catch (error) {
    logError("mail.failed", error, { to: message.to, subject: message.subject });
    return false;
  }
}
