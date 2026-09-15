import { prisma } from "@/lib/prisma";
import { logError, logger } from "@/lib/logger";
import { sendMail } from "./index";
import { dateProposedMail } from "./templates";

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
