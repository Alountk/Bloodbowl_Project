import { prisma } from "@/lib/prisma";
import { logError, logger } from "@/lib/logger";
import { sendMail } from "./index";
import { dateProposedMail, verificationMail } from "./templates";

export interface NotifyDateProposedParams {
  leagueName: string;
  homeTeam: { name: string; userId: string };
  awayTeam: { name: string; userId: string };
  proposerUserId: string;
  date: Date;
  leagueId: string;
  fixtureId: string;
}

/** One counterpart owner plus the opponent name to show them. */
interface Recipient {
  userId: string;
  opponentTeam: string;
}

/**
 * Base URL for the league link. The repo has no public-base env var yet, so
 * `APP_URL` is the contract; when unset the link stays relative (`/leagues/x`)
 * and the mail client resolves it against the webmail origin. No trailing
 * slash, so the join cannot produce `//leagues`.
 */
function leagueUrl(leagueId: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  return `${base}/leagues/${leagueId}`;
}

/**
 * Activation link for the verification mail: `${APP_URL}/verify?token=…&email=…`
 * with trailing slashes stripped (the `leagueUrl` rule above). The email rides
 * in the link on purpose: both stored hashes are domain-separated by the
 * address (`sha256(secret + ":" + email)`), so the verify screen must POST the
 * pair back — the token alone cannot be looked up. Neither value is secret to
 * the recipient; they arrive in the same mailbox.
 */
function verificationUrl(token: string, email: string): string {
  const base = (process.env.APP_URL ?? "").replace(/\/+$/, "");
  const query = `token=${encodeURIComponent(token)}&email=${encodeURIComponent(email)}`;
  return `${base}/verify?${query}`;
}

/**
 * Notifies the counterpart coach (or coaches) that a match date was proposed.
 *
 * Best-effort by contract: it NEVER throws, so a mail outage cannot turn a
 * successful negotiation into a failed request. Recipients are every owner of
 * the two teams who is not the proposer — normally exactly one counterpart, but
 * a privileged non-participant who proposes produces two.
 *
 * The recipient's email is never logged (the logger does not redact it); logs
 * carry `userId` only.
 */
export async function notifyDateProposed(
  params: NotifyDateProposedParams,
): Promise<void> {
  try {
    const recipients: Recipient[] = [];
    const seen = new Set<string>();
    const add = (userId: string, opponentTeam: string) => {
      if (userId === params.proposerUserId || seen.has(userId)) return;
      seen.add(userId);
      recipients.push({ userId, opponentTeam });
    };
    // Each owner's opponent is the OTHER team in the fixture.
    add(params.homeTeam.userId, params.awayTeam.name);
    add(params.awayTeam.userId, params.homeTeam.name);
    if (recipients.length === 0) return;

    // The proposer's display name is not part of the route payload, so it is
    // loaded once here (the template needs a human-readable sender).
    const proposer = await prisma.user.findUnique({
      where: { id: params.proposerUserId },
      select: { name: true },
    });
    const proposerName = proposer?.name ?? "";

    for (const recipient of recipients) {
      const user = await prisma.user.findUnique({
        where: { id: recipient.userId },
        select: { email: true, name: true, locale: true },
      });
      // A user without an email cannot be reached — skip rather than fail.
      if (!user?.email) continue;

      const sent = await sendMail(
        dateProposedMail({
          to: user.email,
          locale: user.locale,
          leagueName: params.leagueName,
          proposerName,
          opponentTeam: recipient.opponentTeam,
          date: params.date,
          url: leagueUrl(params.leagueId),
        }),
      );

      if (sent) {
        logger.info("mail.dateProposed.sent", {
          fixtureId: params.fixtureId,
          userId: recipient.userId,
        });
      }
    }
  } catch (error) {
    logError("mail.dateProposed.failed", error, {
      fixtureId: params.fixtureId,
      leagueId: params.leagueId,
    });
  }
}

export interface NotifyEmailVerificationParams {
  userId: string;
  email: string;
  locale: string;
  /** Plaintext 6-digit code — never stored, only mailed. */
  code: string;
  /** Plaintext activation token — only its hash is stored. */
  token: string;
}

/**
 * Sends the account-activation mail: the typed code AND the direct link,
 * either of which confirms the address (the link is there "por si cierra el
 * alta sin querer").
 *
 * Best-effort by contract, like `notifyDateProposed`: it NEVER throws, so a
 * mail outage cannot fail the signup or resend that triggered it. Every log
 * line THIS function writes carries `userId` only — no verification secret
 * ever reaches the logger. (The recipient address is a different story:
 * `sendMail`'s own failure path logs `{ to, subject }` — see
 * `lib/mail/index.ts:35`. The claim belongs to this function, not to the mail
 * layer, which is why it is phrased that way.)
 */
export async function notifyEmailVerification(
  params: NotifyEmailVerificationParams,
): Promise<void> {
  try {
    const sent = await sendMail(
      verificationMail({
        to: params.email,
        locale: params.locale,
        code: params.code,
        url: verificationUrl(params.token, params.email),
      }),
    );
    if (sent) {
      logger.info("mail.verification.sent", { userId: params.userId });
    }
  } catch (error) {
    logError("mail.verification.failed", error, { userId: params.userId });
  }
}
