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

const resumeService = createResumeService({
  resumeRepository: createResumeRepository(pool),
  fileStore: createLocalFileStore(config.UPLOAD_DIR),
});

const portalRepository = createPortalRepository(pool);
const portalService = createPortalService({ portalRepository });
const portalAdminService = createPortalAdminService({ portalRepository });

// Gmail is optional: without its env vars the /api/gmail routes answer 503.
const gmailService = config.gmail
  ? createGmailService({
      gmailClient: createGmailClient(config.gmail),
      connectionRepository: createGmailConnectionRepository(pool),
      jobRepository: createJobRepository(pool),
      cipher: createTokenCipher(config.gmail.encryptionKey),
      jwtSecret: config.JWT_SECRET,
    })
  : null;

const app = createApp({ config, authService, resumeService, portalService, portalAdminService, gmailService });
const server = app.listen(config.PORT, () => {
  console.log(`API listening on http://localhost:${config.PORT}`);
});

const shutdown = () => {
  server.close(() => pool.end().then(() => process.exit(0)));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
