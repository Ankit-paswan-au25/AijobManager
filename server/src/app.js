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
import { createUserJobsRouter } from "./routes/userJobs.js";
import { createDashboardRouter } from "./routes/dashboard.js";
import { createReviewsRouter } from "./routes/reviews.js";
import { createAdminConsoleRouter } from "./routes/adminConsole.js";
import { createAuditedPortalAdminService } from "./services/auditedPortalAdminService.js";
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
  jobService = null, matchService = null, documentService = null, userJobService = null, dashboardService = null,
  // Admin area. Without auditRepository, portal approve/reject are not logged (only the tests that predate it omit it).
  auditRepository = null, auditService = null, adminUserService = null, adminReviewService = null, reviewService = null,
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
  // The portal review routes and service are unchanged; the wrapper only adds the audit-log write after approve/reject.
  const auditedPortalAdminService = auditRepository
    ? createAuditedPortalAdminService({ portalAdminService, auditRepository })
    : portalAdminService;
  app.use("/api/admin", createAdminRouter({ portalAdminService: auditedPortalAdminService, requireAuth, requireAdmin }));
  if (adminUserService && adminReviewService && auditService) {
    app.use("/api/admin", createAdminConsoleRouter({ adminUserService, adminReviewService, auditService, requireAuth, requireAdmin }));
  }
  if (reviewService) app.use("/api/reviews", createReviewsRouter({ reviewService, requireAuth, requireResume }));

  app.use("/api/gmail", createGmailRouter({ gmailService, requireAuth, requireResume, config }));

  if (jobService && matchService) {
    app.use("/api/jobs", createJobsRouter({ jobService, matchService, documentService, requireAuth, requireResume }));
  }

  if (userJobService) app.use("/api/user-jobs", createUserJobsRouter({ userJobService, requireAuth, requireResume }));
  if (dashboardService) app.use("/api/dashboard", createDashboardRouter({ dashboardService, requireAuth, requireResume }));

  // TODO(later phases): mount further routers here, behind requireResume.

  app.use("/api", notFoundHandler);
  app.use(errorHandler);
  return app;
}
