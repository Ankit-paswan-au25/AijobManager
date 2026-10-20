import express from "express";
import helmet from "helmet";
import cookieParser from "cookie-parser";
import { createAuthRouter } from "./routes/auth.js";
import { createResumesRouter } from "./routes/resumes.js";
import { createPortalsRouter } from "./routes/portals.js";
import { createUsersRouter } from "./routes/users.js";
import { createAdminRouter } from "./routes/admin.js";
import { createGmailRouter } from "./routes/gmail.js";
import { createJobsRouter } from "./routes/jobs.js";
import { createRequireAuth } from "./middleware/requireAuth.js";
import { createRequireResume } from "./middleware/requireResume.js";
import { requireAdmin } from "./middleware/requireAdmin.js";
import { errorHandler, notFoundHandler } from "./middleware/errorHandler.js";

/**
 * Builds the Express app from already-constructed services.
 * No request logging middleware is used on purpose: bodies contain passwords and resumes.
 * Uploaded files are never served statically; they are only read by server code.
 */
export function createApp({
  config, authService, resumeService, portalService, portalAdminService, gmailService = null,
  jobService = null, matchService = null, documentService = null,
}) {
  const app = express();
  app.disable("x-powered-by");
  app.use(helmet());
  app.use(express.json({ limit: "200kb" }));
  app.use(cookieParser());

  const requireAuth = createRequireAuth(authService);
  const requireResume = createRequireResume(resumeService);

  app.get("/api/health", (_req, res) => res.json({ status: "ok" }));
  app.use("/api/auth", createAuthRouter({ authService, requireAuth, config }));
  app.use("/api/resumes", createResumesRouter({ resumeService, requireAuth }));
  app.use("/api/portals", createPortalsRouter({ portalService, requireAuth, requireResume }));
  app.use("/api/users", createUsersRouter({ portalService, requireAuth, requireResume }));
  // Admin routes don't need a resume: reviewing portals isn't part of the job-seeker flow.
  app.use("/api/admin", createAdminRouter({ portalAdminService, requireAuth, requireAdmin }));

  app.use("/api/gmail", createGmailRouter({ gmailService, requireAuth, requireResume, config }));

  if (jobService && matchService) {
    app.use("/api/jobs", createJobsRouter({ jobService, matchService, documentService, requireAuth, requireResume }));
  }

  // TODO(later phases): mount further routers here, behind requireResume.

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
