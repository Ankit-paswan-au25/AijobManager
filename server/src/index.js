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

const app = createApp({
  config, authService, resumeService, portalService, portalAdminService, gmailService, jobService, matchService,
});
const server = app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
