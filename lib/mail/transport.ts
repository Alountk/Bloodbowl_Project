import { logger } from "@/lib/logger";

/** A single outbound email, already rendered for the recipient's locale. */
export interface MailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
}

/** A mail provider behind one method, so callers never touch `fetch` directly. */
export interface MailTransport {
  readonly name: string;
  send(message: MailMessage): Promise<void>;
}

/** Resend's transactional endpoint. Exported-ish constant so tests pin the URL. */
const RESEND_ENDPOINT = "https://api.resend.com/emails";

/**
 * Upper bound on the provider call. Resend is an external dependency: without a
 * timeout a hung connection would hold the triggering HTTP request open until
 * the platform's own socket timeout. `AbortSignal.timeout` aborts the fetch and
 * lets `send` reject so the caller's best-effort handling runs.
 */
const SEND_TIMEOUT_MS = 10_000;

/**
 * Real transport: a plain `fetch` POST to Resend's HTTP API. Zero SDK
 * dependency — the request shape is small and stable, so the SDK buys nothing
 * but a transitive dependency tree.
 */
export function createResendTransport(apiKey: string, from: string): MailTransport {
  return {
    name: "resend",
    async send(message: MailMessage): Promise<void> {
      const response = await fetch(RESEND_ENDPOINT, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from,
          to: message.to,
          subject: message.subject,
          html: message.html,
          text: message.text,
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });

      if (!response.ok) {
        // Surface the status so a 401 (bad key) and a 422 (bad payload) are
        // distinguishable in the failure log without reading provider docs.
        throw new Error(`Resend request failed with status ${response.status}`);
      }
    },
  };
}

/**
 * Dev/test fallback: emits one structured line instead of contacting a provider.
 * It intentionally logs the recipient address (the console transport only runs
 * when no provider is configured) so a developer can see what WOULD be sent.
 */
export function createConsoleTransport(): MailTransport {
  return {
    name: "console",
    async send(message: MailMessage): Promise<void> {
      logger.info("mail.sent", {
        transport: "console",
        to: message.to,
        subject: message.subject,
      });
    },
  };
}
