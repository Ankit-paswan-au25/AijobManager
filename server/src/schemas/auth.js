import { z } from "zod";

const email = z.string().trim().min(3).max(254).email("must be a valid email");

/** Optional free text. Blank or missing becomes null. */
const optionalPlace = z
  .string()
  .trim()
  .max(100, "must be at most 100 characters")
  .nullish()
  .transform((s) => s || null);

export const signupSchema = z
  .object({
    email,
    fullName: z.string().trim().min(1, "is required").max(100),
    country: optionalPlace,
    city: optionalPlace,
    password: z
      .string()
      .min(10, "must be at least 10 characters")
      // bcrypt only uses the first 72 bytes; reject longer input rather than silently truncating.
      .refine((p) => Buffer.byteLength(p, "utf8") <= 72, "must be at most 72 bytes"),
  })
  .strict();

// Login does not enforce password rules, only that something was provided.
export const loginSchema = z
  .object({
    email,
    password: z.string().min(1).max(256),
  })
  .strict();
