import { z } from "zod";

const text = (max) => z.string().trim().max(max);
const optionalText = (max) => text(max).default("");

const bullets = z.array(text(500).min(1)).max(20).default([]);

export const MAX_RESUME_BYTES = 5 * 1024 * 1024;

export const createResumeSchema = z
  .object({
    name: text(100).min(1, "is required"),
    contact: z
      .object({
        email: z.union([z.literal(""), text(254).email("must be a valid email")]).default(""),
        phone: optionalText(40),
        location: optionalText(100),
        links: z.array(text(200).min(1)).max(10).default([]),
      })
      .strict()
      .default({}),
    summary: optionalText(2000),
    skills: z.array(text(60).min(1)).max(100).default([]),
    experience: z
      .array(
        z
          .object({
            role: text(100).min(1, "is required"),
            company: text(100).min(1, "is required"),
            dates: optionalText(60),
            bullets,
          })
          .strict(),
      )
      .max(30)
      .default([]),
    education: z
      .array(
        z
          .object({
            institution: text(150).min(1, "is required"),
            degree: optionalText(150),
            dates: optionalText(60),
          })
          .strict(),
      )
      .max(15)
      .default([]),
    projects: z
      .array(
        z
          .object({
            name: text(100).min(1, "is required"),
            description: optionalText(1000),
          })
          .strict(),
      )
      .max(20)
      .default([]),
  })
  .strict()
  .refine(
    (r) =>
      r.summary || r.skills.length || r.experience.length || r.education.length || r.projects.length,
    { message: "Add at least a summary, skills, experience, education or a project" },
  );
