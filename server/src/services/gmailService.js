import jwt from "jsonwebtoken";
import { enabledSenders, findEnabledSender, SYNC_WINDOW_DAYS } from "../config/alertSenders.js";
import { AppError, conflict } from "../lib/errors.js";
import { parseAlertEmail } from "./alerts/alertParser.js";
import { readRawEmail, senderAddressFromHeader } from "./alerts/emailReader.js";
import { GMAIL_READONLY_SCOPE, GmailApiError, MAX_MESSAGE_BYTES } from "./gmail/gmailClient.js";

const STATE_PURPOSE = "gmail-oauth";
const DAY_MS = 24 * 60 * 60 * 1000;

/** Gmail search for ONLY the enabled senders in the last N days. Exact sender matching happens afterwards. */
export function buildSearchQuery(senders = enabledSenders(), windowDays = SYNC_WINDOW_DAYS) {
  return `from:(${senders.map((s) => s.address).join(" OR ")}) newer_than:${windowDays}d`;
}

export function createGmailService({
  gmailClient, connectionRepository, jobRepository, cipher, jwtSecret,
  logger = console, now = () => new Date(),
}) {
  const syncing = new Set(); // user ids with a sync in flight

  const upstream = (err) =>
    err instanceof GmailApiError
      ? new AppError(502, "GMAIL_UPSTREAM_ERROR", "Google could not be reached. Try again shortly.")
      : err;

  async function disconnect(userId) {
    const connection = await connectionRepository.findByUserId(userId);
    if (!connection) return;
    try {
      await gmailClient.revoke(cipher.decrypt(connection.refreshTokenEncrypted));
    } catch {
      /* undecryptable or already revoked: still delete our copy */
    }
    await connectionRepository.deleteByUserId(userId);
  }

  return {
    /** URL to send the browser to. `state` is a short-lived signed token bound to this user. */
    startConnect(userId) {
      const state = jwt.sign({ purpose: STATE_PURPOSE }, jwtSecret, { subject: userId, expiresIn: "10m" });
      return gmailClient.buildAuthUrl(state);
    },

    async completeConnect({ userId, code, state }) {
      try {
        const payload = jwt.verify(state, jwtSecret, { algorithms: ["HS256"] });
        if (payload.purpose !== STATE_PURPOSE || payload.sub !== userId) throw new Error("state mismatch");
      } catch {
        throw new AppError(400, "INVALID_STATE", "This connection attempt is invalid or expired. Please try again.");
      }
      if (!code) throw new AppError(400, "VALIDATION_ERROR", "code: is required");

      let tokens;
      try {
        tokens = await gmailClient.exchangeCode(code);
      } catch (err) {
        throw upstream(err);
      }
      if (!tokens.scopes.includes(GMAIL_READONLY_SCOPE) || tokens.scopes.some((s) => s !== GMAIL_READONLY_SCOPE)) {
        // Wrong or extra scopes: don't keep anything.
        if (tokens.refreshToken) await gmailClient.revoke(tokens.refreshToken);
        throw new AppError(400, "INVALID_SCOPE", "Gmail access must be read-only and nothing else.");
      }
      if (!tokens.refreshToken) {
        throw new AppError(400, "NO_REFRESH_TOKEN", "Google did not grant offline access. Please try again.");
      }
      await connectionRepository.upsert({
        userId,
        refreshTokenEncrypted: cipher.encrypt(tokens.refreshToken),
        scope: GMAIL_READONLY_SCOPE,
      });
    },

    disconnect,

    /**
     * On-demand sync: reads ONLY messages from enabled allowlisted senders in the last 30 days,
     * parses job cards, and stores jobs + this user's user_jobs rows. Nothing else is read, stored or logged.
     */
    async sync(userId) {
      if (syncing.has(userId)) throw conflict("SYNC_IN_PROGRESS", "A sync is already running");
      syncing.add(userId);
      try {
        const connection = await connectionRepository.findByUserId(userId);
        if (!connection) throw conflict("GMAIL_NOT_CONNECTED", "Connect your Gmail account first");

        let accessToken;
        try {
          accessToken = await gmailClient.refreshAccessToken(cipher.decrypt(connection.refreshTokenEncrypted));
        } catch (err) {
          if (err instanceof GmailApiError && err.kind === "invalid_grant") {
            await connectionRepository.deleteByUserId(userId); // access was revoked in Google
            throw conflict("GMAIL_RECONNECT_REQUIRED", "Gmail access was revoked. Please connect again.");
          }
          throw upstream(err);
        }

        const summary = {
          messagesFound: 0, messagesIgnored: 0, messagesFailed: 0,
          emailsParsed: 0, emailsSkipped: [], jobsFound: 0, jobsInserted: 0, userJobsCreated: 0, linksNeeded: 0,
        };
        const windowStart = now().getTime() - SYNC_WINDOW_DAYS * DAY_MS;
        const jobs = [];

        let ids;
        try {
          ids = await gmailClient.searchMessageIds(accessToken, buildSearchQuery());
        } catch (err) {
          throw upstream(err);
        }
        summary.messagesFound = ids.length;

        for (const id of ids) {
          try {
            // Step 1: headers only. Gmail's from: search is fuzzy, so verify the exact sender address.
            const meta = await gmailClient.getMessageHeaders(accessToken, id);
            const fromAddress = await senderAddressFromHeader(meta.from);
            const inWindow = !meta.receivedAt || meta.receivedAt.getTime() >= windowStart;
            if (!findEnabledSender(fromAddress) || !inWindow || meta.sizeBytes > MAX_MESSAGE_BYTES) {
              summary.messagesIgnored += 1;
              continue;
            }

            // Step 2: only now read the body.
            const raw = await gmailClient.getRawMessage(accessToken, id);
            const email = await readRawEmail(raw, { receivedAt: meta.receivedAt ?? undefined });
            if (email.fromAddress !== fromAddress) {
              summary.messagesIgnored += 1;
              continue;
            }

            const result = parseAlertEmail(email);
            if (result.status === "parsed") {
              summary.emailsParsed += 1;
              jobs.push(...result.jobs);
            } else if (result.status === "skipped") {
              summary.emailsSkipped.push({ portal: result.portal, reason: result.reason });
              logger.info(`[alerts] skipped email: portal=${result.portal} reason=${result.reason}`);
            } else {
              summary.messagesIgnored += 1;
            }
          } catch (err) {
            if (err instanceof GmailApiError && err.kind === "invalid_grant") throw upstream(err);
            summary.messagesFailed += 1; // never log the message or its id
          }
        }

        summary.jobsFound = jobs.length;
        summary.linksNeeded = jobs.filter((j) => j.needs_link).length;
        if (jobs.length > 0) {
          const saved = await jobRepository.saveForUser(userId, jobs);
          summary.jobsInserted = saved.jobsInserted;
          summary.userJobsCreated = saved.userJobsCreated;
        }
        return summary;
      } finally {
        syncing.delete(userId);
      }
    },
  };
}
