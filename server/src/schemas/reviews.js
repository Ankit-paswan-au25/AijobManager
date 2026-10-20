import { z } from "zod";
import { REVIEW_MAX_CHARS, REVIEW_STATUSES } from "../config/admin.js";
import { paginationShape } from "./pagination.js";

const uuid = z.string().uuid("must be a valid id");

/** POST /api/reviews. `portal_id` omitted or null = a review of the app itself. */
export const createReviewSchema = z
  .object({
    body: z.string().trim().min(1, "is required").max(REVIEW_MAX_CHARS, `must be at most ${REVIEW_MAX_CHARS} characters`),
    portal_id: uuid.nullish(),
  })
  .strict()
  .transform((v) => ({ body: v.body, portalId: v.portal_id ?? null }));

/** GET /api/reviews?portal_id=<uuid> or ?about=app (not both), plus paging. */
export const listReviewsQuerySchema = z
  .object({ portal_id: uuid.optional(), about: z.literal("app").optional(), ...paginationShape })
  .refine((q) => !(q.portal_id && q.about), "use either portal_id or about, not both");

/** GET /api/admin/reviews?status=&page=&page_size= */
export const adminReviewsQuerySchema = z.object({ status: z.enum(REVIEW_STATUSES).optional(), ...paginationShape });

/** PATCH /api/admin/reviews/:id */
export const moderateReviewSchema = z.object({ status: z.enum(REVIEW_STATUSES) }).strict();

export const pageQuerySchema = z.object({ ...paginationShape });
