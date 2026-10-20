import { AppError, badRequest, conflict } from "../lib/errors.js";
import { normalizePortalUrl } from "../lib/portalUrl.js";

export const MAX_PENDING_PER_USER = 5;

/** What a user may see. Never exposes who submitted or reviewed anything. */
const toUserPortal = (p) => ({
  id: p.id,
  name: p.name,
  baseUrl: p.baseUrl,
  status: p.status,
  selected: Boolean(p.selected),
  submittedAt: p.status === "pending" ? p.submittedAt : null,
});

export function createPortalService({ portalRepository }) {
  const listFor = async (userId) =>
    (await portalRepository.listVisibleToUser(userId)).map(toUserPortal);

  return {
    /** Approved portals plus the caller's own pending submissions. */
    listFor,

    async submit({ userId, name, baseUrl }) {
      const normalized = normalizePortalUrl(baseUrl);
      if (!normalized) {
        throw badRequest("VALIDATION_ERROR", "baseUrl: must be a public website address (http or https)");
      }

      // Same message whether the match is approved or someone else's pending submission,
      // so pending portals stay invisible to other users.
      const duplicate = () =>
        conflict("DUPLICATE_PORTAL", "This portal already exists or is already under review");

      if (await portalRepository.findLiveByDomain(normalized.domain)) throw duplicate();
      if ((await portalRepository.countPendingBySubmitter(userId)) >= MAX_PENDING_PER_USER) {
        throw conflict(
          "TOO_MANY_PENDING",
          `You already have ${MAX_PENDING_PER_USER} portals under review. Wait for a decision first.`,
        );
      }

      const created = await portalRepository.createPending({
        name: name.trim(),
        baseUrl: normalized.baseUrl,
        domain: normalized.domain,
        submittedBy: userId,
      });
      if (!created) throw duplicate(); // lost a race with another submission
      return toUserPortal({ ...created, selected: false });
    },

    /** Replaces the user's selection. Only approved portals can be selected. */
    async setSelection({ userId, portalIds }) {
      const ids = [...new Set(portalIds)];
      const approved = new Set(await portalRepository.findApprovedIds(ids));
      if (ids.some((id) => !approved.has(id))) {
        throw new AppError(400, "INVALID_PORTAL", "One or more selected portals are not available");
      }
      await portalRepository.replaceUserPortals(userId, ids);
      return listFor(userId);
    },
  };
}
