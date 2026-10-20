import { AppError } from "../lib/errors.js";
import { limitOffset } from "../lib/pagination.js";

/** Reviews anyone logged in can post and read. Only `visible` reviews are ever returned here. */
export function createReviewService({ reviewRepository, portalRepository }) {
  return {
    /**
     * POST /api/reviews. `portalId` null means a review of the app itself.
     * Only approved portals can be reviewed. Pending/rejected/unknown all get the same answer,
     * so nobody can probe for someone else's pending submission.
     */
    async create(userId, { body, portalId }) {
      if (portalId) {
        const portal = await portalRepository.findById(portalId);
        if (!portal || portal.status !== "approved") {
          throw new AppError(400, "INVALID_PORTAL", "That portal isn't available for reviews");
        }
      }
      return { review: await reviewRepository.create({ userId, portalId: portalId ?? null, body }) };
    },

    /** GET /api/reviews. Hidden and flagged reviews are not included. No author details are shown. */
    async listVisible({ portalId, about, page, pageSize }) {
      const { reviews, total } = await reviewRepository.listVisible({ portalId, about, ...limitOffset({ page, pageSize }) });
      return { reviews, page, pageSize, total };
    },
  };
}
