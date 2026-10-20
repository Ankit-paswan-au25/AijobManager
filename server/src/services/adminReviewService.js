import { REVIEW_ACTION_FOR_STATUS } from "../config/admin.js";
import { notFound } from "../lib/errors.js";
import { limitOffset } from "../lib/pagination.js";

export function createAdminReviewService({ reviewRepository }) {
  return {
    /** GET /api/admin/reviews. Every status, with the author, newest first. */
    async list({ status, page, pageSize }) {
      const { reviews, total } = await reviewRepository.listForAdmin({ status: status ?? null, ...limitOffset({ page, pageSize }) });
      return { reviews, page, pageSize, total };
    },

    /**
     * PATCH /api/admin/reviews/:id. hidden = hide, visible = unhide, flagged = flag.
     * A real change is logged in the audit log (in the same transaction). Setting the status it already
     * has changes and logs nothing.
     */
    async setStatus(adminId, id, status) {
      const result = await reviewRepository.moderate({ id, status, adminId, action: REVIEW_ACTION_FOR_STATUS[status] });
      if (!result) throw notFound("Review not found");
      return { review: result.review };
    },
  };
}
