import { z } from "zod";
import { normalizePortalUrl } from "../lib/portalUrl.js";

export const submitPortalSchema = z
  .object({
    name: z.string().trim().min(1, "is required").max(80),
    baseUrl: z
      .string()
      .trim()
      .min(1, "is required")
      .max(300)
      .refine((v) => normalizePortalUrl(v) !== null, "must be a public website address (http or https)"),
  })
  .strict();

export const setSelectionSchema = z
  .object({ portalIds: z.array(z.string().uuid("must be a valid id")).max(50) })
  .strict();

export const rejectPortalSchema = z
  .object({ reason: z.string().trim().min(1, "is required").max(500) })
  .strict();

export const idParamSchema = z.object({ id: z.string().uuid("must be a valid id") });
