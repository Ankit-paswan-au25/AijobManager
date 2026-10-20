import { conflict, notFound } from "../lib/errors.js";

/** Shown to users as "expected within 48 hours". Nothing is ever approved automatically. */
export const REVIEW_WINDOW_HOURS = 48;

export function pendingMinutes(submittedAt, now = new Date()) {
  return Math.max(0, Math.floor((now.getTime() - new Date(submittedAt).getTime()) / 60000));
}

const toAdminPortal = (p, now) => ({
  id: p.id,
  name: p.name,
  baseUrl: p.baseUrl,
  domain: p.domain,
  status: p.status,
  submittedAt: p.submittedAt,
  submittedByEmail: p.submitterEmail ?? null,
  pendingMinutes: pendingMinutes(p.submittedAt, now),
  overdue: pendingMinutes(p.submittedAt, now) > REVIEW_WINDOW_HOURS * 60,
});

const toReviewed = (p) => ({
  id: p.id,
  name: p.name,
  baseUrl: p.baseUrl,
  status: p.status,
  reviewedAt: p.reviewedAt,
  rejectionReason: p.rejectionReason,
});

export function createPortalAdminService({ portalRepository, now = () => new Date() }) {
  async function review({ id, status, adminId, reason }) {
    const portal = await portalRepository.review({
      id,
      status,
      reviewerId: adminId,
      rejectionReason: reason ?? null,
    });
    if (portal) return toReviewed(portal);
    if (!(await portalRepository.findById(id))) throw notFound("Portal not found");
    throw conflict("NOT_PENDING", "This portal has already been reviewed");
  }

  return {
    /** Oldest first. Overdue items stay pending: only an admin decision changes status. */
    async listPending() {
      const at = now();
      return (await portalRepository.listPending()).map((p) => toAdminPortal(p, at));
    },

    approve: ({ id, adminId }) => review({ id, status: "approved", adminId }),

    reject: ({ id, adminId, reason }) => review({ id, status: "rejected", adminId, reason }),
  };
}
