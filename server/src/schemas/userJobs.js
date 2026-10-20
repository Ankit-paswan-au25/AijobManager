import { z } from "zod";
import { USER_JOB_STATUSES } from "./jobs.js";

const interviewDate = z
  .string()
  .datetime({ offset: true, message: "must be an ISO 8601 date and time, e.g. 2026-11-03T10:30:00Z" })
  .refine((s) => !Number.isNaN(Date.parse(s)), "must be a real date")
  .transform((s) => new Date(s));

const interviewNotes = z
  .string()
  .max(2000, "must be at most 2000 characters")
  .transform((s) => s.trim() || null);

/**
 * PATCH /api/user-jobs/:id. Any of the three fields, at least one.
 * `interview_date` and `interview_notes` may be null to clear them.
 * The body is snake_case like the column names; the parsed result is the camelCase patch the service uses.
 */
export const updateUserJobSchema = z
  .object({
    status: z.enum(USER_JOB_STATUSES).optional(),
    interview_date: interviewDate.nullable().optional(),
    interview_notes: interviewNotes.nullable().optional(),
  })
  .strict()
  .refine((v) => Object.keys(v).length > 0, "send at least one of status, interview_date, interview_notes")
  .transform((v) => ({
    status: v.status,
    interviewDate: v.interview_date,
    interviewNotes: v.interview_notes,
  }));

export const userJobIdParamsSchema = z.object({ id: z.string().uuid("must be a valid id") });
