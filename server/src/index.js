import { loadConfig } from "./config/env.js";
import { createPool } from "./db/pool.js";
import { createUserRepository } from "./repositories/userRepository.js";
import { createResumeRepository } from "./repositories/resumeRepository.js";
import { createPortalRepository } from "./repositories/portalRepository.js";
import { createLocalFileStore } from "./storage/localFileStore.js";
import { createAuthService } from "./services/authService.js";
import { createResumeService } from "./services/resumeService.js";
import { createPortalService } from "./services/portalService.js";
import { createPortalAdminService } from "./services/portalAdminService.js";
import { createGmailConnectionRepository } from "./repositories/gmailConnectionRepository.js";
import { createJobRepository } from "./repositories/jobRepository.js";
import { createMatchRepository } from "./repositories/matchRepository.js";
import { createAnthropicProvider } from "./services/ai/index.js";
import { createMatchService } from "./services/matchService.js";
import { createJobService } from "./services/jobService.js";
import { createDocumentRepository } from "./repositories/documentRepository.js";
import { createDocumentService } from "./services/documentService.js";
import { createAuditRepository } from "./repositories/auditRepository.js";
import { createReviewRepository } from "./repositories/reviewRepository.js";
import { createAdminUserRepository } from "./repositories/adminUserRepository.js";
import { createAuditService } from "./services/auditService.js";
import { createAdminUserService } from "./services/adminUserService.js";
import { createAdminReviewService } from "./services/adminReviewService.js";
import { createReviewService } from "./services/reviewService.js";
import { createUserJobRepository } from "./repositories/userJobRepository.js";
import { createUserJobService } from "./services/userJobService.js";
import { createDashboardService } from "./services/dashboardService.js";
import { createGmailClient } from "./services/gmail/gmailClient.js";
import { createGmailService } from "./services/gmailService.js";
import { createTokenCipher } from "./lib/tokenCipher.js";
import { createApp } from "./app.js";

const config = loadConfig();
const pool = createPool(config.DATABASE_URL);

const authService = createAuthService({
  userRepository: createUserRepository(pool),
  jwtSecret: config.JWT_SECRET,
  jwtExpiresInDays: config.JWT_EXPIRES_IN_DAYS,
});

const resumeRepository = createResumeRepository(pool);
const jobRepository = createJobRepository(pool);

// AI is optional: without ANTHROPIC_API_KEY jobs still get the skill-overlap score, flagged llm_failed.
const aiProvider = config.anthropic ? createAnthropicProvider(config.anthropic) : null;
const matchService = createMatchService({
  aiProvider,
  matchRepository: createMatchRepository(pool),
  jobRepository,
  resumeRepository,
});
const jobService = createJobService({ jobRepository });
const documentService = createDocumentService({
  aiProvider,
  documentRepository: createDocumentRepository(pool),
  jobRepository,
  resumeRepository,
});

const resumeService = createResumeService({
  resumeRepository,
  fileStore: createLocalFileStore(config.UPLOAD_DIR),
  // Resume changed -> rescore all of this user's jobs (in the background, not on a timer).
  onResumeSaved: (userId) => matchService.rescoreAllForUser(userId),
});

const portalRepository = createPortalRepository(pool);
const portalService = createPortalService({ portalRepository });
const portalAdminService = createPortalAdminService({ portalRepository });

// Gmail is optional: without its env vars the /api/gmail routes answer 503.
const gmailService = config.gmail
  ? createGmailService({
      gmailClient: createGmailClient(config.gmail),
      connectionRepository: createGmailConnectionRepository(pool),
      jobRepository,
      cipher: createTokenCipher(config.gmail.encryptionKey),
      jwtSecret: config.JWT_SECRET,
      // Jobs added by a sync get scored in the background.
      onJobsSaved: (userId) => matchService.scoreUnscoredForUser(userId),
    })
  : null;

const auditRepository = createAuditRepository(pool);
const reviewRepository = createReviewRepository(pool);
const auditService = createAuditService({ auditRepository });
const adminUserService = createAdminUserService({
  adminUserRepository: createAdminUserRepository(pool),
  userRepository: createUserRepository(pool),
  resumeRepository,
  auditRepository,
});
const adminReviewService = createAdminReviewService({ reviewRepository });
const reviewService = createReviewService({ reviewRepository, portalRepository });

const userJobService = createUserJobService({ userJobRepository: createUserJobRepository(pool) });
const dashboardService = createDashboardService({ jobRepository, portalService });

const app = createApp({
  config, authService, resumeService, portalService, portalAdminService, gmailService, jobService, matchService, documentService,
  userJobService, dashboardService,
  auditRepository, auditService, adminUserService, adminReviewService, reviewService,
});
const server = app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
