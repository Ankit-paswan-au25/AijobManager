import { z } from "zod";
import { DEFAULT_MIN_SCORE } from "../config/matching.js";

export const USER_JOB_STATUSES = ["new", "saved", "applied", "interview", "rejected", "archived"];

/** GET /api/jobs?status=&min_score=&sort= (blank values are treated as not provided). */
export const listJobsQuerySchema = z.object({
  status: z.enum(USER_JOB_STATUSES).optional(),
  min_score: z.coerce.number().int().min(0).max(100).default(DEFAULT_MIN_SCORE),
  sort: z.enum(["score", "received_at"]).default("score"),
});

export const jobIdParamsSchema = z.object({ id: z.string().uuid("must be a valid id") });
